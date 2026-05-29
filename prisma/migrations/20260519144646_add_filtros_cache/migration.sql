-- CreateTable
CREATE TABLE "Dominio" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "Dominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "codigo" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "Parceiro" (
    "codigo" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT,

    CONSTRAINT "Parceiro_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dominio_tipo_codigo_key" ON "Dominio"("tipo", "codigo");
