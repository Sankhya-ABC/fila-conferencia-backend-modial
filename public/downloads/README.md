# Downloads públicos

Esta pasta é servida via `GET /api/downloads` (lista) e `GET /api/downloads/:id`
(baixa o arquivo de um item) — ver `src/modules/download`. Binários e
`manifest.json` **não vão para o git** — são copiados manualmente (ou por CI)
no deploy. A tela "Downloads" do Portal lista aqui o conteúdo de `manifest.json`.

## Formato do `manifest.json`

```json
{
  "items": [
    {
      "id": "agente-balanca",
      "nome": "Agente de Balanças",
      "descricao": "Aplicativo desktop (Windows) que conecta as balanças seriais da estação ao sistema.",
      "versao": "1.0.1",
      "arquivo": "agente-balanca-setup-1.0.1.exe"
    }
  ]
}
```

Cada item vira uma linha na tela Downloads, com `nome`/`descricao`/`versao`
exibidos e um botão que baixa `arquivo`. Para adicionar um novo download
(qualquer arquivo, não só o agente), basta colocar o arquivo nesta pasta e
acrescentar um item ao `manifest.json` — nenhuma mudança de código é
necessária.

## Publicar uma nova versão do Agente de Balanças

1. Gere o instalador no projeto `fila-conferencia-agente-local`:
   ```
   npm run dist:win
   ```
2. Copie o `.exe` resultante (`dist/agente-balanca-setup-<versao>.exe`) para
   esta pasta.
3. Atualize o item `"id": "agente-balanca"` no `manifest.json` (`versao` e
   `arquivo`).
4. Faça o deploy do backend normalmente. `GET /api/downloads/agente-balanca`
   passa a servir o novo instalador automaticamente.
