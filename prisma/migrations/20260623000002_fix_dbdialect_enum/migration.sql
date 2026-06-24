-- Cria o tipo enum DbDialect no Postgres, caso não exista
-- (a migration add_master_user criou a coluna como TEXT em vez de ENUM)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DbDialect') THEN
    CREATE TYPE "DbDialect" AS ENUM ('SQLSERVER', 'ORACLE');
  END IF;
END $$;

-- Converte a coluna de TEXT para o tipo enum correto
ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" DROP DEFAULT;
ALTER TABLE "Tenant"
  ALTER COLUMN "dbDialect" TYPE "DbDialect"
  USING "dbDialect"::"DbDialect";
ALTER TABLE "Tenant" ALTER COLUMN "dbDialect" SET DEFAULT 'SQLSERVER'::"DbDialect";
