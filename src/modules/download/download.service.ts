import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DOWNLOADS_DIR = join(process.cwd(), 'public', 'downloads');
const MANIFEST_PATH = join(DOWNLOADS_DIR, 'manifest.json');

interface ManifestItem {
  id: string;
  nome: string;
  descricao: string;
  versao: string;
  arquivo: string;
}

interface Manifest {
  items: ManifestItem[];
}

export interface DownloadListado {
  id: string;
  nome: string;
  descricao: string;
  versao: string;
}

@Injectable()
export class DownloadService {
  private lerManifest(): Manifest {
    if (!existsSync(MANIFEST_PATH)) {
      return { items: [] };
    }
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  }

  listar(): DownloadListado[] {
    return this.lerManifest().items.map(({ id, nome, descricao, versao }) => ({
      id,
      nome,
      descricao,
      versao,
    }));
  }

  caminhoPorId(id: string): { caminho: string; nomeArquivo: string } {
    const item = this.lerManifest().items.find((i) => i.id === id);
    if (!item) {
      throw new NotFoundException(`Download "${id}" não encontrado.`);
    }

    const caminho = join(DOWNLOADS_DIR, item.arquivo);
    if (!existsSync(caminho)) {
      throw new NotFoundException(`Arquivo de "${item.nome}" não encontrado no servidor.`);
    }

    return { caminho, nomeArquivo: item.arquivo };
  }
}
