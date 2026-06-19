// Backend API para Questionário de Circularidade 2026
// Conecta frontend ao PostgreSQL Railway + Google Drive automático

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
require('dotenv').config();
const GoogleDriveService = require('./google-drive-service');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_DEBUG_ENDPOINTS = process.env.ENABLE_DEBUG_ENDPOINTS === 'true';
const CNPJ_API_TIMEOUT_MS = parseInt(process.env.CNPJ_API_TIMEOUT_MS || '8000', 10);
const ADMIN_PANEL_TOKEN = (process.env.ADMIN_PANEL_TOKEN || '').trim();
const ENABLE_RUNTIME_SCHEMA_AUTOFIX = process.env.ENABLE_RUNTIME_SCHEMA_AUTOFIX === 'true' || !IS_PRODUCTION;
let hasUfColumn = false;
let hasUnaccentExtension = false;
let hasRelatorioHtmlColumn = false;

// Inicializar serviço do Google Drive
const driveService = new GoogleDriveService();

// Middleware
app.disable('x-powered-by');

const defaultAllowedOrigins = [
    'https://questionario-circularidade-2026.netlify.app',
    'https://formulario-production-8df7.up.railway.app',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:3000'
];

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const originAllowlist = new Set(allowedOrigins.length > 0 ? allowedOrigins : defaultAllowedOrigins);

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (originAllowlist.has(origin)) return callback(null, true);
        if (/^https:\/\/[^/]+\.netlify\.app\b/i.test(origin)) return callback(null, true);
        return callback(new Error('Origem não permitida por CORS.'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-admin-token']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Configuração do PostgreSQL
const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Verificar conexão com o banco
pool.on('connect', () => {
    console.log('✅ Conectado ao PostgreSQL Railway');
});

pool.on('error', (err) => {
    console.error('❌ Erro na conexão PostgreSQL:', err);
});

async function carregarRecursosBanco() {
    try {
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'empresas'
                  AND column_name = 'uf'
            ) AS has_uf,
            EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'questionarios'
                  AND column_name = 'relatorio_html'
            ) AS has_relatorio_html,
            EXISTS (
                SELECT 1
                FROM pg_extension
                WHERE extname = 'unaccent'
            ) AS has_unaccent;
        `);
        hasUfColumn = !!result.rows[0]?.has_uf;
        hasRelatorioHtmlColumn = !!result.rows[0]?.has_relatorio_html;
        hasUnaccentExtension = !!result.rows[0]?.has_unaccent;
        console.log(`🧭 Coluna empresas.uf disponível: ${hasUfColumn ? 'SIM' : 'NÃO'}`);
        console.log(`🧭 Coluna questionarios.relatorio_html disponível: ${hasRelatorioHtmlColumn ? 'SIM' : 'NÃO'}`);
        console.log(`🧭 Extensão unaccent disponível: ${hasUnaccentExtension ? 'SIM' : 'NÃO'}`);

        if (!hasRelatorioHtmlColumn) {
            console.warn('⚠️ Coluna questionarios.relatorio_html AUSENTE. Execute a migration:');
            console.warn('   psql "$PGURL" -f backend/migrations/2026-06-19-add-relatorio-html.sql');
            if (!IS_PRODUCTION) {
                try {
                    await pool.query('ALTER TABLE public.questionarios ADD COLUMN IF NOT EXISTS relatorio_html TEXT');
                    hasRelatorioHtmlColumn = true;
                    console.log('✅ Coluna questionarios.relatorio_html criada automaticamente (apenas dev).');
                } catch (migrationError) {
                    console.warn('⚠️ Falha ao criar relatorio_html automaticamente:', migrationError.message);
                }
            }
        }
    } catch (error) {
        hasUfColumn = false;
        hasRelatorioHtmlColumn = false;
        hasUnaccentExtension = false;
        console.warn('⚠️ Não foi possível validar coluna UF no banco.');
    }
}

carregarRecursosBanco();

// Testar conexão
app.get('/api/health', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: result.rows[0].now,
            schema: {
                empresasUf: hasUfColumn,
                questionariosRelatorioHtml: hasRelatorioHtmlColumn,
                unaccent: hasUnaccentExtension,
                runtimeSchemaAutofix: ENABLE_RUNTIME_SCHEMA_AUTOFIX
            },
            auth: {
                adminPanelTokenConfigured: Boolean(ADMIN_PANEL_TOKEN)
            },
            drive: {
                authenticated: driveService.isAuthenticated()
            }
        });
    } catch (error) {
        console.error('Erro no health check:', error);
        res.status(500).json({
            status: 'error',
            message: IS_PRODUCTION ? 'Falha ao verificar banco de dados.' : error.message
        });
    }
});

// Função para limpar CNPJ (remover formatação)
function limparCNPJ(cnpj) {
    if (!cnpj) return '';
    return cnpj.replace(/\D/g, ''); // Remove tudo que não é dígito
}

function validarCNPJ(cnpj) {
    const cnpjLimpo = limparCNPJ(cnpj);
    if (!/^\d{14}$/.test(cnpjLimpo)) return false;
    if (/^(\d)\1{13}$/.test(cnpjLimpo)) return false;

    const calcularDigito = (base, pesos) => {
        const soma = base
            .split('')
            .reduce((acc, digito, index) => acc + (parseInt(digito, 10) * pesos[index]), 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    const base = cnpjLimpo.slice(0, 12);
    const digito1 = calcularDigito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const digito2 = calcularDigito(`${base}${digito1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    return cnpjLimpo === `${base}${digito1}${digito2}`;
}

// Função para limpar celular (remover formatação)
function limparCelular(celular) {
    if (!celular) return '';
    return celular.replace(/\D/g, ''); // Remove tudo que não é dígito
}

function mascararCNPJ(cnpj) {
    if (!cnpj || cnpj.length !== 14) return '***';
    return `${cnpj.slice(0, 2)}********${cnpj.slice(-4)}`;
}

function normalizarFiltro(valor) {
    const limpo = (valor || '').toString().trim();
    return limpo.length > 0 ? limpo : null;
}

function normalizarTexto(valor) {
    return (valor || '').toString().trim().replace(/\s+/g, ' ');
}

function normalizarCidade(valor) {
    return normalizarTexto(valor).toUpperCase();
}

function normalizarSetor(valor) {
    const t = normalizarTexto(valor).toLowerCase();
    return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizarProduto(valor) {
    return normalizarTexto(valor);
}

function removerAcentos(valor) {
    return normalizarTexto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatarProdutoExibicao(valor) {
    const produto = normalizarTexto(valor);
    const chave = removerAcentos(produto).toUpperCase();
    const mapa = {
        BONE: 'Boné',
        EMBARCACAO: 'Embarcação'
    };
    return mapa[chave] || produto;
}

function verificarAcessoAdmin(req, res) {
    if (!ADMIN_PANEL_TOKEN) return true;
    const tokenInformado = (req.headers['x-admin-token'] || req.query.token || '').toString().trim();
    if (tokenInformado === ADMIN_PANEL_TOKEN) return true;
    res.status(401).json({
        success: false,
        error: 'Acesso não autorizado ao painel administrativo.'
    });
    return false;
}

function pontosPergunta(pergunta, resposta) {
    const valor = Number(resposta || 0);
    const mapaPorPergunta = {
        1: { 1: 0, 2: 2, 3: 3, 4: 2, 5: 1 },
        2: { 1: 0, 2: 2, 3: 1 },
        5: { 1: 0, 2: 2, 3: 1 },
        6: { 1: 1, 2: 0, 3: 1 }
    };
    const mapa = mapaPorPergunta[pergunta] || { 1: 2, 2: 0, 3: 1 };
    return mapa[valor] ?? 0;
}

function percentualPergunta(pergunta, resposta) {
    const maximos = { 1: 3, 2: 2, 5: 2, 6: 1 };
    const maximo = maximos[pergunta] || 2;
    const pontos = pontosPergunta(pergunta, resposta);
    return Math.round((pontos / maximo) * 100);
}

function mediaCategoria(perguntas, respostas) {
    const soma = perguntas.reduce((acc, p) => acc + percentualPergunta(p, respostas[p]), 0);
    return perguntas.length > 0 ? Math.round(soma / perguntas.length) : 0;
}

function textoAlternativa(pergunta, resposta) {
    const alternativas = {
        1: { 1: 'Sim, totalmente reciclada', 2: 'Parcialmente reciclada', 3: 'Virgem (não reciclada)', 4: 'Mista', 5: 'Não sei' },
        default: { 1: 'Sim', 2: 'Não', 3: 'Não sei' }
    };
    const mapa = alternativas[pergunta] || alternativas.default;
    return mapa[Number(resposta)] || 'Não informado';
}

function formatarDataHora(value) {
    const data = new Date(value);
    return data.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function normalizarUF(valor) {
    const t = normalizarTexto(valor).replace(/\s+/g, '').toUpperCase();
    return t ? t.slice(0, 2) : null;
}

function construirWhereDashboard(reqQuery) {
    const params = [];
    const filtros = [];
    const campoNormalizado = (coluna) => hasUnaccentExtension
        ? `UPPER(unaccent(TRIM(${coluna})))`
        : `UPPER(TRIM(${coluna}))`;
    const paramNormalizado = (idx) => hasUnaccentExtension
        ? `UPPER(unaccent($${idx}))`
        : `UPPER($${idx})`;

    const setor = normalizarFiltro(reqQuery.setor);
    const produto = normalizarFiltro(reqQuery.produto);
    const cidade = normalizarFiltro(reqQuery.cidade);
    const uf = normalizarFiltro(reqQuery.uf);
    const dataInicio = normalizarFiltro(reqQuery.data_inicio);
    const dataFim = normalizarFiltro(reqQuery.data_fim);

    if (setor) {
        params.push(setor);
        filtros.push(`${campoNormalizado('e.setor_economico')} = ${paramNormalizado(params.length)}`);
    }

    if (produto) {
        params.push(produto);
        filtros.push(`${campoNormalizado('e.produto_avaliado')} = ${paramNormalizado(params.length)}`);
    }

    if (cidade) {
        params.push(cidade);
        filtros.push(`${campoNormalizado('e.cidade')} = ${paramNormalizado(params.length)}`);
    }

    if (uf && hasUfColumn) {
        params.push(uf.toUpperCase());
        filtros.push(`UPPER(e.uf) = $${params.length}`);
    }

    if (dataInicio) {
        params.push(dataInicio);
        filtros.push(`q.created_at::date >= $${params.length}::date`);
    }

    if (dataFim) {
        params.push(dataFim);
        filtros.push(`q.created_at::date <= $${params.length}::date`);
    }

    return {
        whereClause: filtros.length ? `WHERE ${filtros.join(' AND ')}` : '',
        params
    };
}

function calcularPercentualPergunta(pergunta, mediaPontos) {
    const maximos = { 1: 3, 2: 2, 5: 2, 6: 1 };
    const maximo = maximos[pergunta] || 2;
    const pontos = Number(mediaPontos || 0);
    return Math.round((pontos / maximo) * 100);
}

function mediaPercentualPerguntas(listaPerguntas, medias) {
    if (!listaPerguntas.length) return 0;
    const soma = listaPerguntas.reduce((acc, id) => acc + calcularPercentualPergunta(id, medias[id]), 0);
    return Math.round(soma / listaPerguntas.length);
}

const QUESTIONARIO_RESPOSTA_CAMPOS = [
    'materia_prima',
    'residuos',
    'desmonte',
    'descarte',
    'recuperacao',
    'reciclagem',
    'durabilidade',
    'reparavel',
    'reaproveitavel',
    'ciclo_estendido',
    'ciclo_rastreado',
    'documentacao'
];

function sanitizarNomeArquivo(valor) {
    return normalizarTexto(valor)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'empresa';
}

function validarPayloadQuestionario(payload) {
    const erros = [];

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return ['Corpo da requisição inválido.'];
    }

    if (!payload.empresa || typeof payload.empresa !== 'object' || Array.isArray(payload.empresa)) {
        erros.push('Campo empresa é obrigatório.');
    }

    if (!payload.respostas || typeof payload.respostas !== 'object' || Array.isArray(payload.respostas)) {
        erros.push('Campo respostas é obrigatório.');
    }

    if (!payload.pontuacao || typeof payload.pontuacao !== 'object' || Array.isArray(payload.pontuacao)) {
        erros.push('Campo pontuacao é obrigatório.');
    }

    if ('relatorioHtml' in payload && payload.relatorioHtml != null && typeof payload.relatorioHtml !== 'string') {
        erros.push('Campo relatorioHtml deve ser texto quando informado.');
    }

    if (payload.respostas && typeof payload.respostas === 'object' && !Array.isArray(payload.respostas)) {
        const faltantes = QUESTIONARIO_RESPOSTA_CAMPOS.filter((campo) => !(campo in payload.respostas));
        if (faltantes.length > 0) {
            erros.push(`Campos de respostas ausentes: ${faltantes.join(', ')}.`);
        }
    }

    if (payload.pontuacao && typeof payload.pontuacao === 'object' && !Array.isArray(payload.pontuacao)) {
        const pontuacao = payload.pontuacao;
        if (!('pontos' in pontuacao)) {
            erros.push('Campo pontuacao.pontos é obrigatório.');
        }
        if (!('percentual' in pontuacao)) {
            erros.push('Campo pontuacao.percentual é obrigatório.');
        }
    }

    return erros;
}

function agendarUploadDrive({ relatorioHtml, nomeEmpresa, pontuacaoPercentual }) {
    if (!driveService.isAuthenticated()) {
        return {
            scheduled: false,
            reason: 'Google Drive não autenticado'
        };
    }

    if (!relatorioHtml) {
        return {
            scheduled: false,
            reason: 'HTML não fornecido'
        };
    }

    const fileName = `Relatorio_${sanitizarNomeArquivo(nomeEmpresa)}_${Date.now()}.doc`;
    const descricao = `Relatório de Circularidade - ${nomeEmpresa} - Índice: ${pontuacaoPercentual}%`;

    setImmediate(() => {
        (async () => {
            try {
                console.log('💾 Salvando relatório no Google Drive em segundo plano...');
                const driveResult = await driveService.saveFile(relatorioHtml, fileName, descricao);
                console.log('✅ Relatório salvo no Drive:', driveResult.viewUrl);
            } catch (driveError) {
                console.warn('⚠️ Erro ao salvar no Drive em segundo plano:', driveError);
            }
        })().catch((error) => {
            console.warn('⚠️ Falha inesperada no fluxo assíncrono do Google Drive:', error);
        });
    });

    return {
        scheduled: true,
        fileName
    };
}

async function consultarCnpjEmpresaqui(cnpj, token, signal) {
    const response = await fetch(
        `https://www.empresaqui.com.br/api/${token}/${cnpj}`,
        { signal }
    );
    const bodyText = await response.text();
    let data = null;
    try {
        data = bodyText ? JSON.parse(bodyText) : null;
    } catch {
        data = null;
    }
    if (!response.ok || !data || data.erro) return null;
    return {
        razao: data.razao,
        fantasia: data.fantasia,
        email: data.email,
        telefone: `${data.ddd_1 || ''}${data.tel_1 || ''}`,
        cidade: data.log_municipio,
        uf: data.log_uf,
        cnae_principal: data.cnae_principal
    };
}

async function consultarCnpjFallback(cnpj, signal) {
    const response = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
        { signal }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return {
        razao: data.razao_social,
        fantasia: data.nome_fantasia,
        email: data.email,
        telefone: `${data.ddd_telefone_1 || ''}`,
        cidade: data.municipio,
        uf: data.uf,
        cnae_principal: data.cnae_fiscal
    };
}

// Endpoint para consulta de CNPJ com fallback automático
app.get('/api/cnpj/:cnpj', async (req, res) => {
    const { cnpj } = req.params;
    const token = process.env.EMPRESAQUI_TOKEN;
    const cnpjLimpo = limparCNPJ(cnpj);

    if (!validarCNPJ(cnpjLimpo)) {
        return res.status(400).json({
            success: false,
            error: 'CNPJ inválido. Informe 14 dígitos válidos.'
        });
    }

    let result = null;
    let fallbackAtivo = false;

    // Tentativa 1: EmpresaAqui
    if (token && token !== 'SEU_TOKEN_AQUI') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CNPJ_API_TIMEOUT_MS);
        try {
            console.log(`🔍 Consultando CNPJ (EmpresaAqui): ${mascararCNPJ(cnpjLimpo)}`);
            result = await consultarCnpjEmpresaqui(cnpjLimpo, token, controller.signal);
            if (result) {
                console.log('✅ Dados obtidos via EmpresaAqui');
            }
        } catch (error) {
            console.warn('⚠️ EmpresaAqui falhou:', error.name === 'AbortError' ? 'timeout' : error.message);
            fallbackAtivo = true;
        } finally {
            clearTimeout(timeout);
        }
    } else {
        fallbackAtivo = true;
    }

    // Tentativa 2: Fallback (BrasilAPI)
    if (!result) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CNPJ_API_TIMEOUT_MS);
        try {
            console.log(`🔍 Consultando CNPJ (BrasilAPI fallback): ${mascararCNPJ(cnpjLimpo)}`);
            result = await consultarCnpjFallback(cnpjLimpo, controller.signal);
            if (result) {
                console.log('✅ Dados obtidos via BrasilAPI (fallback)');
            }
        } catch (error) {
            console.warn('⚠️ BrasilAPI fallback também falhou:', error.name === 'AbortError' ? 'timeout' : error.message);
        } finally {
            clearTimeout(timeout);
        }
    }

    if (!result) {
        return res.status(404).json({
            success: false,
            error: 'CNPJ não encontrado ou serviço de consulta indisponível.'
        });
    }

    res.json({
        success: true,
        fallback: fallbackAtivo,
        data: result
    });
});

