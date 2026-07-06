# Fila de Conferência
## Solução de Conferência Física Integrada ao Sankhya ERP

---

> **Sistema desenvolvido sob medida para otimizar o processo de conferência física de cargas, eliminando retrabalho, aumentando a rastreabilidade e acelerando a expedição — totalmente integrado ao seu Sankhya.**

---

## O desafio que você enfrenta hoje

Na maioria das operações logísticas que utilizam Sankhya, a conferência física de pedidos é um gargalo:

- O módulo nativo do ERP não foi projetado para o ritmo do chão de fábrica
- Separadores precisam alternar entre mouse, teclado e leitor de barcode constantemente
- Não há visibilidade em tempo real de quem está conferindo o quê
- Erros de quantidade só são descobertos depois — gerando retrabalho e reclamações de clientes
- Não existe integração com balanças físicas para produtos vendidos por peso
- Gestão de volumes e cubagem é manual e sujeita a falhas

---

## O que é a Fila de Conferência

A **Fila de Conferência** é um sistema web desenvolvido especificamente para operar integrado ao Sankhya, adicionando uma camada de execução moderna ao processo de conferência física.

O separador acessa pelo navegador — em qualquer computador ou tablet da expedição — e passa a trabalhar com uma interface construída para leitura de código de barras, gestão de volumes e captura de peso, enquanto todos os dados são gravados automaticamente no ERP em tempo real.

---

## Para cada perfil da sua equipe

### Separador (operador de chão de fábrica)

**Antes:** abria o Sankhya, navegava por menus, precisava usar mouse para registrar cada item conferido, perdia tempo buscando produtos sem imagem.

**Agora:**
- Visualiza a fila de pedidos prontos para conferência em uma tela clara e atualizada automaticamente
- Bipa o código de barras do produto — o sistema identifica, registra e atualiza o contador instantaneamente
- Vê a foto do produto na tela durante a conferência — zero dúvidas sobre o item correto
- Cria volumes, define dimensões e move itens entre caixas com dois cliques
- Conecta uma balança física: o sistema captura o peso automaticamente quando a leitura estabiliza (sem pressionar nenhum botão)
- Imprime etiquetas de volumes diretamente da tela de conferência

### Supervisor / Administrador Logístico

**Antes:** não havia visibilidade do que estava sendo conferido em tempo real. Produtividade era estimada manualmente ao final do dia.

**Agora:**
- Dashboard em tempo real: quem está trabalhando agora, quantas conferências foram finalizadas, tempo médio por pedido
- Ranking de produtividade dos separadores — itens/hora, bipagens, cubagens
- Heatmap de atividade: em quais dias e horários a equipe é mais produtiva
- Histórico completo de cada conferência com rastreabilidade individual

### Gerente de TI / Responsável pela Implantação

- Sistema containerizado: instalação padronizada, sem dependência de configurações manuais de servidor
- Banco de dados isolado por empresa: dados de um cliente nunca se misturam com outro
- Configuração de módulos por empresa: funcionalidades opcionais (cubagem, tipo de entrega, número do talão) ativadas ou desativadas sem alterar código
- Suporte ao banco Oracle e SQL Server no lado do Sankhya
- Painel administrativo centralizado para gestão de múltiplas empresas

---

## Principais funcionalidades

### Fila de Conferência
- Visualização de todos os pedidos liberados para conferência, com atualização automática
- Filtros por parceiro, empresa, tipo de operação, tipo de entrega, número do talão, período e status
- Indicação visual clara do status de cada pedido (aguardando, em conferência, finalizado)

### Tela de Conferência
- Interface otimizada para leitura de código de barras — o separador não precisa tocar no mouse
- Resolução automática de barcode por múltiplas estratégias (código do produto, referência, unidade alternativa, estoque)
- Exibição de imagem do produto durante a conferência
- Controle de quantidades: negociada vs. conferida, com alerta visual de divergência
- Suporte a produtos controlados por número de série, lote ou peso

### Gestão de Volumes
- Criação de volumes individuais ou em lote (ex.: "criar 10 volumes de 30×20×20cm, 5kg cada")
- Movimentação de itens entre volumes com rastreabilidade completa
- Cubagem detalhada (por volume) ou simplificada (por grupo de dimensão)
- Integração automática com a entidade de cubagem do Sankhya (AD_CUBAGEM)

### Integração com Balanças
- Suporte a balanças seriais (RS-232), USB, TCP e HTTP
- Captura automática de peso: quando a leitura estabiliza por 2 segundos, o sistema preenche o campo automaticamente
- Configuração de múltiplas balanças por empresa, com teste de conexão direto no painel

### Dashboard de Produtividade
- KPIs globais: conferências finalizadas, tempo médio, itens por hora, peso total conferido
- Ranking individual de separadores
- Picos de atividade por hora do dia (0h–23h)
- Heatmap de atividade por dia da semana × hora
- Filtros por período (hoje, semana, mês ou intervalo personalizado) e por separador

