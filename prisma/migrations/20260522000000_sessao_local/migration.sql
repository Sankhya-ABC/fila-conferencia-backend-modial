-- CreateTable
CREATE TABLE "SessaoConferencia" (
    "id" TEXT NOT NULL,
    "numeroUnico" INTEGER NOT NULL,
    "numeroConferencia" INTEGER NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "codigoTipoMovimento" TEXT,
    "descricaoTipoOperacao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'A',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoConferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoItem" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "idProduto" INTEGER NOT NULL,
    "nomeProduto" TEXT NOT NULL,
    "complemento" TEXT,
    "marca" TEXT,
    "referencia" TEXT,
    "unidade" TEXT NOT NULL,
    "controle" TEXT NOT NULL DEFAULT ' ',
    "tipControle" TEXT,
    "decQtd" INTEGER NOT NULL DEFAULT 0,
    "pesoBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtdNeg" DOUBLE PRECISION NOT NULL,
    "qtdEntregue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtdConferidaSankhya" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtdConferidaLocal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "divideMult" TEXT,
    "fatorConv" DOUBLE PRECISION,

    CONSTRAINT "SessaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoVolume" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "seqVol" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "altura" DOUBLE PRECISION,
    "largura" DOUBLE PRECISION,
    "comprimento" DOUBLE PRECISION,
    "peso" DOUBLE PRECISION,

    CONSTRAINT "SessaoVolume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoLeitura" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "seqVol" INTEGER NOT NULL,
    "idProduto" INTEGER NOT NULL,
    "unidade" TEXT NOT NULL,
    "controle" TEXT NOT NULL DEFAULT ' ',
    "codigoBarras" TEXT,
    "qtd" DOUBLE PRECISION NOT NULL,
    "qtdVolpad" DOUBLE PRECISION NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoLeitura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoCodigoBarras" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "codigoBarra" TEXT NOT NULL,
    "idProduto" INTEGER NOT NULL,
    "unidade" TEXT NOT NULL,
    "controle" TEXT NOT NULL DEFAULT ' ',
    "quantidade" DOUBLE PRECISION,
    "divideMult" TEXT,

    CONSTRAINT "SessaoCodigoBarras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessaoConferencia_numeroUnico_key" ON "SessaoConferencia"("numeroUnico");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoItem_sessaoId_sequencia_key" ON "SessaoItem"("sessaoId", "sequencia");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoVolume_sessaoId_seqVol_key" ON "SessaoVolume"("sessaoId", "seqVol");

-- AddForeignKey
ALTER TABLE "SessaoItem" ADD CONSTRAINT "SessaoItem_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoVolume" ADD CONSTRAINT "SessaoVolume_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoLeitura" ADD CONSTRAINT "SessaoLeitura_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoCodigoBarras" ADD CONSTRAINT "SessaoCodigoBarras_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