// Endpoint para salvar questionário
app.post('/api/questionario', async (req, res) => {
    const validationErrors = validarPayloadQuestionario(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Payload inválido para o questionário.',
            details: validationErrors
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { empresa, respostas, pontuacao, relatorioHtml } = req.body;

        // Limpar e definir fallbacks robustos para os campos da empresa
        const nomeEmpresa = (empresa.nomeEmpresa || '').toString().trim() || 'não identificado';
        const nomeResponsavel = (empresa.nomeResponsavel || '').toString().trim() || 'não identificado';
        const email = (empresa.email || '').toString().trim() || 'sem-email@cosmobrasil.app';
        const cidade = (empresa.cidade || '').toString().trim() || 'NÃO INFORMADO';
        const setorEconomico = (empresa.setorEconomico || '').toString().trim() || 'Outro';
        const produtoAvaliado = (empresa.produtoAvaliado || '').toString().trim() || 'Não Informado';
        const uf = (empresa.uf || '').toString().trim() || null;

        // Limpar CNPJ e celular
        let cnpjLimpo = limparCNPJ(empresa.cnpj);
        if (cnpjLimpo.length !== 14) {
            // Gerar CNPJ fictício único de 14 dígitos (9 + 12 últimos dígitos do timestamp em milissegundos + 1 dígito aleatório)
            const tsStr = Date.now().toString();
            const randomDigit = Math.floor(Math.random() * 10).toString();
            cnpjLimpo = '9' + tsStr.slice(-12) + randomDigit;
        }

        let celularLimpo = limparCelular(empresa.celular);
        if (celularLimpo.length < 10 || celularLimpo.length > 11) {
            celularLimpo = '00000000000'; // Fallback para 11 dígitos para chk_celular
        }

        console.log('📝 Dados do questionário recebidos.');

        // 1. Verificar se empresa já existe pelo CNPJ limpo
        let empresaId;
        const existingEmpresa = await client.query(
            'SELECT id FROM empresas WHERE cnpj = $1',
            [cnpjLimpo]
        );

        if (existingEmpresa.rows.length > 0) {
            // Empresa já existe - usar ID existente
            empresaId = existingEmpresa.rows[0].id;
            if (hasUfColumn) {
                await client.query(
                    `UPDATE empresas
                     SET nome_empresa = $1,
                         nome_responsavel = $2,
                         email = $3,
                         cidade = $4,
                         celular = $5,
                         setor_economico = $6,
                         produto_avaliado = $7,
                         uf = $8
                     WHERE id = $9`,
                    [
                        normalizarTexto(nomeEmpresa),
                        normalizarTexto(nomeResponsavel),
                        normalizarTexto(email).toLowerCase(),
                        normalizarCidade(cidade),
                        celularLimpo,
                        normalizarSetor(setorEconomico),
                        normalizarProduto(produtoAvaliado),
                        normalizarUF(uf),
                        empresaId
                    ]
                );
            } else {
                await client.query(
                    `UPDATE empresas
                     SET nome_empresa = $1,
                         nome_responsavel = $2,
                         email = $3,
                         cidade = $4,
                         celular = $5,
                         setor_economico = $6,
                         produto_avaliado = $7
                     WHERE id = $8`,
                    [
                        normalizarTexto(nomeEmpresa),
                        normalizarTexto(nomeResponsavel),
                        normalizarTexto(email).toLowerCase(),
                        normalizarCidade(cidade),
                        celularLimpo,
                        normalizarSetor(setorEconomico),
                        normalizarProduto(produtoAvaliado),
                        empresaId
                    ]
                );
            }
            console.log('📌 Empresa já cadastrada, reutilizando ID:', empresaId);
        } else {
            // Nova empresa - inserir com dados limpos
            const empresaValues = [
                normalizarTexto(nomeEmpresa),
                cnpjLimpo,
                normalizarTexto(nomeResponsavel),
                normalizarTexto(email).toLowerCase(),
                normalizarCidade(cidade),
                celularLimpo,
                normalizarSetor(setorEconomico),
                normalizarProduto(produtoAvaliado)
            ];

            let insertEmpresaSql = `INSERT INTO empresas (nome_empresa, cnpj, nome_responsavel, email, cidade, celular, setor_economico, produto_avaliado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id`;

            if (hasUfColumn) {
                empresaValues.push(normalizarUF(uf));
                insertEmpresaSql = `INSERT INTO empresas (nome_empresa, cnpj, nome_responsavel, email, cidade, celular, setor_economico, produto_avaliado, uf)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id`;
            }

            const empresaResult = await client.query(insertEmpresaSql, empresaValues);
            empresaId = empresaResult.rows[0].id;
            console.log('✅ Nova empresa cadastrada:', empresaId);
        }

        // 2. Inserir questionário
        const questionarioParams = [
            empresaId,
            respostas.materia_prima,
            respostas.residuos,
            respostas.desmonte,
            respostas.descarte,
            respostas.recuperacao,
            respostas.reciclagem,
            respostas.durabilidade,
            respostas.reparavel,
            respostas.reaproveitavel,
            respostas.ciclo_estendido,
            respostas.ciclo_rastreado,
            respostas.documentacao,
            pontuacao.pontos,
            pontuacao.percentual,
            Number(pontuacao.pcm ?? pontuacao.perfilCircularidadeMateriais ?? pontuacao.maturidade ?? 0)
        ];

        const questionarioColumns = [
            'empresa_id', 'materia_prima', 'residuos', 'desmonte', 'descarte', 'recuperacao', 'reciclagem',
            'durabilidade', 'reparavel', 'reaproveitavel', 'ciclo_estendido', 'ciclo_rastreado', 'documentacao',
            'soma', 'indice_global_circularidade', 'indice_pcm'
        ];

        questionarioColumns.push('relatorio_html');
        questionarioParams.push(relatorioHtml || null);

        const questionarioPlaceholders = questionarioParams.map((_, index) => `$${index + 1}`).join(', ');

        const questionarioResult = await client.query(
            `INSERT INTO questionarios (${questionarioColumns.join(', ')})
             VALUES (${questionarioPlaceholders})
             RETURNING id`,
            questionarioParams
        );

        await client.query('COMMIT');

        const responseData = {
            success: true,
            empresaId: empresaId,
            questionarioId: questionarioResult.rows[0].id,
            empresaExistente: existingEmpresa.rows.length > 0,
            driveQueued: false
        };

        // 3. Salvar no Google Drive em segundo plano, sem bloquear a resposta principal
        const driveDispatch = agendarUploadDrive({
            relatorioHtml,
            nomeEmpresa,
            pontuacaoPercentual: pontuacao.percentual
        });
        responseData.driveQueued = driveDispatch.scheduled;
        if (driveDispatch.scheduled) {
            responseData.driveStatus = 'scheduled';
            responseData.driveFileName = driveDispatch.fileName;
        } else {
            responseData.driveStatus = 'skipped';
            responseData.driveSaved = false;
            responseData.driveError = driveDispatch.reason;
        }

        res.json(responseData);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao salvar questionário:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao salvar questionário.'
        });
    } finally {
        client.release();
    }
});

