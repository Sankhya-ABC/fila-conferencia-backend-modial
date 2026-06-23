-- AddColumn: peso em SessaoLeitura
ALTER TABLE "SessaoLeitura" ADD COLUMN "peso" DOUBLE PRECISION;

-- CreateTable: Balanca
CREATE TABLE "Balanca" (
    "id"    TEXT NOT NULL,
    "nome"  TEXT NOT NULL,
    "ip"    TEXT NOT NULL,
    "porta" INTEGER NOT NULL DEFAULT 80,
    "rota"  TEXT NOT NULL DEFAULT '/peso',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Balanca_pkey" PRIMARY KEY ("id")
);
