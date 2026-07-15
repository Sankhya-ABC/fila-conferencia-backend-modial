ALTER TABLE "BalancaUsuario" ADD CONSTRAINT "BalancaUsuario_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "User"("codigo") ON DELETE CASCADE ON UPDATE CASCADE;