// Endpoint para listar questionários (opcional, para dashboard)
app.get('/api/questionarios', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                e.nome_empresa, e.cidade, e.produto_avaliado,
                q.indice_global_circularidade, q.indice_pcm,
                q.created_at
            FROM questionarios q
            INNER JOIN empresas e ON q.empresa_id = e.id
            ORDER BY q.created_at DESC
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Erro ao buscar questionários:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao buscar questionários.'
        });
    }
});

app.get('/api/dashboard/filters', async (req, res) => {
    try {
        const { whereClause, params } = construirWhereDashboard(req.query);
        const ufSelect = hasUfColumn ? "NULLIF(UPPER(TRIM(e.uf)), '') AS uf" : 'NULL::text AS uf';
        const setorSelect = hasUnaccentExtension
            ? "INITCAP(LOWER(unaccent(TRIM(e.setor_economico)))) AS setor"
            : "INITCAP(LOWER(TRIM(e.setor_economico))) AS setor";
        const produtoSelect = "INITCAP(LOWER(TRIM(e.produto_avaliado))) AS produto";
        const cidadeSelect = hasUnaccentExtension
            ? "UPPER(unaccent(TRIM(e.cidade))) AS cidade"
            : "UPPER(TRIM(e.cidade)) AS cidade";
        const baseQuery = `
            SELECT
                ${setorSelect},
                ${produtoSelect},
                ${cidadeSelect},
                ${ufSelect}
            FROM questionarios q
            INNER JOIN empresas e ON q.empresa_id = e.id
            ${whereClause}
        `;

        const result = await pool.query(baseQuery, params);
        const unico = (campo, formatador = (v) => v) => {
            const valores = result.rows
                .map((r) => r[campo])
                .filter(Boolean)
                .map((v) => formatador(v));
            return [...new Set(valores)].sort();
        };

        res.json({
            success: true,
            data: {
                setores: unico('setor'),
                produtos: unico('produto', formatarProdutoExibicao),
                cidades: unico('cidade'),
                ufs: unico('uf'),
                hasUf: hasUfColumn
            }
        });
    } catch (error) {
        console.error('Erro ao buscar filtros do dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao buscar filtros.'
        });
    }
});

