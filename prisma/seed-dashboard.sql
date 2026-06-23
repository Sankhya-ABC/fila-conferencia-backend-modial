-- ─────────────────────────────────────────────────────────────────────────────
-- SEED fictício para testar o dashboard de produtividade
-- Limpar com: \i seed-dashboard-cleanup.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  u1 INT := 9001;
  u2 INT := 9002;
  u3 INT := 9003;
  u4 INT := 9004;

  s UUID[] := ARRAY[
    '99000001-0000-0000-0000-000000000001'::UUID,
    '99000001-0000-0000-0000-000000000002'::UUID,
    '99000001-0000-0000-0000-000000000003'::UUID,
    '99000001-0000-0000-0000-000000000004'::UUID,
    '99000001-0000-0000-0000-000000000005'::UUID,
    '99000001-0000-0000-0000-000000000006'::UUID,
    '99000001-0000-0000-0000-000000000007'::UUID,
    '99000001-0000-0000-0000-000000000008'::UUID,
    '99000001-0000-0000-0000-000000000009'::UUID,
    '99000001-0000-0000-0000-000000000010'::UUID,
    '99000001-0000-0000-0000-000000000011'::UUID,
    '99000001-0000-0000-0000-000000000012'::UUID,
    '99000001-0000-0000-0000-000000000013'::UUID,
    '99000001-0000-0000-0000-000000000014'::UUID,
    '99000001-0000-0000-0000-000000000015'::UUID
  ];

  -- Helpers: data de hoje + hora específica como TIMESTAMPTZ
  d DATE := CURRENT_DATE;

  -- Cada timestamp como variável explícita
  t01 TIMESTAMPTZ; t02 TIMESTAMPTZ; t03 TIMESTAMPTZ; t04 TIMESTAMPTZ;
  t05 TIMESTAMPTZ; t06 TIMESTAMPTZ; t07 TIMESTAMPTZ; t08 TIMESTAMPTZ;
  t09 TIMESTAMPTZ; t10 TIMESTAMPTZ; t11 TIMESTAMPTZ; t12 TIMESTAMPTZ;
  t13 TIMESTAMPTZ; t14 TIMESTAMPTZ; t15 TIMESTAMPTZ; t16 TIMESTAMPTZ;
  t17 TIMESTAMPTZ; t18 TIMESTAMPTZ; t19 TIMESTAMPTZ; t20 TIMESTAMPTZ;
  t21 TIMESTAMPTZ; t22 TIMESTAMPTZ; t23 TIMESTAMPTZ; t24 TIMESTAMPTZ;
  t25 TIMESTAMPTZ; t26 TIMESTAMPTZ; t27 TIMESTAMPTZ; t28 TIMESTAMPTZ;
  t29 TIMESTAMPTZ; t30 TIMESTAMPTZ;

