-- CreateTable
CREATE TABLE "SessaoItemUma" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "idProduto" INTEGER NOT NULL,
    "codUma" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "peso" DOUBLE PRECISION,
    "codVol" TEXT,
    "codBarra" TEXT,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SessaoItemUma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessaoItemUma_sessaoId_idx" ON "SessaoItemUma"("sessaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoItemUma_sessaoId_idProduto_codUma_key" ON "SessaoItemUma"("sessaoId", "idProduto", "codUma");

-- AddForeignKey
ALTER TABLE "SessaoItemUma" ADD CONSTRAINT "SessaoItemUma_sessaoId_fkey"
    FOREIGN KEY ("sessaoId") REFERENCES "SessaoConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
