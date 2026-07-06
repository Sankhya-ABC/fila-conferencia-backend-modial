# Fila de Conferência — Documentação Técnica & Comercial

---

## Índice

1. [Visão Comercial](#1-visão-comercial)
2. [Arquitetura Geral](#2-arquitetura-geral)
3. [Infraestrutura e Deploy](#3-infraestrutura-e-deploy)
4. [Multitenancy](#4-multitenancy)
5. [Integração Sankhya](#5-integração-sankhya)
6. [Módulos Opcionais Sankhya](#6-módulos-opcionais-sankhya)
7. [Fluxo Completo de Conferência](#7-fluxo-completo-de-conferência)
8. [Módulos do Backend](#8-módulos-do-backend)
9. [Páginas do Frontend](#9-páginas-do-frontend)
10. [Schema do Banco de Dados](#10-schema-do-banco-de-dados)
11. [Autenticação e Controle de Acesso](#11-autenticação-e-controle-de-acesso)
12. [Integração com Balanças](#12-integração-com-balanças)
13. [Sincronização de Dados](#13-sincronização-de-dados)
14. [Performance e Cache](#14-performance-e-cache)
15. [Gestão Multi-empresa (Master)](#15-gestão-multi-empresa-master)
16. [Variáveis de Ambiente](#16-variáveis-de-ambiente)
17. [Procedures de Deploy](#17-procedures-de-deploy)
18. [Referência de Endpoints](#18-referência-de-endpoints)

---

# 1. Visão Comercial

## O Problema

O módulo de conferência nativo do Sankhya ERP possui limitações de performance e usabilidade no chão de fábrica: a interface não é otimizada para operação via leitor de código de barras, não oferece gestão visual de volumes, não integra com balanças físicas e não permite que múltiplos separadores trabalhem em paralelo com rastreabilidade individual.

## A Solução

**Fila de Conferência** é um sistema web SaaS que replica e estende o fluxo de conferência física do Sankhya, operando como uma camada de execução externa ao ERP, completamente integrada ao banco de dados Sankhya via API oficial.

### O que o sistema entrega

**Para o separador (operador de chão de fábrica)**
- Fila visual de pedidos aguardando conferência, com atualização automática a cada 60 segundos
- Tela de conferência otimizada para leitores de código de barras — bipagem rápida sem mouse
- Gestão de volumes: criar, remover, mover itens entre volumes, atribuir dimensões físicas
- Integração com balanças físicas (serial RS-232/USB, TCP e HTTP) — captura de peso automática ao estabilizar
- Visualização de imagens dos produtos durante a conferência
- Suporte a UMAs (Unidades de Movimentação e Armazenagem)
- Resolução inteligente de código de barras por 5 estratégias (automático, código do produto, referência, unidade alternativa, estoque)

**Para o administrador logístico**
- Dashboard de produtividade em tempo real: KPIs globais, ranking de separadores, picos por hora, heatmap de atividade por dia/hora
- Gestão de usuários com perfis distintos (Administrador e Separador)
- Configuração de balanças por empresa
- Relatórios e etiquetas de volumes para impressão

**Para o gestor de TI / implantador**
- Arquitetura multitenant: uma única instalação atende múltiplas empresas, com banco de dados isolado por cliente
- Configuração de módulos opcionais por empresa (AD_NUMTALAO, AD_TIPOENTREGA, AD_CUBAGEM)
- Suporte a Sankhya com banco Oracle e SQL Server
- Deploy containerizado com Docker Compose
- Painel master para provisionamento de novas empresas sem intervenção no código

### Diferenciais competitivos

| Característica | Sankhya Nativo | Fila de Conferência |
|---|---|---|
| Interface para leitura de barcode | Não otimizada | Otimizada — bipagem sem mouse |
| Integração com balanças | Não | Sim (RS-232, USB, TCP, HTTP) |
| Captura automática de peso | Não | Sim (estabilização em 2 segundos) |
| Gestão visual de volumes | Limitada | Completa |
| Dashboard de produtividade | Não | Sim, com ranking individual |
| Multi-empresa / SaaS | Não | Sim, banco isolado por cliente |
| Performance offline/cache | Não | Sim, cache local com <50ms |
| Módulos configuráveis por empresa | Não | Sim |

---

# 2. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE (Navegador)                   │
│              Angular 17 SPA (Standalone)                 │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTPS / REST JSON
┌─────────────────▼───────────────────────────────────────┐
│                  BACKEND (NestJS 10)                     │
│  ┌────────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ Conferência│  │  Sessão  │  │    Sincronização   │   │
│  │ Separação  │  │  Volume  │  │    (Cron Jobs)     │   │
│  │ Dashboard  │  │  Balança │  │                    │   │
│  └────────────┘  └──────────┘  └───────────────────┘   │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Core: Auth / Tenant / Cache             │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │    HTTP Clients: Gateway / LoadRecords /        │    │
│  │    DatasetSP / DbExplorerSP                     │    │
│  └─────────────────────────────────────────────────┘    │
└──────┬────────────────────┬────────────────────────┬────┘
       │                    │                        │
┌──────▼──────┐  ┌──────────▼──────────┐  ┌────────▼────┐
│  PostgreSQL  │  │  Redis (sessões e   │  │  Sankhya    │
│  Admin DB +  │  │  cache de tokens)  │  │  ERP via    │
│  1 DB/tenant │  └─────────────────────┘  │  API REST   │
└──────────────┘                           └─────────────┘
```

### Stack tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| Backend | NestJS | 10.x |
| Frontend | Angular | 17.x (Standalone) |
| Banco de dados | PostgreSQL | 15 |
| Cache / Sessões | Redis | 7 |
| ORM | Prisma | 5.x |
| Containerização | Docker + Docker Compose | — |
| Node.js | Node.js | 20 (LTS) |

---

# 3. Infraestrutura e Deploy

## Serviços Docker (Produção)

```yaml
# docker-compose.prod.yml
services:
  app:          # Backend NestJS
    build: Dockerfile.prod
    container: fila-conf-backend
    port: 3001→3000
    command: prisma migrate deploy && node dist/src/main

  db:           # PostgreSQL 15
    image: postgres:15
    container: fila-conf-db
    config: max_connections=300
    volumes: postgres_data (persistente)

  redis:        # Redis 7
    image: redis:7-alpine
    container: fila-conf-redis
    config: appendonly yes, maxmemory 256mb, allkeys-lru
    volumes: redis_data (persistente)
```

## Dockerfile de Produção

- Base: `node:20-slim`
- Dependências extras: `openssl`, `chromium` (para geração de PDFs de etiquetas)
- Build: `npm ci` → `prisma generate` → `npm run build` → `npm prune --omit=dev`
- Porta exposta: 3000

## Bancos de Dados

O sistema utiliza **múltiplos bancos PostgreSQL** na mesma instância:

| Banco | Propósito |
|---|---|
| `fila_conferencia_admin` | Registro de tenants, usuários master, TenantUser (mapeamento e-mail→tenant) |
| `fila_conferencia_<slug>` | Dados isolados de cada empresa cliente (sessões, usuários, produtos cache, balanças) |

---

# 4. Multitenancy

## Conceito

Cada empresa cliente (tenant) possui banco de dados PostgreSQL completamente isolado. O código de negócio não conhece o conceito de "tenant" — o isolamento é transparente via `AsyncLocalStorage`.

## Fluxo por Requisição

```
1. Requisição chega com token Bearer
2. TenantMiddleware:
   a. Valida token no Redis → obtém { tenantSlug, userId, ... }
   b. Executa handler dentro de: tenantStorage.run(slug, handler)
3. Toda chamada a PrismaService/GatewayClient lê tenantStorage.getStore()
   para usar a conexão e as credenciais do tenant correto
4. Resposta retorna ao cliente
```

## Implementação

```
src/core/tenant/
├── tenant.context.ts    → AsyncLocalStorage<string> (slug do tenant)
├── tenant.middleware.ts → injeta slug no contexto assíncrono
├── tenant.service.ts    → PrismaClient por slug (pool de 10 conn cada)
│                           configCache (TTL 5min) para credenciais Sankhya
│                           hasModulo(slug, modulo) → boolean
└── tenant.module.ts     → exporta TenantService globalmente
```

## Provisionamento de Novo Tenant

`POST /master/tenants` executa automaticamente:
1. `docker exec fila-conf-db psql` — cria banco PostgreSQL `fila_conferencia_<slug>`
2. `prisma migrate deploy` — aplica todas as migrations no novo banco
3. Registra o tenant no `fila_conferencia_admin`

---

# 5. Integração Sankhya

## Clientes HTTP

| Cliente | Serviço Sankhya | Uso principal |
|---|---|---|
| `GatewayClient` | Auth OAuth + proxy de requisições | Base de todos os outros clients; gerencia sessão HTTP, keepAlive TCP |
| `SankhyaLoadRecordsClient` | `CRUDServiceProvider.loadRecords` | Consultas paginadas a entidades do ERP (`outputType=json`) |
| `SankhyaDatasetSPClient` | `DatasetSP.save` | Inserções e atualizações de registros no ERP |
| `SankhyaDBExplorerSPClient` | `DbExplorerSP.executeQuery` | SQL raw no banco do ERP (para imagens e estoques) |

## Regras de Integração LoadRecords

- Parâmetros sempre passados como `f0`, `f1`, `f2`... (não como `:p1`)
- `outputType=json` obrigatório em todas as requisições
- Campos `AD_*` ausentes causam erro `CORE_E04064` → o cliente detecta, remove o campo e refaz a requisição automaticamente (WARN no log)
- Chave `parameter` omitida quando não há parâmetros (evita bug do Gateway)

## Entidades Sankhya Consumidas

| Entidade Sankhya | Tabela ERP | Operação | Módulo |
|---|---|---|---|
| CabecalhoNota | TGFCAB | Read + Write (peso, obs, QTDVOL) | Core |
| CabecalhoConferencia | TGFCON2 | Read + Write (criar, finalizar, cancelar) | Core |
| ItemNota | TGFITE | Read + Write (peso pesável) | Core |
| VolumeConferencia | TGFVCF | Write (volumes modo detalhado) | Core |
| ItemVolumeConferencia | TGFIVC | Write (itens por volume) | Core |
| DetalhesConferencia | TGFCOI2 | Write (totais conferidos) | Core |
| ConfiguracaoConferencia | TGFCCO | Read (regras de conferência) | Core |
| ControleNumeracao | TGFNUN | Read + Write (próximo número) | Core |
| TipoOperacao | TGFTOP | Read (sincronização periódica) | Core |
| Produto | TGFPRO | Read (sincronização periódica + imagens) | Core |
| CodigoBarras | TGFBAR | Read (sincronização periódica) | Core |
| VolumeAlternativo | TGFVOA | Read (sincronização periódica) | Core |
| UnidadeMovArmazenagemProduto | TGFUMA | Read (modo UMA) | Core |
| TGFEST | TGFEST | Read via SQL raw (códigos de barras de estoque) | Core |
| Parceiro | TGFPAR | Read (nome na fila + etiquetas) | Core |
| Vendedor | — | Read (nome na fila) | Core |
| AD_CUBAGEM | AD_CUBAGEM | Write (dimensões por volume) | Opcional |

## Stored Procedures Sankhya

| Procedure | Momento | Função |
|---|---|---|
| `ConferenciaSP.cortar` | Finalização | Processa divergências de quantidade entre pedido e conferido |
| `ConferenciaSP.finalizarConferencia` | Finalização | Fecha a conferência, gera registros financeiros, carimba DHFINCONF |

## Suporte a Dialetos SQL

O campo `dbDialect` do Tenant controla o SQL raw usado em DbExplorerSP:

| Tenant | Dialeto | Banco ERP | SQL específico para imagens |
|---|---|---|---|
| Negri | `ORACLE` | Oracle | `RAWTOHEX(DBMS_LOB.SUBSTR(IMAGEM, ...))` |
| Modial | `SQLSERVER` | SQL Server | `CONVERT(NVARCHAR(MAX), CAST(IMAGEM AS VARBINARY(MAX)), 2)` |

---

# 6. Módulos Opcionais Sankhya

O campo `snkModulos` no registro do Tenant é uma lista CSV de módulos Sankhya personalizados ativos para aquela empresa. Cada módulo é verificado via `TenantService.hasModulo()` antes de ser incluído em qualquer requisição ao ERP.

**Padrão:** `AD_NUMTALAO,AD_TIPOENTREGA,AD_CUBAGEM`

## AD_NUMTALAO

Campo personalizado em `TGFCAB` (CabecalhoNota).

**Função:** número do talão/romaneio de transporte (ex.: número Modial da transportadora).

**Impacto quando ativo:**
- Coluna "Nº Talão" exibida na fila de conferência
- Filtro de busca por número do talão disponível na fila
- Campo incluído no retorno das conferências ativas e finalizadas
- Campo incluído nas etiquetas de volume geradas

## AD_TIPOENTREGA

Campo personalizado em `TGFCAB`.

**Função:** tipo de entrega do frete (CIF, FOB, Terceiros, Redespacho, etc.).

**Impacto quando ativo:**
- Coluna "Tipo Entrega" exibida na fila de conferência
- Filtro por tipo de entrega disponível na fila
- Mapeamento de rótulos: `'1'`→CIF, `'F'`→FOB, `'T'`→Terceiros, `'R'`→Redespacho

## AD_CUBAGEM

Entidade personalizada no Sankhya, chave `NUCONF`.

**Função:** armazena dimensões físicas (altura, largura, comprimento, peso) por volume de conferência.

**Impacto quando ativo:**
- Campos de dimensão habilitados na tela de conferência
- Finalização grava dimensões em `AD_CUBAGEM` no ERP:
  - **Modo detalhado:** uma linha por volume com `SEQVOL` + dimensões
  - **Modo simplificado (T/S):** agrupa volumes por grupo de dimensão, grava `QTDVOL` por grupo
- `TGFCON2.QTDVOL` e `TGFCAB.QTDVOL` são atualizados com total de volumes

## Como ativar/desativar módulos

No painel Master (`/master/tenants/:slug`), editar o campo **Módulos Sankhya** e adicionar ou remover o módulo da lista CSV. O sistema aplica imediatamente nas próximas requisições sem necessidade de reinicialização.

---

# 7. Fluxo Completo de Conferência

```
SEPARADOR                   FRONTEND              BACKEND              SANKHYA ERP
    │                           │                     │                     │
    │── Acessa fila ────────────►                     │                     │
    │                           │── GET /conferencias►│                     │
    │                           │                     │── LoadRecords ──────►
    │                           │                     │   (TGFCAB + TGFCON2)│
    │                           │◄── lista de pedidos─┤◄────────────────────┤
    │◄── Exibe fila ────────────┤                     │                     │
    │                           │                     │                     │
    │── Clica "Conferir" ───────►                     │                     │
    │                           │─ POST /iniciar ─────►                     │
    │                           │                     │── Valida status ────►
    │                           │                     │── Obtém nº conferência (TGFNUN)
    │                           │                     │── DatasetSP (TGFCON2)►
    │                           │                     │── Vincula NUCONFATUAL►
    │                           │◄── { sessaoId } ────┤                     │
    │                           │                     │                     │
    │                           │   [background]      │── LoadRecords itens►
    │                           │                     │── Códigos de barras ►
    │                           │                     │── UMAs, imagens ────►
    │                           │                     │── Bulk insert local  │
    │                           │                     │   (PostgreSQL)       │
    │                           │                     │                     │
    │                           │── polling GET /sessao-pronta ──────────────
    │                           │◄── { pronta: true } ─────────────────────┤
    │                           │                     │                     │
    │── Bipa produto ───────────►                     │                     │
    │                           │─ POST /resolver-cb──►                     │
    │                           │◄── { produto, unidade, controle } ────────
    │                           │─ POST /item-conferido-volume ──────────────
    │                           │◄── { qtdConferida } ─┤                    │
    │◄── Atualiza contador ─────┤                     │                     │
    │                           │                     │                     │
    │   [produto pesável]       │                     │                     │
    │── Captura peso (balança) ─►                     │                     │
    │                           │─ PATCH /item-peso ──►── DatasetSP ────────►
    │                           │                     │   (TGFITE.PESOBRUTO) │
    │                           │                     │                     │
    │── Finalizar ──────────────►                     │                     │
    │                           │─ POST /finalizar ───►                     │
    │                           │                     │── DatasetSP TGFVCF─►│
    │                           │                     │── DatasetSP TGFIVC─►│
    │                           │                     │── DatasetSP TGFCOI2►│
    │                           │                     │── DatasetSP AD_CUB─►│
    │                           │                     │── ConferenciaSP.cortar►
    │                           │                     │── ConferenciaSP.finalizar►
    │                           │                     │── Atualiza TGFCAB──►│
    │                           │◄── { ok } ──────────┤◄────────────────────┤
    │◄── Redirecionado à fila───┤                     │                     │
```

## Modos de Formação de Volumes

| Valor `formacaoVolumes` | Modo | Comportamento na finalização |
|---|---|---|
| `null` / `D` / `C` | Detalhado | Cada volume rastreado com `SEQVOL`; grava TGFVCF + TGFIVC por volume |
| `T` | Simplificado por tipo | Volumes agrupados por dimensão; grava TGFCOI2 + AD_CUBAGEM agrupado |
| `S` | Simplificado genérico | Peso e dimensões lançados uma vez; grava TGFCOI2 + AD_CUBAGEM |

## Resolução de Código de Barras (5 estratégias)

| Código | Estratégia | Fonte de dados |
|---|---|---|
| `A` | Automático | Tenta BAR → VOA → EST → código do produto → referência, nesta ordem |
| `C` | Código do produto | Lookup direto por `CODPROD` |
| `R` | Referência | Lookup por campo REFERENCIA do produto |
| `U` | Unidade alternativa | Lookup em tabela VOA (VolumeAlternativo do Sankhya) |
| `E` | Estoque | Lookup em TGFEST (número de série / lote) |

A estratégia padrão é configurada por tenant via `ConfiguracaoConferencia.BUSCOCB` no Sankhya.

---

# 8. Módulos do Backend

```
src/
├── core/
│   ├── auth/            → Autenticação JWT + Redis
│   ├── guards/          → AuthUserGuard, MasterGuard, RolesGuard
│   ├── tenant/          → TenantService, TenantMiddleware, AsyncLocalStorage
│   └── email/           → Envio de e-mails transacionais (Nodemailer)
│
├── http-client/
│   ├── gateway/         → GatewayClient (OAuth Sankhya, sessão HTTP)
│   ├── load-records/    → SankhyaLoadRecordsClient
│   ├── dataset-sp/      → SankhyaDatasetSPClient
│   └── db-explorer-sp/  → SankhyaDBExplorerSPClient (SQL raw)
│
└── modules/
    ├── auth/            → Login, logout, recuperação/redefinição de senha
    ├── usuario/         → CRUD de usuários do tenant
    ├── conferencia/     → Fila, iniciar, finalizar, cancelar conferência
    ├── sessao/          → Estado local da conferência (itens, leituras, volumes)
    ├── separacao/       → Registro de bipes, resolução de barcode, peso pesável
    ├── volume/          → Gestão de volumes e cubagem
    ├── balanca/         → Configuração e leitura de balanças físicas
    ├── dashboard/       → KPIs, ranking, heatmap de produtividade
    ├── sincronizacao/   → Jobs cron de sincronização Sankhya → local
    ├── dominio/         → Listas de domínio (tipos de operação, entrega)
    ├── empresa/         → Cache de empresas para filtros da fila
    ├── parceiro/        → Cache de parceiros para filtros da fila
    ├── arquivo/         → Etiquetas de volume (PDF via Chromium)
    ├── tenant-manager/  → Provisionamento e gestão de tenants (Master)
    └── sessao-http/     → Gerenciamento do token OAuth do Sankhya (keepAlive)
```

---

# 9. Páginas do Frontend

| Rota | Componente | Perfil mínimo | Descrição |
|---|---|---|---|
| `/login` | LoginComponent | — | Autenticação com e-mail e senha |
| `/redefinir-senha` | RedefinirSenhaComponent | — | Redefinição de senha via token de e-mail |
| `/fila-conferencia` | FilaConferenciaComponent | SEPARADOR | Fila de pedidos com filtros, paginação, auto-refresh 60s, badges de status |
| `/separacao/:numeroUnico` | SeparacaoComponent | SEPARADOR | Tela de conferência: bipes, volumes, balança, imagens, UMAs |
| `/dashboard-produtividade` | DashboardProdutividadeComponent | ADMINISTRADOR | KPIs, ranking, picos por hora, heatmap dia×hora |
| `/usuario` | UsuarioComponent | ADMINISTRADOR | CRUD de usuários + ativar/inativar |
| `/redefinir-usuario` | RedefinirUsuarioComponent | ADMINISTRADOR | Redefinição e ativação em lote por e-mail |
| `/balancas` | BalancaComponent | ADMINISTRADOR | Cadastro, configuração e teste de balanças |
| `/impressao-etiquetas` | ImpressaoEtiquetasComponent | SEPARADOR | Impressão de etiquetas de volumes |
| `/master/tenants` | MasterTenantsComponent | MASTER | Gestão de empresas clientes (exclusivo Master) |

## Captura Automática de Peso (Balança)

Na tela de conferência, o flag **"Captura automática ao estabilizar (2s)"** é totalmente funcional:

1. Frontend recebe leituras da balança via polling HTTP (`GET /balancas/:id/peso-atual`)
2. Quando a variação entre leituras consecutivas for < 0,005 kg por 2.000ms → peso é considerado estável
3. O sistema preenche automaticamente o campo de peso, emite um bipe sonoro (WebAudio API) e confirma a leitura após 80ms

---

# 10. Schema do Banco de Dados

## Banco Admin (`fila_conferencia_admin`)

```prisma
model Tenant {
  slug            String    @id          // identificador único da empresa (ex: "negri")
  nome            String
  ativo           Boolean   @default(true)
  dbUrl           String                 // postgresql://... do banco isolado
  snkHost         String                 // URL do servidor Sankhya
  snkGateway      String                 // URL do Gateway Sankhya
  snkXToken       String                 // token de app Sankhya
  snkClientId     String
  snkClientSecret String
  dbDialect       DbDialect @default(SQLSERVER)  // ORACLE ou SQLSERVER
  snkModulos      String    @default("AD_NUMTALAO,AD_TIPOENTREGA,AD_CUBAGEM")
  criadoEm        DateTime  @default(now())
}

model TenantUser {
  email      String @id    // mapeia e-mail → tenant (para login)
  tenantSlug String
}

model MasterUser {
  id    String  @id @default(uuid())
  email String  @unique
  nome  String
  senha String
  ativo Boolean @default(true)
}

enum DbDialect { SQLSERVER  ORACLE }
```

## Banco por Tenant (`fila_conferencia_<slug>`)

```prisma
model User {
  id        String   @id @default(uuid())
  codigo    Int      @unique
  nome      String
  email     String   @unique
  perfil    Perfil   // ADMINISTRADOR | SEPARADOR
  senha     String?
  ativo     Boolean  @default(true)
  resetToken    String?
  resetTokenExp DateTime?
}

model SessaoConferencia {
  id                    String   @id @default(uuid())
  numeroUnico           Int      @unique   // NUNOTA do Sankhya
  numeroConferencia     Int
  idUsuario             Int
  codigoTipoMovimento   String?
  descricaoTipoOperacao String?
  formacaoVolumes       String?  // null/D/C = detalhado, T/S = simplificado
  buscarCodigoBarraPor  String   @default("A")
  status                String   @default("A")  // A=ativo, F=finalizado
  qtdVol                Int?     // total de volumes (modo simplificado)
  altura                Decimal?
  largura               Decimal?
  comprimento           Decimal?
  peso                  Decimal?
  dtAbertura            DateTime?
  dtFechamento          DateTime?
  criadoEm              DateTime @default(now())
}

model SessaoItem {
  sessaoId          String
  sequencia         Int
  idProduto         Int
  nomeProduto       String
  referencia        String?
  unidade           String
  unidadePadrao     String?
  controle          String    // N=nenhum, S=serial, L=lote, P=peso
  decQtd            Int
  pesoBruto         Decimal
  qtdNeg            Decimal   // quantidade negociada
  qtdConferidaLocal Decimal   @default(0)
  pesavel           Boolean   @default(false)
  usaConfPeso       Boolean   @default(false)
}

model SessaoLeitura {
  id           Int      @id @default(autoincrement())
  sessaoId     String
  seqVol       Int
  idProduto    Int
  unidade      String
  controle     String
  codigoBarras String?
  qtd          Decimal
  qtdVolpad    Decimal
  peso         Decimal?
  criadoEm     DateTime @default(now())
}

model SessaoVolume {
  sessaoId    String
  seqVol      Int
  ordem       Int
  altura      Decimal?
  largura     Decimal?
  comprimento Decimal?
  peso        Decimal?
}

model SessaoCodigoBarras {
  sessaoId     String
  codigoBarra  String
  idProduto    Int
  unidade      String?
  controle     String
  quantidade   Decimal?
  divideMult   String?
  origem       String   // BAR | VOA | EST | LOADED
}

model SessaoItemUma {
  sessaoId  String
  idProduto Int
  codUma    String
  descricao String
  peso      Decimal?
  codVol    String?
  codBarra  String?
  padrao    Boolean @default(false)
}

model Balanca {
  id               String   @id @default(uuid())
  nome             String
  fabricante       String
  modelo           String?
  tipoComunicacao  TipoComunicacaoBalanca
  // serial
  portaCom         String?
  baudRate         Int      @default(9600)
  dataBits         Int      @default(8)
  paridade         String   @default("none")
  stopBits         Int      @default(1)
  protocoloSerial  String   @default("TOLEDO_P05")
  // rede
  protocolo        String   @default("HTTP")
  ip               String?
  porta            Int?
  rota             String   @default("/peso")
  ativo            Boolean  @default(true)
}

enum TipoComunicacaoBalanca {
  SERIAL_RS232  SERIAL_USB  HTTP  TOLEDO_TCP
}

model ProdutoCache {
  idProduto   Int      @id
  nome        String
  complemento String?
  imagem      String?  // base64 data URL (JPEG/PNG)
  syncAt      DateTime
}

model CodigoBarrasCache {
  codigoBarra String
  idProduto   Int
  codvol      String?
  controle    String
  quantidade  Decimal?
  divideMult  String?
  origem      String   // BAR | VOA | EST
}

model LogLogin { idUsuario Int; criadoEm DateTime }
model LogHeartbeat { idUsuario Int; numeroConferencia Int?; criadoEm DateTime }
```

---

# 11. Autenticação e Controle de Acesso

## Fluxo de Login

```
POST /auths/login
 → identifica tenant pelo e-mail (tabela TenantUser no admin DB)
 → valida senha com bcrypt (salt 10)
 → gera UUID como token
 → armazena no Redis: { tenantSlug, idUsuario, nome, perfil, snkModulos }
 → retorna { token, perfil, nome, snkModulos }
```

## Perfis de Acesso

| Perfil | Acesso |
|---|---|
| `SEPARADOR` | Fila de conferência, tela de separação, etiquetas |
| `ADMINISTRADOR` | Tudo de SEPARADOR + gestão de usuários, dashboard, configuração de balanças |
| `MASTER` | Painel master de provisionamento de tenants (perfil especial, sem tenant associado) |

## Guards

| Guard | Aplicação |
|---|---|
| `AuthUserGuard` | Todas as rotas autenticadas — valida token no Redis e injeta tenant no contexto |
| `RolesGuard` + `@Roles('ADMINISTRADOR')` | Endpoints destrutivos de usuários e configurações |
| `MasterGuard` | Rotas `/master/*` — valida token de usuário master separado |
| `AuthAppGuard` | Proteção de APIs inter-serviços por chave de app |

## Rate Limiting

| Endpoint | Limite |
|---|---|
| `POST /auths/login` | 10 requisições / minuto por IP |
| `POST /auths/esqueci-minha-senha` | 5 requisições / minuto por IP |
| `POST /auths/redefinir-senha` | 5 requisições / minuto por IP |

## Recuperação de Senha

1. `POST /auths/esqueci-minha-senha` → gera token hexadecimal 32 bytes, validade 30 minutos, envia e-mail com link
2. `POST /auths/redefinir-senha` → valida token, atualiza senha com bcrypt, invalida token

---

# 12. Integração com Balanças

## Tipos Suportados

| Tipo | Protocolo | Driver | Status |
|---|---|---|---|
| `HTTP` | REST HTTP GET | `HttpDriver` | Produção |
| `SERIAL_RS232` | RS-232 serial | `ToledoSerialDriver` (P05) | Produção |
| `SERIAL_USB` | USB virtual COM | `ToledoSerialDriver` (P05) | Produção |
| `TOLEDO_TCP` | TCP Toledo | `ToledoTcpDriver` | Produção |
| Filizola / Urano / Mettler | — | Planejado | Roadmap |

## Modos de Leitura

**One-shot (HTTP):** frontend chama diretamente via `fetch` nativo para suportar URLs absolutas fora do proxy Angular. Retorno esperado: `{ peso: 1.250 }` em JSON.

**Contínua (serial/TCP):**
1. `POST /balancas/:id/iniciar-leitura` — backend abre porta serial/TCP, mantém conexão ativa com polling interno
2. Frontend faz polling em `GET /balancas/:id/peso-atual` a cada 500ms (retorna peso do cache em memória)
3. `POST /balancas/:id/parar-leitura` — encerra conexão

## Observação sobre HTTPS em Produção

Navegadores modernos (Chrome 94+) bloqueiam requisições de páginas HTTPS para dispositivos em `localhost` HTTP (política Private Network Access — PNA). Para uso de balanças HTTP via frontend em produção HTTPS, são necessárias uma das opções:
- Flag `chrome://flags/#block-insecure-private-network-requests` desabilitada (solução temporária, por máquina)
- Agente local instalado na máquina do separador, servindo HTTPS com certificado autoassinado (roadmap — documentado em `PLANO_BALANCAS.txt`)

---

# 13. Sincronização de Dados

Jobs Cron executados em paralelo para cada tenant ativo:

| Job | Frequência | Dados sincronizados | Fonte Sankhya |
|---|---|---|---|
| Tipos de Operação | A cada 4 horas | `Dominio` (tipo, código, descrição) | TGFTOP via LoadRecords |
| Produtos e Imagens | A cada 6 horas | `ProdutoCache` (nome, complemento, imagem base64) | TGFPRO via DbExplorerSP |
| Códigos de Barras | A cada 6 horas | `CodigoBarrasCache` (BAR + VOA + EST) | TGFBAR, TGFVOA, TGFEST |

A sincronização de imagens usa SQL raw diferente por dialeto:
- **Oracle:** `RAWTOHEX(DBMS_LOB.SUBSTR(IMAGEM, 4000, 1))`
- **SQL Server:** `CONVERT(NVARCHAR(MAX), CAST(IMAGEM AS VARBINARY(MAX)), 2)`

---

# 14. Performance e Cache

## Estratégia de Cache da Fila (stale-while-revalidate)

```
Requisição chega ao GET /conferencias
  ├── Cache quente (< 30s) → retorna imediatamente (< 50ms)
  ├── Cache expirado → retorna dados stale + dispara revalidação em background
  └── Cache frio (primeiro acesso) → aguarda carregamento (~4,5s)
```

- Deduplicação de inflight: múltiplas requisições simultâneas aguardam a mesma Promise (evita N chamadas ao Sankhya)
- Warm-up no bootstrap: pré-aquece o cache de todos os tenants ativos na inicialização do serviço

## Outras Otimizações

| Otimização | Impacto |
|---|---|
| Short-circuit para status "F" | Fila filtrada por finalizadas consulta apenas banco local, zero Sankhya |
| `Promise.all` para flags de módulos | Flags AD_NUMTALAO + AD_TIPOENTREGA resolvidas em paralelo por requisição |
| Cache de configurações do tenant | TTL 5 minutos no `configCache` — evita consultas repetidas ao admin DB |
| Cache de imagens no ArquivoHelper | TTL 3 minutos por produto durante geração de etiquetas |
| Sessão em memória (Map) | Resolução de código de barras O(1) — zero I/O de disco durante conferência |
| Bulk insert transacional | Sessão com centenas de itens criada em uma única transação PostgreSQL |

## Resultados Medidos

| Cenário | Tempo |
|---|---|
| Primeiro acesso à fila (cache frio) | ~4,5 segundos |
| Acessos subsequentes (cache quente) | < 50ms |
| Polling `sessao-pronta` (somente banco local) | < 20ms |

---

# 15. Gestão Multi-empresa (Master)

O usuário **Master** é um super-administrador acima de todos os tenants, com acesso exclusivo ao painel `/master/tenants`. Seu token é validado separadamente pelo `MasterGuard`.

## Operações Disponíveis

| Operação | Endpoint | Descrição |
|---|---|---|
| Listar tenants | `GET /master/tenants` | Todos os tenants com status |
| Detalhar tenant | `GET /master/tenants/:slug` | Configurações completas |
| Criar tenant | `POST /master/tenants` | Provisiona banco + migrations + registro no admin |
| Editar tenant | `PATCH /master/tenants/:slug` | Atualiza credenciais Sankhya, módulos, dialeto |
| Forçar sync | `POST /master/tenants/:slug/sync` | Sincroniza TipoOperacao + Produtos imediatamente |

## Configurações Editáveis por Tenant

- Host e Gateway do Sankhya (`snkHost`, `snkGateway`)
- Credenciais OAuth do ERP (`snkXToken`, `snkClientId`, `snkClientSecret`)
- Dialeto do banco do ERP (`dbDialect`: ORACLE / SQLSERVER)
- Módulos opcionais ativos (`snkModulos`: lista CSV)
- Status ativo/inativo

---

# 16. Variáveis de Ambiente

```env
# Banco de dados admin
DATABASE_URL=postgresql://user:pass@localhost:5432/fila_conferencia_admin

# Redis
REDIS_URL=redis://localhost:6379

# Segurança
JWT_SECRET=seu_segredo_jwt_aqui
APP_KEY=chave_de_app_inter_servicos

# E-mail (recuperação de senha)
SMTP_HOST=smtp.seuprovedor.com
SMTP_PORT=587
SMTP_USER=noreply@suaempresa.com
SMTP_PASS=senha_smtp
SMTP_FROM="Fila de Conferência <noreply@suaempresa.com>"

# URL base do frontend (para links de e-mail de recuperação)
FRONTEND_URL=https://conferencia.suaempresa.com

# Credenciais do usuário Master (usadas apenas no seed inicial)
MASTER_EMAIL=master@suaempresa.com
MASTER_SENHA=senha_master_segura
```

---

# 17. Procedures de Deploy

## Deploy em Produção (Windows → Linux via PuTTY)

```powershell
# SSH key: C:\Users\João\Downloads\chavePutty.ppk
# Servidor: ubuntu@163.176.239.42

# 1. Copiar arquivos modificados para o servidor
pscp -i C:\Users\João\Downloads\chavePutty.ppk -r `
  C:\ProjetoPHP\fila-de-conferencia\fila-conferencia-backend\* `
  ubuntu@163.176.239.42:/home/ubuntu/fila-conferencia-backend/

# 2. Rebuild e restart do container backend
plink -i C:\Users\João\Downloads\chavePutty.ppk ubuntu@163.176.239.42 `
  "cd /home/ubuntu/fila-conferencia-backend && docker compose -f docker-compose.prod.yml up -d --build app"
```

## Sincronizar com Git

```bash
# Commitar e enviar do repositório local
git add src/modules/... prisma/migrations/...
git commit -m "feat: descrição da mudança"
git push origin main

# No servidor, atualizar o repositório
plink -i chavePutty.ppk ubuntu@163.176.239.42 \
  "cd /home/ubuntu/fila-conferencia-backend && git pull origin main"
```

**Remote:** `https://github.com/Sankhya-ABC/fila-conferencia-backend-modial.git`

## Migrations de Banco de Dados

Migrations do banco de cada tenant são aplicadas automaticamente no startup do container:
```
prisma migrate deploy
```

Para aplicar SQL manualmente no banco admin:
```powershell
# Método via docker exec com redirecionamento de arquivo
plink -i chavePutty.ppk ubuntu@163.176.239.42 `
  "docker exec -i fila-conf-db psql -U postgres -d fila_conferencia_admin" `
  < migration.sql
```

## Comandos Docker Úteis

```bash
# Ver logs do backend em tempo real
docker logs -f fila-conf-backend

# Entrar no container backend
docker exec -it fila-conf-backend sh

# Entrar no banco admin
docker exec -it fila-conf-db psql -U postgres -d fila_conferencia_admin

# Reiniciar apenas o backend (sem rebuild)
docker compose -f docker-compose.prod.yml restart app

# Rebuild completo
docker compose -f docker-compose.prod.yml up -d --build app
```

---

# 18. Referência de Endpoints

## Autenticação

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auths/login` | Login com e-mail e senha |
| POST | `/auths/logout` | Invalida token |
| POST | `/auths/esqueci-minha-senha` | Envia e-mail de recuperação |
| POST | `/auths/redefinir-senha` | Redefine senha via token |

## Fila de Conferência

| Método | Rota | Descrição |
|---|---|---|
| GET | `/conferencias` | Lista fila com filtros e paginação |
| GET | `/conferencias/dados-basicos` | Dados básicos de um pedido específico |
| GET | `/conferencias/sessao-pronta` | Polling de status da sessão (somente banco local) |
| POST | `/conferencias/iniciar-conferencia` | Inicia conferência no Sankhya + cria sessão local |
| POST | `/conferencias/finalizar-conferencia` | Finaliza e grava volumes no Sankhya |
| POST | `/conferencias/excluir-sessao` | Cancela sessão ativa |

## Separação (durante conferência)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/separacoes/resolver-codigo-barras` | Resolve código de barras → produto + unidade + controle |
| POST | `/separacoes/item-conferido-volume` | Registra leitura (bipe) em um volume |
| POST | `/separacoes/devolver-item-conferido` | Zera leituras de um produto |
| POST | `/separacoes/mover-item-volume` | Move quantidade entre volumes |
| POST | `/separacoes/remover-volume` | Remove um volume da sessão |
| GET | `/separacoes/itens-pedidos` | Lista itens com quantidades negociada/conferida |
| GET | `/separacoes/imagens-itens` | Imagens dos produtos (lazy load) |
| GET | `/separacoes/itens-conferidos` | Totais conferidos por produto |
| PATCH | `/separacoes/item-peso` | Grava peso em produto pesável (TGFITE) |

## Volumes e Cubagem

| Método | Rota | Descrição |
|---|---|---|
| GET | `/volumes` | Lista volumes da sessão |
| POST | `/volumes/gerar-volumes-lote` | Cria N volumes com mesmas dimensões |
| POST | `/volumes/deletar-volumes-lote` | Remove volumes de um lote |
| POST | `/volumes/dimensoes-volume` | Atualiza dimensões de volume(s) |
| POST | `/volumes/grupo-simplificado` | Salva cubagem simplificada no Sankhya |

## Balanças

| Método | Rota | Descrição |
|---|---|---|
| GET | `/balancas` | Lista balanças cadastradas |
| POST | `/balancas` | Cadastra nova balança |
| PUT | `/balancas/:id` | Atualiza configuração |
| DELETE | `/balancas/:id` | Remove balança |
| GET | `/balancas/ativas` | Lista reduzida para dropdowns |
| GET | `/balancas/portas-com` | Portas COM disponíveis no servidor |
| POST | `/balancas/testar-direto` | Testa conexão serial sem ID cadastrado |
| POST | `/balancas/:id/iniciar-leitura` | Inicia leitura contínua (serial/TCP) |
| POST | `/balancas/:id/parar-leitura` | Para leitura contínua |
| GET | `/balancas/:id/peso-atual` | Peso em cache (polling do frontend) |
| GET | `/balancas/:id/status` | Status e peso atual sem lançar exceção |
| GET | `/balancas/:id/capturar-peso` | Captura pontual (backward compat) |
| POST | `/balancas/:id/simular-peso` | Simula leitura (dev/teste) |

## Usuários

| Método | Rota | Descrição |
|---|---|---|
| GET | `/usuarios` | Lista usuários do tenant |
| POST | `/usuarios` | Cria usuário (requer ADMINISTRADOR) |
| PUT | `/usuarios/:codigo` | Atualiza usuário (requer ADMINISTRADOR) |
| DELETE | `/usuarios/:codigo` | Remove usuário (requer ADMINISTRADOR) |
| PATCH | `/usuarios/:codigo/status` | Ativa/inativa toggle (requer ADMINISTRADOR) |
| POST | `/usuarios/redefinir-ativar-lote` | Redefine senha + ativa em lote (requer ADMINISTRADOR) |

## Dashboard

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dashboard-produtividade` | KPIs globais, ranking, heatmap, linha do tempo por separador |

## Sincronização

| Método | Rota | Descrição |
|---|---|---|
| POST | `/sincronizacao/tipos-operacao` | Força sincronização de tipos de operação |
| POST | `/sincronizacao/produtos` | Força sincronização de produtos e imagens |

## Domínios / Lookups

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dominios` | Listas de domínio para filtros (tipo movimento, operação, entrega) |
| GET | `/empresas` | Busca de empresas para filtros |
| GET | `/parceiros` | Busca de parceiros/clientes para filtros |

## Master (requer perfil MASTER)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/master/tenants` | Lista todos os tenants |
| GET | `/master/tenants/:slug` | Configurações completas de um tenant |
| POST | `/master/tenants` | Provisiona novo tenant (banco + migrations + registro) |
| PATCH | `/master/tenants/:slug` | Atualiza configurações do tenant |
| POST | `/master/tenants/:slug/sync` | Força sincronização imediata do tenant |

## Arquivo / Etiquetas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/arquivos/etiquetas` | Gera PDF de etiquetas de volumes da conferência |

---

*Documentação gerada em Junho/2026 — versão 1.0*
*Projeto: Fila de Conferência — Sistema de Gestão de Conferência Física Integrado ao Sankhya ERP*