BEGIN

  -- Pré-computar timestamps (evita ambiguidade date+unknown)
  t01 := (d::TIMESTAMP + INTERVAL  '7 hours 15 minutes')::TIMESTAMPTZ;
  t02 := (d::TIMESTAMP + INTERVAL  '7 hours 58 minutes')::TIMESTAMPTZ;
  t03 := (d::TIMESTAMP + INTERVAL  '8 hours 30 minutes')::TIMESTAMPTZ;
  t04 := (d::TIMESTAMP + INTERVAL  '9 hours 20 minutes')::TIMESTAMPTZ;
  t05 := (d::TIMESTAMP + INTERVAL '10 hours  0 minutes')::TIMESTAMPTZ;
  t06 := (d::TIMESTAMP + INTERVAL '10 hours 42 minutes')::TIMESTAMPTZ;
  t07 := (d::TIMESTAMP + INTERVAL '13 hours  0 minutes')::TIMESTAMPTZ;
  t08 := (d::TIMESTAMP + INTERVAL '13 hours 55 minutes')::TIMESTAMPTZ;
  t09 := (d::TIMESTAMP + INTERVAL '15 hours 30 minutes')::TIMESTAMPTZ;
  t10 := (d::TIMESTAMP + INTERVAL '16 hours 18 minutes')::TIMESTAMPTZ;
  t11 := (d::TIMESTAMP + INTERVAL  '7 hours 45 minutes')::TIMESTAMPTZ;
  t12 := (d::TIMESTAMP + INTERVAL  '8 hours 32 minutes')::TIMESTAMPTZ;
  t13 := (d::TIMESTAMP + INTERVAL  '9 hours  0 minutes')::TIMESTAMPTZ;
  t14 := (d::TIMESTAMP + INTERVAL  '9 hours 55 minutes')::TIMESTAMPTZ;
  t15 := (d::TIMESTAMP + INTERVAL '11 hours  0 minutes')::TIMESTAMPTZ;
  t16 := (d::TIMESTAMP + INTERVAL '12 hours 10 minutes')::TIMESTAMPTZ;
  t17 := (d::TIMESTAMP + INTERVAL '14 hours  0 minutes')::TIMESTAMPTZ;
  t18 := (d::TIMESTAMP + INTERVAL '14 hours 50 minutes')::TIMESTAMPTZ;
  t19 := (d::TIMESTAMP + INTERVAL  '8 hours  0 minutes')::TIMESTAMPTZ;
  t20 := (d::TIMESTAMP + INTERVAL  '9 hours  5 minutes')::TIMESTAMPTZ;
  t21 := (d::TIMESTAMP + INTERVAL '10 hours 30 minutes')::TIMESTAMPTZ;
  t22 := (d::TIMESTAMP + INTERVAL '11 hours 55 minutes')::TIMESTAMPTZ;
  t23 := (d::TIMESTAMP + INTERVAL '13 hours 45 minutes')::TIMESTAMPTZ;
  t24 := (d::TIMESTAMP + INTERVAL '14 hours 40 minutes')::TIMESTAMPTZ;
  t25 := (d::TIMESTAMP + INTERVAL  '9 hours 30 minutes')::TIMESTAMPTZ;
  t26 := (d::TIMESTAMP + INTERVAL '10 hours 15 minutes')::TIMESTAMPTZ;
  t27 := (d::TIMESTAMP + INTERVAL '14 hours 30 minutes')::TIMESTAMPTZ;
  t28 := (d::TIMESTAMP + INTERVAL '15 hours 20 minutes')::TIMESTAMPTZ;
  t29 := now() - INTERVAL '28 minutes';
  t30 := now();

  -- ── Usuários ───────────────────────────────────────────────────────────────
  INSERT INTO "User" (id, codigo, nome, email, perfil, ativo, "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), u1, 'João Silva',   'seed.joao@empresa.com',  'SEPARADOR'::"Perfil", true, now(), now()),
    (gen_random_uuid(), u2, 'Maria Santos', 'seed.maria@empresa.com', 'SEPARADOR'::"Perfil", true, now(), now()),
    (gen_random_uuid(), u3, 'Pedro Costa',  'seed.pedro@empresa.com', 'SEPARADOR'::"Perfil", true, now(), now()),
    (gen_random_uuid(), u4, 'Ana Lima',     'seed.ana@empresa.com',   'SEPARADOR'::"Perfil", true, now(), now())
  ON CONFLICT (codigo) DO NOTHING;

  -- ── Sessões ────────────────────────────────────────────────────────────────
  INSERT INTO "SessaoConferencia"
    (id, "numeroUnico", "numeroConferencia", "idUsuario", status,
     "criadoEm", "dtAbertura", "dtFechamento")
  VALUES
    (s[1],  99001, 10001, u1, 'F', t01, t01, t02),
    (s[2],  99002, 10002, u1, 'F', t03, t03, t04),
    (s[3],  99003, 10003, u1, 'F', t05, t05, t06),
    (s[4],  99004, 10004, u1, 'F', t07, t07, t08),
    (s[5],  99005, 10005, u1, 'F', t09, t09, t10),
    (s[6],  99006, 10006, u2, 'F', t11, t11, t12),
    (s[7],  99007, 10007, u2, 'F', t13, t13, t14),
    (s[8],  99008, 10008, u2, 'F', t15, t15, t16),
    (s[9],  99009, 10009, u2, 'F', t17, t17, t18),
    (s[10], 99010, 10010, u3, 'F', t19, t19, t20),
    (s[11], 99011, 10011, u3, 'F', t21, t21, t22),
    (s[12], 99012, 10012, u3, 'F', t23, t23, t24),
    (s[13], 99013, 10013, u4, 'F', t25, t25, t26),
    (s[14], 99014, 10014, u4, 'F', t27, t27, t28),
    (s[15], 99015, 10015, u1, 'A', t29, t29, NULL)
  ON CONFLICT ("numeroUnico") DO NOTHING;

  -- ── Itens ──────────────────────────────────────────────────────────────────
  INSERT INTO "SessaoItem"
    (id, "sessaoId", sequencia, "idProduto", "nomeProduto", unidade,
     "qtdNeg", "qtdConferidaLocal", "pesoBruto")
  VALUES
    (gen_random_uuid(), s[1],  1, 2001, 'Caixa Produto A',  'CX', 12, 12, 6.0),
    (gen_random_uuid(), s[1],  2, 2002, 'Pacote Produto B', 'PC', 18, 18, 4.0),
    (gen_random_uuid(), s[2],  1, 2001, 'Caixa Produto A',  'CX', 10, 10, 6.0),
    (gen_random_uuid(), s[2],  2, 2003, 'Fardo Produto C',  'FD',  8,  8, 9.0),
    (gen_random_uuid(), s[2],  3, 2002, 'Pacote Produto B', 'PC', 20, 20, 4.0),
    (gen_random_uuid(), s[3],  1, 2002, 'Pacote Produto B', 'PC', 15, 15, 4.0),
    (gen_random_uuid(), s[3],  2, 2001, 'Caixa Produto A',  'CX',  9,  9, 6.0),
    (gen_random_uuid(), s[4],  1, 2003, 'Fardo Produto C',  'FD', 12, 12, 9.0),
    (gen_random_uuid(), s[4],  2, 2001, 'Caixa Produto A',  'CX', 14, 14, 6.0),
    (gen_random_uuid(), s[4],  3, 2002, 'Pacote Produto B', 'PC', 10, 10, 4.0),
    (gen_random_uuid(), s[5],  1, 2001, 'Caixa Produto A',  'CX', 11, 11, 6.0),
    (gen_random_uuid(), s[5],  2, 2003, 'Fardo Produto C',  'FD',  7,  7, 9.0),
    (gen_random_uuid(), s[6],  1, 2002, 'Pacote Produto B', 'PC', 22, 22, 4.0),
    (gen_random_uuid(), s[6],  2, 2001, 'Caixa Produto A',  'CX',  8,  8, 6.0),
    (gen_random_uuid(), s[7],  1, 2003, 'Fardo Produto C',  'FD', 10, 10, 9.0),
    (gen_random_uuid(), s[7],  2, 2002, 'Pacote Produto B', 'PC', 16, 16, 4.0),
    (gen_random_uuid(), s[7],  3, 2001, 'Caixa Produto A',  'CX',  6,  6, 6.0),
    (gen_random_uuid(), s[8],  1, 2001, 'Caixa Produto A',  'CX', 20, 20, 6.0),
    (gen_random_uuid(), s[8],  2, 2003, 'Fardo Produto C',  'FD',  9,  9, 9.0),
    (gen_random_uuid(), s[9],  1, 2002, 'Pacote Produto B', 'PC', 25, 25, 4.0),
    (gen_random_uuid(), s[9],  2, 2001, 'Caixa Produto A',  'CX',  7,  7, 6.0),
    (gen_random_uuid(), s[10], 1, 2003, 'Fardo Produto C',  'FD', 15, 15, 9.0),
    (gen_random_uuid(), s[10], 2, 2001, 'Caixa Produto A',  'CX', 10, 10, 6.0),
    (gen_random_uuid(), s[11], 1, 2001, 'Caixa Produto A',  'CX', 18, 18, 6.0),
    (gen_random_uuid(), s[11], 2, 2002, 'Pacote Produto B', 'PC', 30, 30, 4.0),
    (gen_random_uuid(), s[11], 3, 2003, 'Fardo Produto C',  'FD', 12, 12, 9.0),
    (gen_random_uuid(), s[12], 1, 2002, 'Pacote Produto B', 'PC', 20, 20, 4.0),
    (gen_random_uuid(), s[12], 2, 2003, 'Fardo Produto C',  'FD',  8,  8, 9.0),
    (gen_random_uuid(), s[13], 1, 2001, 'Caixa Produto A',  'CX', 13, 13, 6.0),
    (gen_random_uuid(), s[13], 2, 2002, 'Pacote Produto B', 'PC', 11, 11, 4.0),
    (gen_random_uuid(), s[14], 1, 2003, 'Fardo Produto C',  'FD', 14, 14, 9.0),
    (gen_random_uuid(), s[14], 2, 2001, 'Caixa Produto A',  'CX',  9,  9, 6.0),
    (gen_random_uuid(), s[15], 1, 2001, 'Caixa Produto A',  'CX', 16,  0, 6.0),
    (gen_random_uuid(), s[15], 2, 2002, 'Pacote Produto B', 'PC', 12,  0, 4.0);

  -- ── Leituras ───────────────────────────────────────────────────────────────
  INSERT INTO "SessaoLeitura"
    (id, "sessaoId", "seqVol", "idProduto", unidade, controle, qtd, "qtdVolpad", "criadoEm")
  VALUES
    (gen_random_uuid(), s[1],  1, 2001, 'CX', ' ', 6,  6,  t01 + INTERVAL '5 min'),
    (gen_random_uuid(), s[1],  1, 2001, 'CX', ' ', 6,  6,  t01 + INTERVAL '12 min'),
    (gen_random_uuid(), s[1],  2, 2002, 'PC', ' ', 9,  9,  t01 + INTERVAL '22 min'),
    (gen_random_uuid(), s[1],  2, 2002, 'PC', ' ', 9,  9,  t01 + INTERVAL '35 min'),
    (gen_random_uuid(), s[2],  1, 2001, 'CX', ' ', 5,  5,  t03 + INTERVAL '8 min'),
    (gen_random_uuid(), s[2],  1, 2001, 'CX', ' ', 5,  5,  t03 + INTERVAL '18 min'),
    (gen_random_uuid(), s[2],  2, 2003, 'FD', ' ', 8,  8,  t03 + INTERVAL '28 min'),
    (gen_random_uuid(), s[2],  3, 2002, 'PC', ' ', 10, 10, t03 + INTERVAL '38 min'),
    (gen_random_uuid(), s[2],  3, 2002, 'PC', ' ', 10, 10, t03 + INTERVAL '48 min'),
    (gen_random_uuid(), s[3],  1, 2002, 'PC', ' ', 8,  8,  t05 + INTERVAL '6 min'),
    (gen_random_uuid(), s[3],  1, 2001, 'CX', ' ', 9,  9,  t05 + INTERVAL '20 min'),
    (gen_random_uuid(), s[3],  2, 2002, 'PC', ' ', 7,  7,  t05 + INTERVAL '35 min'),
    (gen_random_uuid(), s[4],  1, 2003, 'FD', ' ', 6,  6,  t07 + INTERVAL '5 min'),
    (gen_random_uuid(), s[4],  1, 2001, 'CX', ' ', 7,  7,  t07 + INTERVAL '15 min'),
    (gen_random_uuid(), s[4],  2, 2003, 'FD', ' ', 6,  6,  t07 + INTERVAL '28 min'),
    (gen_random_uuid(), s[4],  2, 2001, 'CX', ' ', 7,  7,  t07 + INTERVAL '38 min'),
    (gen_random_uuid(), s[4],  2, 2002, 'PC', ' ', 10, 10, t07 + INTERVAL '48 min'),
    (gen_random_uuid(), s[5],  1, 2001, 'CX', ' ', 6,  6,  t09 + INTERVAL '7 min'),
    (gen_random_uuid(), s[5],  1, 2003, 'FD', ' ', 4,  4,  t09 + INTERVAL '22 min'),
    (gen_random_uuid(), s[5],  2, 2001, 'CX', ' ', 5,  5,  t09 + INTERVAL '38 min'),
    (gen_random_uuid(), s[6],  1, 2002, 'PC', ' ', 11, 11, t11 + INTERVAL '6 min'),
    (gen_random_uuid(), s[6],  1, 2001, 'CX', ' ', 4,  4,  t11 + INTERVAL '20 min'),
    (gen_random_uuid(), s[6],  2, 2002, 'PC', ' ', 11, 11, t11 + INTERVAL '35 min'),
    (gen_random_uuid(), s[7],  1, 2003, 'FD', ' ', 5,  5,  t13 + INTERVAL '7 min'),
    (gen_random_uuid(), s[7],  1, 2002, 'PC', ' ', 8,  8,  t13 + INTERVAL '22 min'),
    (gen_random_uuid(), s[7],  2, 2001, 'CX', ' ', 3,  3,  t13 + INTERVAL '38 min'),
    (gen_random_uuid(), s[7],  2, 2003, 'FD', ' ', 5,  5,  t13 + INTERVAL '50 min'),
    (gen_random_uuid(), s[8],  1, 2001, 'CX', ' ', 10, 10, t15 + INTERVAL '10 min'),
    (gen_random_uuid(), s[8],  1, 2001, 'CX', ' ', 10, 10, t15 + INTERVAL '30 min'),
    (gen_random_uuid(), s[8],  2, 2003, 'FD', ' ', 5,  5,  t15 + INTERVAL '52 min'),
    (gen_random_uuid(), s[9],  1, 2002, 'PC', ' ', 13, 13, t17 + INTERVAL '8 min'),
    (gen_random_uuid(), s[9],  1, 2002, 'PC', ' ', 12, 12, t17 + INTERVAL '22 min'),
    (gen_random_uuid(), s[9],  2, 2001, 'CX', ' ', 4,  4,  t17 + INTERVAL '38 min'),
    (gen_random_uuid(), s[10], 1, 2003, 'FD', ' ', 8,  8,  t19 + INTERVAL '10 min'),
    (gen_random_uuid(), s[10], 1, 2001, 'CX', ' ', 5,  5,  t19 + INTERVAL '30 min'),
    (gen_random_uuid(), s[10], 2, 2003, 'FD', ' ', 7,  7,  t19 + INTERVAL '50 min'),
    (gen_random_uuid(), s[11], 1, 2001, 'CX', ' ', 9,  9,  t21 + INTERVAL '12 min'),
    (gen_random_uuid(), s[11], 1, 2002, 'PC', ' ', 15, 15, t21 + INTERVAL '30 min'),
    (gen_random_uuid(), s[11], 2, 2001, 'CX', ' ', 9,  9,  t21 + INTERVAL '48 min'),
    (gen_random_uuid(), s[11], 2, 2003, 'FD', ' ', 6,  6,  t21 + INTERVAL '65 min'),
    (gen_random_uuid(), s[11], 3, 2002, 'PC', ' ', 15, 15, t21 + INTERVAL '80 min'),
    (gen_random_uuid(), s[12], 1, 2002, 'PC', ' ', 10, 10, t23 + INTERVAL '10 min'),
    (gen_random_uuid(), s[12], 1, 2003, 'FD', ' ', 4,  4,  t23 + INTERVAL '28 min'),
    (gen_random_uuid(), s[12], 2, 2002, 'PC', ' ', 10, 10, t23 + INTERVAL '45 min'),
    (gen_random_uuid(), s[13], 1, 2001, 'CX', ' ', 7,  7,  t25 + INTERVAL '7 min'),
    (gen_random_uuid(), s[13], 1, 2002, 'PC', ' ', 6,  6,  t25 + INTERVAL '25 min'),
    (gen_random_uuid(), s[13], 2, 2001, 'CX', ' ', 6,  6,  t25 + INTERVAL '38 min'),
    (gen_random_uuid(), s[14], 1, 2003, 'FD', ' ', 7,  7,  t27 + INTERVAL '8 min'),
    (gen_random_uuid(), s[14], 1, 2001, 'CX', ' ', 5,  5,  t27 + INTERVAL '25 min'),
    (gen_random_uuid(), s[14], 2, 2003, 'FD', ' ', 7,  7,  t27 + INTERVAL '42 min');

  -- ── Volumes ────────────────────────────────────────────────────────────────
  INSERT INTO "SessaoVolume" (id, "sessaoId", "seqVol", ordem)
  VALUES
    (gen_random_uuid(), s[1],  1, 1), (gen_random_uuid(), s[1],  2, 2),
    (gen_random_uuid(), s[2],  1, 1), (gen_random_uuid(), s[2],  2, 2), (gen_random_uuid(), s[2],  3, 3),
    (gen_random_uuid(), s[3],  1, 1), (gen_random_uuid(), s[3],  2, 2),
    (gen_random_uuid(), s[4],  1, 1), (gen_random_uuid(), s[4],  2, 2), (gen_random_uuid(), s[4],  3, 3),
    (gen_random_uuid(), s[5],  1, 1), (gen_random_uuid(), s[5],  2, 2),
    (gen_random_uuid(), s[6],  1, 1), (gen_random_uuid(), s[6],  2, 2),
    (gen_random_uuid(), s[7],  1, 1), (gen_random_uuid(), s[7],  2, 2), (gen_random_uuid(), s[7],  3, 3),
    (gen_random_uuid(), s[8],  1, 1), (gen_random_uuid(), s[8],  2, 2),
    (gen_random_uuid(), s[9],  1, 1), (gen_random_uuid(), s[9],  2, 2),
    (gen_random_uuid(), s[10], 1, 1), (gen_random_uuid(), s[10], 2, 2),
    (gen_random_uuid(), s[11], 1, 1), (gen_random_uuid(), s[11], 2, 2), (gen_random_uuid(), s[11], 3, 3),
    (gen_random_uuid(), s[12], 1, 1), (gen_random_uuid(), s[12], 2, 2),
    (gen_random_uuid(), s[13], 1, 1), (gen_random_uuid(), s[13], 2, 2),
    (gen_random_uuid(), s[14], 1, 1), (gen_random_uuid(), s[14], 2, 2)
  ON CONFLICT ("sessaoId", "seqVol") DO NOTHING;

  -- ── LogLogin ────────────────────────────────────────────────────────────────
  INSERT INTO "LogLogin" (id, "idUsuario", "criadoEm") VALUES
    (gen_random_uuid(), u1, (d::TIMESTAMP + INTERVAL  '6 hours 58 minutes')::TIMESTAMPTZ),
    (gen_random_uuid(), u2, (d::TIMESTAMP + INTERVAL  '7 hours 30 minutes')::TIMESTAMPTZ),
    (gen_random_uuid(), u3, (d::TIMESTAMP + INTERVAL  '7 hours 55 minutes')::TIMESTAMPTZ),
    (gen_random_uuid(), u4, (d::TIMESTAMP + INTERVAL  '9 hours 20 minutes')::TIMESTAMPTZ),
    (gen_random_uuid(), u1, (d::TIMESTAMP + INTERVAL '12 hours 55 minutes')::TIMESTAMPTZ),
    (gen_random_uuid(), u2, (d::TIMESTAMP + INTERVAL '13 hours 45 minutes')::TIMESTAMPTZ);

  -- ── LogHeartbeat ────────────────────────────────────────────────────────────
  -- João e Maria aparecem em "online agora" (< 5min), Pedro e Ana ficam de fora
  INSERT INTO "LogHeartbeat" (id, "idUsuario", "numeroConferencia", "criadoEm") VALUES
    (gen_random_uuid(), u1, 10015, now() - INTERVAL  '4 minutes'),
    (gen_random_uuid(), u1, 10015, now() - INTERVAL  '2 minutes'),
    (gen_random_uuid(), u2, NULL,  now() - INTERVAL  '3 minutes'),
    (gen_random_uuid(), u3, 10012, now() - INTERVAL '35 minutes'),
    (gen_random_uuid(), u4, 10014, now() - INTERVAL '55 minutes');

  RAISE NOTICE 'Seed inserido com sucesso — 15 sessões, 4 usuários seed criados.';

END $$;
