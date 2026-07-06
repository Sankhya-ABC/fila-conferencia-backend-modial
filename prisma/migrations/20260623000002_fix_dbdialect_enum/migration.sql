-- Cria o tipo enum DbDialect no Postgres, caso não exista
-- (a migration add_master_user criou a coluna como TEXT em vez de ENUM)
-- Nota: este bloco é idempotente em qualquer banco (admin ou tenant)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DbDialect') THEN
    CREATE TYPE "DbDialect" AS ENUM ('SQLSERVER', 'ORACLE');
  END IF;
END $$;

-- Converte a coluna de TEXT para o tipo enum correto
-- Só executa se a tabela Tenant existir (admin DB) — em tenant DBs este bloco é ignorado
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'Tenant' AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" DROP DEFAULT';
    EXECUTE 'ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" TYPE "DbDialect" USING "dbDialect"::"DbDialect"';
    EXECUTE 'ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" SET DEFAULT ''SQLSERVER''::"DbDialect"';
  END IF;
END $$;
