ALTER TABLE "SessaoConferencia" ADD COLUMN "buscarCodigoBarraPor" TEXT NOT NULL DEFAULT 'A';
ALTER TABLE "SessaoCodigoBarras" ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'BAR';
ALTER TABLE "SessaoCodigoBarras" ALTER COLUMN "unidade" DROP NOT NULL;
