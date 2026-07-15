-- Cria o tipo enum DbDialect no Postgres, caso não exista, e converte a
-- coluna de TEXT para o tipo enum correto (só na tabela Tenant, se existir).
-- Nota: unificado num único bloco DO porque o TenantMigratorService executa
-- o arquivo inteiro via $executeRawUnsafe (protocolo estendido do Postgres,
-- que não aceita múltiplos statements top-level numa mesma chamada).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DbDialect') THEN
    CREATE TYPE "DbDialect" AS ENUM ('SQLSERVER', 'ORACLE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'Tenant' AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" DROP DEFAULT';
    EXECUTE 'ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" TYPE "DbDialect" USING "dbDialect"::"DbDialect"';
    EXECUTE 'ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" SET DEFAULT ''SQLSERVER''::"DbDialect"';
  END IF;
END $$;
