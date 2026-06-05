-- AlterTable: adicionar dtAbertura e dtFechamento em SessaoConferencia
ALTER TABLE "SessaoConferencia" ADD COLUMN "dtAbertura" TIMESTAMP(3);
ALTER TABLE "SessaoConferencia" ADD COLUMN "dtFechamento" TIMESTAMP(3);

-- CreateTable LogLogin
CREATE TABLE "LogLogin" (
    "id" TEXT NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable LogHeartbeat
CREATE TABLE "LogHeartbeat" (
    "id" TEXT NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "numeroConferencia" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogHeartbeat_pkey" PRIMARY KEY ("id")
);