app.get('/api/dashboard/overview', async (req, res) => {
    try {
        const { whereClause, params } = construirWhereDashboard(req.query);

        const sql = `
            SELECT
                COUNT(*)::int AS total_formularios,
                ROUND(AVG(q.soma)::numeric, 2) AS media_total_pontos,
                ROUND(AVG(q.indice_global_circularidade)::numeric, 2) AS media_igc,
                ROUND(AVG(q.indice_pcm)::numeric, 2) AS media_pcm,
                AVG(CASE q.materia_prima WHEN 1 THEN 0 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 2 WHEN 5 THEN 1 ELSE 0 END)::numeric AS s1,
                AVG(CASE q.residuos WHEN 1 THEN 0 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s2,
                AVG(CASE q.desmonte WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s3,
                AVG(CASE q.descarte WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s4,
                AVG(CASE q.recuperacao WHEN 1 THEN 0 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s5,
                AVG(CASE q.reciclagem WHEN 1 THEN 1 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s6,
                AVG(CASE q.durabilidade WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s7,
                AVG(CASE q.reparavel WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s8,
                AVG(CASE q.reaproveitavel WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s9,
                AVG(CASE q.ciclo_estendido WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s10,
                AVG(CASE q.ciclo_rastreado WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s11,
                AVG(CASE q.documentacao WHEN 1 THEN 2 WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 0 END)::numeric AS s12
            FROM questionarios q
            INNER JOIN empresas e ON q.empresa_id = e.id
            ${whereClause}
        `;

        const result = await pool.query(sql, params);
        const row = result.rows[0] || {};

        const totalFormularios = Number(row.total_formularios || 0);
        const medias = {
            1: Number(row.s1 || 0),
            2: Number(row.s2 || 0),
            3: Number(row.s3 || 0),
            4: Number(row.s4 || 0),
            5: Number(row.s5 || 0),
            6: Number(row.s6 || 0),
            7: Number(row.s7 || 0),
            8: Number(row.s8 || 0),
            9: Number(row.s9 || 0),
            10: Number(row.s10 || 0),
            11: Number(row.s11 || 0),
            12: Number(row.s12 || 0)
        };

        const topicos = {
            entrada: mediaPercentualPerguntas([1], medias),
            residuos: mediaPercentualPerguntas([2], medias),
            output: mediaPercentualPerguntas([3, 4, 5], medias),
            vida: mediaPercentualPerguntas([6, 7, 8, 9], medias),
            monitoramento: mediaPercentualPerguntas([10, 11, 12], medias)
        };

        const pcmDimensoes = {
            durabilidade: mediaPercentualPerguntas([7], medias),
            designReparavel: mediaPercentualPerguntas([8], medias),
            designReaproveitamento: mediaPercentualPerguntas([9], medias),
            servicosCiclo: mediaPercentualPerguntas([10], medias),
            rastreabilidade: mediaPercentualPerguntas([11], medias),
            transparencia: mediaPercentualPerguntas([12], medias)
        };

        const mediaIgc = Number(row.media_igc || 0);
        const mediaPcm = Number(row.media_pcm || 0);

        res.json({
            success: true,
            data: {
                totalFormularios,
                mediaTotalPontos: Number(row.media_total_pontos || 0),
                mediaIGC: mediaIgc,
                mediaPCM: mediaPcm,
                igcGap: Math.max(0, 100 - mediaIgc),
                topicos,
                pcmDimensoes
            }
        });
    } catch (error) {
        console.error('Erro ao buscar overview do dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao buscar indicadores.'
        });
    }
});

