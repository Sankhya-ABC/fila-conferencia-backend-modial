-- CreateTable
CREATE TABLE "Tenant" (
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dbUrl" TEXT NOT NULL,
    "snkHost" TEXT NOT NULL,
    "snkGateway" TEXT NOT NULL,
    "snkXToken" TEXT NOT NULL,
    "snkClientId" TEXT NOT NULL,
    "snkClientSecret" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "TenantUser" (
    "email" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("email")
);

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantSlug_fkey" FOREIGN KEY ("tenantSlug") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