### Gestão de Usuários
- Perfis distintos: Administrador e Separador
- Ativação/inativação de usuários sem exclusão
- Recuperação de senha por e-mail com link seguro e validade de 30 minutos
- Redefinição e ativação em lote para onboarding de novos separadores

---

## Integração com o Sankhya

O sistema se comunica exclusivamente via **API oficial do Sankhya** — nenhuma alteração é feita diretamente no banco de dados do ERP.

Todos os registros gerados pela conferência são gravados nas entidades corretas do Sankhya:

| O sistema grava em | O que representa |
|---|---|
| TGFCON2 | Registro da conferência (abertura e fechamento) |
| TGFVCF | Volumes conferidos |
| TGFIVC | Itens por volume |
| TGFCOI2 | Totais conferidos por produto |
| AD_CUBAGEM | Dimensões físicas por volume |
| TGFITE | Peso bruto/líquido de produtos pesáveis |
| TGFCAB | Quantidade de volumes e peso total da nota |

Ao finalizar a conferência no sistema, as stored procedures padrão do Sankhya (`ConferenciaSP.cortar` e `ConferenciaSP.finalizarConferencia`) são chamadas automaticamente, garantindo que toda a lógica do ERP seja respeitada.

---

## Arquitetura e segurança

### Dados isolados por empresa
Cada empresa cliente opera em um banco de dados PostgreSQL independente. Não há risco de vazamento de dados entre clientes.

### Autenticação segura
- Login com e-mail e senha (criptografia bcrypt)
- Sessão gerenciada via Redis com token único por usuário
- Proteção contra força bruta: limite de tentativas de login por IP
- Recuperação de senha com token temporário (validade de 30 minutos)

### Alta disponibilidade
- Infraestrutura containerizada com Docker: reinicialização automática em caso de falha
- Cache em memória para a fila de conferência: o sistema responde em menos de 50ms mesmo com alto volume de pedidos
- Dados críticos da sessão de conferência mantidos em banco local: uma queda de conexão com o Sankhya não interrompe o trabalho do separador

### Performance
- Primeiro carregamento da fila: ~4 segundos
- Acessos subsequentes (com cache): menos de 50 milissegundos
- Carregamento da sessão de conferência em background: o separador não espera o ERP responder para começar a trabalhar

---

## Módulos opcionais (ativados por empresa)

| Módulo | Funcionalidade |
|---|---|
| **AD_NUMTALAO** | Exibe e filtra número do talão/romaneio da transportadora na fila |
| **AD_TIPOENTREGA** | Exibe e filtra tipo de entrega (CIF, FOB, Terceiros, Redespacho) |
| **AD_CUBAGEM** | Habilita gestão de dimensões físicas dos volumes e integração com AD_CUBAGEM do Sankhya |

Cada módulo é ativado ou desativado individualmente para cada empresa, sem alteração de código e sem necessidade de reinicialização.

---

## O que está incluído na entrega

- Sistema backend (API REST) instalado e configurado no servidor
- Sistema frontend (aplicação web) acessível por navegador
- Banco de dados configurado e com todos os dados iniciais
- Integração completa com o Sankhya (configurada e testada)
- Treinamento da equipe de separadores e administradores
- Documentação técnica e de uso
- Suporte pós-implantação

---

## Perguntas frequentes

**O sistema altera alguma configuração do Sankhya?**
Não. O sistema usa exclusivamente a API oficial do Sankhya para leitura e gravação. Não há acesso direto ao banco de dados do ERP.

**Funciona com qualquer versão do Sankhya?**
Funciona com Sankhya W (versões recentes). A compatibilidade específica é verificada durante a implantação.

**Precisa instalar algum programa nos computadores dos separadores?**
Não. O sistema é acessado pelo navegador (Chrome recomendado). Não há instalação nos computadores de uso.

**O sistema funciona se a internet cair?**
A sessão de conferência em andamento continua funcionando para operações locais (bipes já registrados permanecem). A comunicação com o Sankhya é retomada automaticamente quando a conexão for restaurada.

**Quantos separadores podem usar ao mesmo tempo?**
Não há limite definido por licença. O limite prático depende do dimensionamento do servidor, que é planejado conforme o volume de operações da empresa.

**Os dados ficam no servidor da minha empresa ou em nuvem?**
A arquitetura é flexível: pode ser instalado no servidor interno da empresa ou em servidor de nuvem (AWS, Azure, DigitalOcean, etc.).

**E se precisarmos de uma funcionalidade específica que não existe?**
O sistema foi desenvolvido com arquitetura modular e já possui múltiplos módulos opcionais. Customizações são avaliadas e orçadas individualmente.

---

*Fila de Conferência — desenvolvido por Sankhya ABC Paulista*
*Versão 1.0 — Junho/2026*