app.get('/api/admin/respostas', async (req, res) => {
    if (!verificarAcessoAdmin(req, res)) return;

    try {
        const { whereClause, params } = construirWhereDashboard(req.query);
        const htmlSelect = hasRelatorioHtmlColumn
            ? 'q.relatorio_html IS NOT NULL AS tem_relatorio_html'
            : 'FALSE AS tem_relatorio_html';
        const result = await pool.query(`
            SELECT
                q.id AS questionario_id,
                q.created_at,
                q.indice_global_circularidade,
                q.indice_pcm,
                ${htmlSelect},
                e.nome_responsavel,
                e.nome_empresa,
                e.cidade,
                e.uf,
                e.produto_avaliado
            FROM questionarios q
            INNER JOIN empresas e ON q.empresa_id = e.id
            ${whereClause}
            ORDER BY q.created_at DESC
        `, params);

        res.json({
            success: true,
            data: result.rows.map((row) => ({
                id: row.questionario_id,
                nomeResponsavel: row.nome_responsavel,
                nomeEmpresa: row.nome_empresa,
                cidade: row.cidade,
                uf: row.uf,
                produto: formatarProdutoExibicao(row.produto_avaliado),
                dataHora: formatarDataHora(row.created_at),
                igc: Number(row.indice_global_circularidade || 0),
                pcm: Number(row.indice_pcm || 0),
                temHtml: Boolean(row.tem_relatorio_html)
            }))
        });
    } catch (error) {
        console.error('Erro ao listar respostas do painel admin:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao listar respostas.'
        });
    }
});

