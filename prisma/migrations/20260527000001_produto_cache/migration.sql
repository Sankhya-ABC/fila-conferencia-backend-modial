CREATE TABLE "ProdutoCache" (
  "idProduto"   INTEGER  NOT NULL,
  "nome"        TEXT     NOT NULL,
  "complemento" TEXT,
  "imagem"      TEXT,
  "syncAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProdutoCache_pkey" PRIMARY KEY ("idProduto")
);

CREATE TABLE "CodigoBarrasCache" (
  "id"          TEXT     NOT NULL,
  "codigoBarra" TEXT     NOT NULL,
  "idProduto"   INTEGER  NOT NULL,
  "codvol"      TEXT,
  "controle"    TEXT     NOT NULL DEFAULT ' ',
  "quantidade"  DOUBLE PRECISION,
  "divideMult"  TEXT,
  "origem"      TEXT     NOT NULL DEFAULT 'BAR',
  CONSTRAINT "CodigoBarrasCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodigoBarrasCache_codigoBarra_idProduto_controle_origem_key"
  ON "CodigoBarrasCache"("codigoBarra", "idProduto", "controle", "origem");
