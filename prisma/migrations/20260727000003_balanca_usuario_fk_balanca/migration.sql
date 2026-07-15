ALTER TABLE "BalancaUsuario" ADD CONSTRAINT "BalancaUsuario_balancaId_fkey" FOREIGN KEY ("balancaId") REFERENCES "Balanca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
