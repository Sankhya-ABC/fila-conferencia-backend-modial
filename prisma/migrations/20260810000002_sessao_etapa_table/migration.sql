CREATE TABLE "SessaoEtapa" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'P',
    "idUsuarioInicio" INTEGER,
    "idUsuarioConclusao" INTEGER,
    "dtInicio" TIMESTAMP(3),
    "dtConclusao" TIMESTAMP(3),

    CONSTRAINT "SessaoEtapa_pkey" PRIMARY KEY ("id")
);