app.get('/api/admin/respostas/:id/pdf', async (req, res) => {
    if (!verificarAcessoAdmin(req, res)) return;

    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT
                q.id AS questionario_id,
                q.created_at,
                q.soma,
                q.indice_global_circularidade,
                q.indice_pcm,
                q.materia_prima, q.residuos, q.desmonte, q.descarte, q.recuperacao, q.reciclagem,
                q.durabilidade, q.reparavel, q.reaproveitavel, q.ciclo_estendido, q.ciclo_rastreado, q.documentacao,
                e.nome_responsavel, e.nome_empresa, e.cidade, e.uf, e.setor_economico, e.produto_avaliado
            FROM questionarios q
            INNER JOIN empresas e ON q.empresa_id = e.id
            WHERE q.id = $1
        `, [id]);

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                error: 'Relatório não encontrado.'
            });
        }

        const row = result.rows[0];
        const respostas = {
            1: row.materia_prima,
            2: row.residuos,
            3: row.desmonte,
            4: row.descarte,
            5: row.recuperacao,
            6: row.reciclagem,
            7: row.durabilidade,
            8: row.reparavel,
            9: row.reaproveitavel,
            10: row.ciclo_estendido,
            11: row.ciclo_rastreado,
            12: row.documentacao
        };

        const topicos = {
            entrada: mediaCategoria([1], respostas),
            residuos: mediaCategoria([2], respostas),
            output: mediaCategoria([3, 4, 5], respostas),
            vida: mediaCategoria([6, 7, 8, 9], respostas),
            monitoramento: mediaCategoria([10, 11, 12], respostas)
        };

        const nomeEmpresaArquivo = (row.nome_empresa || 'empresa')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .slice(0, 60);
        const fileName = `Relatorio_Circularidade_${nomeEmpresaArquivo}_${row.questionario_id}.pdf`;
        const disposition = req.query.download === '1' ? 'attachment' : 'inline';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);

        const doc = new PDFDocument({ size: 'A4', margin: 44 });
        doc.pipe(res);

        doc.fontSize(18).text('Relatório de Circularidade', { align: 'left' });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#444').text(`ID do Relatório: ${row.questionario_id}`);
        doc.text(`Data/Hora: ${formatarDataHora(row.created_at)}`);
        doc.moveDown(1);

        doc.fillColor('#000').fontSize(12).text('Identificação');
        doc.fontSize(10);
        doc.text(`Empresa: ${row.nome_empresa}`);
        doc.text(`Responsável: ${row.nome_responsavel}`);
        doc.text(`Cidade/UF: ${row.cidade}${row.uf ? `/${row.uf}` : ''}`);
        doc.text(`Setor: ${row.setor_economico}`);
        doc.text(`Produto: ${formatarProdutoExibicao(row.produto_avaliado)}`);
        doc.moveDown(1);

        doc.fontSize(12).text('Indicadores Gerais');
        doc.fontSize(10);
        doc.text(`Pontuação total: ${row.soma}`);
        doc.text(`Índice Global de Circularidade (IGC): ${Number(row.indice_global_circularidade || 0).toFixed(2)}%`);
        doc.text(`Perfil de Circularidade de Materiais (PCM): ${Number(row.indice_pcm || 0).toFixed(2)}%`);
        doc.moveDown(1);

        doc.fontSize(12).text('Percentuais por Tópico');
        doc.fontSize(10);
        doc.text(`Entrada (Input): ${topicos.entrada}%`);
        doc.text(`Gestão de Resíduos: ${topicos.residuos}%`);
        doc.text(`Saída do Produto (Output): ${topicos.output}%`);
        doc.text(`Vida do Produto: ${topicos.vida}%`);
        doc.text(`Monitoramento: ${topicos.monitoramento}%`);
        doc.moveDown(1);

        doc.fontSize(12).text('Respostas por Questão');
        doc.moveDown(0.2);
        for (let i = 1; i <= 12; i += 1) {
            const valor = respostas[i];
            doc.fontSize(10).text(`Q${i}: ${textoAlternativa(i, valor)} (valor ${valor})`);
        }

        doc.moveDown(1.2);
        doc.fontSize(9).fillColor('#555')
            .text('Documento gerado automaticamente pelo backend da plataforma.', { align: 'left' });
        doc.end();
    } catch (error) {
        console.error('Erro ao gerar PDF do painel admin:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Erro interno ao gerar PDF.'
            });
        }
    }
});

app.get('/api/admin/respostas/:id/html', async (req, res) => {
    if (!verificarAcessoAdmin(req, res)) return;

    if (!hasRelatorioHtmlColumn) {
        return res.status(501).json({
            success: false,
            error: 'HTML do relatório não está disponível neste banco.'
        });
    }

    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT
                q.id AS questionario_id,
                q.relatorio_html,
                q.created_at,
                e.nome_empresa
            FROM questionarios q
            INNER JOIN empresas e ON q.empresa_id = e.id
            WHERE q.id = $1
        `, [id]);

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                error: 'Relatório não encontrado.'
            });
        }

        const row = result.rows[0];
        if (!row.relatorio_html) {
            return res.status(404).send('HTML do relatório não encontrado.');
        }

        const disposition = req.query.download === '1' ? 'attachment' : 'inline';
        const fileName = `Relatorio_Circularidade_${(row.nome_empresa || 'empresa').replace(/\s+/g, '_')}_${row.questionario_id}.html`;

        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(row.relatorio_html);
    } catch (error) {
        console.error('Erro ao recuperar HTML do painel admin:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao recuperar HTML.'
        });
    }
});

