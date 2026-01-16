-- PostgreSQL Schema for Questionário de Circularidade 2.0 - 2026
-- Database schema for Railway deployment

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela para armazenar dados de identificação das empresas
CREATE TABLE empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome_empresa VARCHAR(200) NOT NULL,
    cnpj VARCHAR(14) NOT NULL UNIQUE,
    nome_responsavel VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    celular VARCHAR(20) NOT NULL,
    setor_economico VARCHAR(100) NOT NULL,
    produto_avaliado VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraints
    CONSTRAINT chk_cnpj CHECK (LENGTH(cnpj) = 14 AND cnpj ~ '^[0-9]+$'),
    CONSTRAINT chk_celular CHECK (celular ~ '^[0-9]{10,11}$')
);

-- Tabela para armazenar respostas do questionário
CREATE TABLE questionarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    
    -- Entrada (Input)
    materia_prima INTEGER NOT NULL, -- Q1: 1-5 (valores do questionário)
    
    -- Gestão de Resíduos
    residuos INTEGER NOT NULL, -- Q2: 1-3
    
    -- Saída do Produto (Output)
    desmonte INTEGER NOT NULL, -- Q3: 1-3 (Sim/Não/Não sei)
    descarte INTEGER NOT NULL, -- Q4: 1-3 (Sim/Não/Não sei)
    recuperacao INTEGER NOT NULL, -- Q5: 1-3 (Sim/Não/Não sei)
    reciclagem INTEGER NOT NULL, -- Q6: 1-3 (Sim/Não/Não sei)
    
    -- Vida do Produto
    durabilidade INTEGER NOT NULL, -- Q7: 1-3 (Sim/Não/Não sei)
    reparavel INTEGER NOT NULL, -- Q8: 1-3 (Sim/Não/Não sei)
    reaproveitavel INTEGER NOT NULL, -- Q9: 1-3 (Sim/Não/Não sei)
    
    -- Monitoramento
    ciclo_estendido INTEGER NOT NULL, -- Q10: 1-3 (Sim/Não/Não sei)
    ciclo_rastreado INTEGER NOT NULL, -- Q11: 1-3 (Sim/Não/Não sei)
    documentacao INTEGER NOT NULL, -- Q12: 1-3 (Sim/Não/Não sei)
    
    -- Campos calculados
    soma INTEGER,
    indice_global_circularidade DECIMAL(10,2),
    indice_maturidade_estruturante DECIMAL(10,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraints
    CONSTRAINT check_materia_prima CHECK (materia_prima >= 1 AND materia_prima <= 5),
    CONSTRAINT check_residuos CHECK (residuos >= 1 AND residuos <= 3),
    CONSTRAINT check_desmonte CHECK (desmonte >= 1 AND desmonte <= 3),
    CONSTRAINT check_descarte CHECK (descarte >= 1 AND descarte <= 3),
    CONSTRAINT check_recuperacao CHECK (recuperacao >= 1 AND recuperacao <= 3),
    CONSTRAINT check_reciclagem CHECK (reciclagem >= 1 AND reciclagem <= 3),
    CONSTRAINT check_durabilidade CHECK (durabilidade >= 1 AND durabilidade <= 3),
    CONSTRAINT check_reparavel CHECK (reparavel >= 1 AND reparavel <= 3),
    CONSTRAINT check_reaproveitavel CHECK (reaproveitavel >= 1 AND reaproveitavel <= 3),
    CONSTRAINT check_ciclo_estendido CHECK (ciclo_estendido >= 1 AND ciclo_estendido <= 3),
    CONSTRAINT check_ciclo_rastreado CHECK (ciclo_rastreado >= 1 AND ciclo_rastreado <= 3),
    CONSTRAINT check_documentacao CHECK (documentacao >= 1 AND documentacao <= 3)
);

-- Índices para melhorar performance de consultas
CREATE INDEX idx_questionarios_empresa_id ON questionarios(empresa_id);
CREATE INDEX idx_questionarios_created_at ON questionarios(created_at);
CREATE INDEX idx_empresas_email ON empresas(email);
CREATE INDEX idx_empresas_cnpj ON empresas(cnpj);
CREATE INDEX idx_empresas_cidade ON empresas(cidade);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para atualizar updated_at
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questionarios_updated_at BEFORE UPDATE ON questionarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View para exportação dos dados para o dashboard
CREATE VIEW vw_dados_dashboard AS
SELECT 
    e.nome_empresa AS EMPRESA,
    e.cidade AS CIDADE,
    e.produto_avaliado AS PRODUTO,
    q.materia_prima AS MATERIA_PRIMA,
    q.residuos AS RESIDUOS,
    q.desmonte AS DESMONTE,
    q.descarte AS DESCARTE,
    q.recuperacao AS RECUPERACAO,
    q.reciclagem AS RECICLAGEM,
    q.durabilidade AS DURABILIDADE,
    q.reparavel AS REPARAVEL,
    q.reaproveitavel AS REAPROVEITAVEL,
    q.ciclo_estendido AS CICLO_ESTENDIDO,
    q.ciclo_rastreado AS CICLO_RASTREADO,
    q.documentacao AS DOCUMENTACAO,
    q.soma AS SOMA,
    q.indice_global_circularidade AS INDICE_GLOBAL_DE_CIRCULARIDADE,
    q.indice_maturidade_estruturante AS INDICE_DE_MATURIDADE_ESTRUTURANTE,
    q.created_at,
    q.updated_at
FROM questionarios q
INNER JOIN empresas e ON q.empresa_id = e.id;

-- Comentários para documentação
COMMENT ON TABLE empresas IS 'Armazena dados de identificação das empresas que respondem o questionário 2.0 - 2026';
COMMENT ON TABLE questionarios IS 'Armazena as respostas do questionário de circularidade 2.0 - 2026';
COMMENT ON VIEW vw_dados_dashboard IS 'View para exportação dos dados no formato esperado pelo dashboard';

-- Segurança: criar usuário com permissões restritas para aplicação
-- Este usuário terá apenas permissões de INSERT nas tabelas principais
CREATE USER questionario_app WITH PASSWORD 'defina_uma_senha_segura_aqui';

-- Conceder permissões mínimas necessárias
GRANT CONNECT ON DATABASE postgres TO questionario_app;
GRANT USAGE ON SCHEMA public TO questionario_app;

-- Permissões de INSERT apenas
GRANT INSERT ON TABLE empresas TO questionario_app;
GRANT INSERT ON TABLE questionarios TO questionario_app;

-- Permissões para usar sequências
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO questionario_app;

-- Revogar permissões desnecessárias
REVOKE SELECT, UPDATE, DELETE ON ALL TABLES FROM questionario_app;
REVOKE TRUNCATE ON ALL TABLES FROM questionario_app;

-- Para desenvolvimento, conceder SELECT temporariamente
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO questionario_app;