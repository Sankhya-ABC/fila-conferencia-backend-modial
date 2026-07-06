import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { DownloadService, DownloadListado } from './download.service';

// Rotas publicas de proposito: sem @UseGuards(AuthUserGuard) e sem sessao de
// tenant - os arquivos precisam poder ser baixados mesmo sem login (ex: link
// de suporte, primeira instalacao de um agente). @NoAuthApp() so libera o
// guard global de app; aqui nao aplicamos nenhum guard adicional.
@NoAuthApp()
@ApiTags('Downloads')
@Controller('downloads')
export class DownloadController {
  constructor(private readonly service: DownloadService) {}

  @Get()
  @ApiOperation({ summary: 'Listar downloads disponíveis' })
  listar(): DownloadListado[] {
    return this.service.listar();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Baixar o arquivo mais recente de um item da lista' })
  baixar(@Param('id') id: string): StreamableFile {
    const { caminho, nomeArquivo } = this.service.caminhoPorId(id);
    const stream = createReadStream(caminho);
    return new StreamableFile(stream, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${nomeArquivo}"`,
    });
  }
}
