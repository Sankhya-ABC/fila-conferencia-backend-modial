ALTER TABLE "SessaoEtapa" ADD CONSTRAINT "SessaoEtapa_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
