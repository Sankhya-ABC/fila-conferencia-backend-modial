CREATE TABLE IF NOT EXISTS "BalancaUsuario" (
    "id"        TEXT NOT NULL,
    "balancaId" TEXT NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalancaUsuario_pkey" PRIMARY KEY ("id")
);