// ===== ENDPOINTS GOOGLE DRIVE =====

// Verificar status da autenticação Google
app.get('/api/drive/status', (req, res) => {
    res.json({
        authenticated: driveService.isAuthenticated(),
        message: driveService.isAuthenticated()
            ? 'Google Drive autenticado e pronto'
            : 'É necessário autenticar o Google Drive'
    });
});

// Obter URL de autorização
app.get('/api/drive/auth-url', (req, res) => {
    // Debug log para ver o que está sendo gerado
    console.log('🔍 Gerando URL de auth...');
    console.log('ID do Cliente:', driveService.clientId ? driveService.clientId.substring(0, 10) + '...' : 'NÃO DEFINIDO');
    console.log('Redirect URI:', driveService.redirectUri);

    if (driveService.isAuthenticated()) {
        return res.json({
            alreadyAuthenticated: true,
            message: 'Já autenticado'
        });
    }

    try {
        const authUrl = driveService.getAuthUrl();
        if (!authUrl) {
            return res.status(500).json({
                success: false,
                error: 'Google Drive não configurado no servidor.'
            });
        }

        console.log('🔗 URL Gerada:', authUrl); // Verifique nos logs do Railway se o client_id está correto aqui

        return res.json({
            authUrl,
            message: 'Abra esta URL no navegador para autorizar'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint de Diagnóstico (Temporário)
app.get('/api/debug/config', (req, res) => {
    if (!ENABLE_DEBUG_ENDPOINTS) {
        return res.status(404).json({
            success: false,
            error: 'Endpoint não disponível.'
        });
    }

    res.json({
        env: {
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'DEFINIDO (' + process.env.GOOGLE_CLIENT_ID.substring(0, 5) + '...)' : 'NÃO DEFINIDO',
            GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'DEFINIDO' : 'NÃO DEFINIDO',
            RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL
        },
        driveService: {
            clientIdLoaded: driveService.clientId ? 'SIM (' + driveService.clientId.substring(0, 5) + '...)' : 'NÃO',
            redirectUri: driveService.redirectUri,
            isAuthenticated: driveService.isAuthenticated()
        }
    });
});

// Callback OAuth do Google
app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.status(400).send(`
            <h1>❌ Erro na Autenticação</h1>
            <p>Erro: ${error}</p>
            <a href="/">Voltar</a>
        `);
    }

    if (!code) {
        return res.status(400).send(`
            <h1>❌ Código de autorização não encontrado</h1>
            <a href="/">Voltar</a>
        `);
    }

    try {
        // Trocar código por tokens
        await driveService.exchangeCodeForTokens(code);

        res.send(`
            <html>
            <head>
                <title>Autenticação Concluída</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 min-h-screen flex items-center justify-center">
                <div class="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
                    <div class="text-6xl mb-4">✅</div>
                    <h1 class="text-3xl font-bold text-gray-900 mb-4">Autenticação Concluída!</h1>
                    <p class="text-gray-600 mb-6">Google Drive conectado com sucesso!</p>
                    <p class="text-sm text-gray-500 mb-6">Todos os relatórios serão salvos automaticamente na sua conta.</p>
                    <button onclick="window.close()" class="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700">
                        Fechar
                    </button>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`
            <h1>❌ Erro na Autenticação</h1>
            <p>Erro: ${error.message}</p>
            <a href="/api/drive/auth-url">Tentar Novamente</a>
        `);
    }
});

// Servir frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'Endpoint não encontrado.'
        });
    }
    return res.status(404).send('Página não encontrada.');
});

app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err.message);

    if (err.message === 'Origem não permitida por CORS.') {
        return res.status(403).json({
            success: false,
            error: 'Origem não permitida.'
        });
    }

    return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor.'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
