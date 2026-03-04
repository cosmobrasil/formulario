UPDATE empresas
SET
    nome_empresa = REGEXP_REPLACE(TRIM(nome_empresa), '\s+', ' ', 'g'),
    nome_responsavel = REGEXP_REPLACE(TRIM(nome_responsavel), '\s+', ' ', 'g'),
    email = LOWER(REGEXP_REPLACE(TRIM(email), '\s+', ' ', 'g')),
    cidade = UPPER(REGEXP_REPLACE(TRIM(cidade), '\s+', ' ', 'g')),
    setor_economico = INITCAP(LOWER(REGEXP_REPLACE(TRIM(setor_economico), '\s+', ' ', 'g'))),
    produto_avaliado = REGEXP_REPLACE(TRIM(produto_avaliado), '\s+', ' ', 'g');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'empresas'
          AND column_name = 'uf'
    ) THEN
        EXECUTE '
            UPDATE empresas
            SET uf = CASE
                WHEN uf IS NULL OR TRIM(uf) = '''' THEN NULL
                ELSE UPPER(SUBSTRING(REGEXP_REPLACE(TRIM(uf), ''\s+'', '''', ''g'') FROM 1 FOR 2))
            END
        ';
    END IF;
END $$;
