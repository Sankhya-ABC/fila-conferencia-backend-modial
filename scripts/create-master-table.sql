CREATE TABLE IF NOT EXISTS "MasterUser" (
  "id"    TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "email" TEXT    NOT NULL,
  "nome"  TEXT    NOT NULL,
  "senha" TEXT    NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "MasterUser_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "MasterUser_email_key" UNIQUE ("email")
);
