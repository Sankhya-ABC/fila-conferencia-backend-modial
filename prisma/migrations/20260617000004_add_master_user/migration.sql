-- CreateTable: MasterUser (tabela de usuários mestres do admin DB)
CREATE TABLE IF NOT EXISTS "MasterUser" (
    "id"    TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome"  TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MasterUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MasterUser_email_key" ON "MasterUser"("email");

-- Colunas que podem estar faltando na tabela Tenant (adicionadas após a migration inicial)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "dbDialect"  TEXT NOT NULL DEFAULT 'SQLSERVER';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "snkModulos" TEXT NOT NULL DEFAULT 'AD_NUMTALAO,AD_TIPOENTREGA,AD_CUBAGEM';
