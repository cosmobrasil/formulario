CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE empresas
SET
    cidade = UPPER(unaccent(REGEXP_REPLACE(TRIM(cidade), '\s+', ' ', 'g'))),
    setor_economico = INITCAP(LOWER(unaccent(REGEXP_REPLACE(TRIM(setor_economico), '\s+', ' ', 'g')))),
    produto_avaliado = INITCAP(LOWER(unaccent(REGEXP_REPLACE(TRIM(produto_avaliado), '\s+', ' ', 'g')))),
    nome_empresa = REGEXP_REPLACE(TRIM(nome_empresa), '\s+', ' ', 'g'),
    nome_responsavel = REGEXP_REPLACE(TRIM(nome_responsavel), '\s+', ' ', 'g'),
    email = LOWER(REGEXP_REPLACE(TRIM(email), '\s+', ' ', 'g'));
