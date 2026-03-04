// Backend API para Questionário de Circularidade 2026
// Conecta frontend ao PostgreSQL Railway + Google Drive automático

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const GoogleDriveService = require('./google-drive-service');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_DEBUG_ENDPOINTS = process.env.ENABLE_DEBUG_ENDPOINTS === 'true';
const CNPJ_API_TIMEOUT_MS = parseInt(process.env.CNPJ_API_TIMEOUT_MS || '8000', 10);

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
        if (!origin || originAllowlist.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origem não permitida por CORS.'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
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

// Testar conexão
app.get('/api/health', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: result.rows[0].now
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

// Endpoint para consulta de CNPJ via EmpresaAqui
app.get('/api/cnpj/:cnpj', async (req, res) => {
    const { cnpj } = req.params;
    const token = process.env.EMPRESAQUI_TOKEN;
    const cnpjLimpo = limparCNPJ(cnpj);

    if (!token || token === 'SEU_TOKEN_AQUI') {
        return res.status(500).json({
            success: false,
            error: 'Token da API EmpresaAqui não configurado no servidor.'
        });
    }

    if (!validarCNPJ(cnpjLimpo)) {
        return res.status(400).json({
            success: false,
            error: 'CNPJ inválido. Informe 14 dígitos válidos.'
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CNPJ_API_TIMEOUT_MS);

    try {
        console.log(`🔍 Consultando CNPJ: ${mascararCNPJ(cnpjLimpo)}`);

        const response = await fetch(
            `https://www.empresaqui.com.br/api/${token}/${cnpjLimpo}`,
            { signal: controller.signal }
        );

        const bodyText = await response.text();
        let data = null;

        try {
            data = bodyText ? JSON.parse(bodyText) : null;
        } catch {
            data = null;
        }

        if (response.status === 404) {
            return res.status(404).json({
                success: false,
                error: 'CNPJ não encontrado.'
            });
        }

        if (response.status === 401 || response.status === 403) {
            return res.status(502).json({
                success: false,
                error: 'Falha de autenticação com o provedor de CNPJ.'
            });
        }

        if (!response.ok) {
            return res.status(502).json({
                success: false,
                error: 'Falha temporária ao consultar provedor de CNPJ.'
            });
        }

        if (!data || data.erro) {
            return res.status(404).json({
                success: false,
                error: data.erro || 'CNPJ não encontrado ou erro na consulta.'
            });
        }

        res.json({
            success: true,
            data: {
                razao: data.razao,
                fantasia: data.fantasia,
                email: data.email,
                telefone: `${data.ddd_1 || ''}${data.tel_1 || ''}`,
                cidade: data.log_municipio,
                uf: data.log_uf,
                cnae_principal: data.cnae_principal
            }
        });

    } catch (error) {
        if (error.name === 'AbortError') {
            return res.status(504).json({
                success: false,
                error: 'Tempo limite excedido ao consultar CNPJ.'
            });
        }

        console.error('Erro ao consultar CNPJ:', error.message);
        res.status(502).json({
            success: false,
            error: 'Falha de comunicação ao consultar CNPJ.'
        });
    } finally {
        clearTimeout(timeout);
    }
});

// Endpoint para salvar questionário
app.post('/api/questionario', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { empresa, respostas, pontuacao, relatorioHtml } = req.body;

        // Limpar CNPJ e celular
        const cnpjLimpo = limparCNPJ(empresa.cnpj);
        const celularLimpo = limparCelular(empresa.celular);

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
            console.log('📌 Empresa já cadastrada, reutilizando ID:', empresaId);
        } else {
            // Nova empresa - inserir com dados limpos
            const empresaResult = await client.query(
                `INSERT INTO empresas (nome_empresa, cnpj, nome_responsavel, email, cidade, celular, setor_economico, produto_avaliado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id`,
                [
                    empresa.nomeEmpresa,
                    cnpjLimpo,
                    empresa.nomeResponsavel,
                    empresa.email,
                    empresa.cidade,
                    celularLimpo,
                    empresa.setorEconomico,
                    empresa.produtoAvaliado
                ]
            );
            empresaId = empresaResult.rows[0].id;
            console.log('✅ Nova empresa cadastrada:', empresaId);
        }

        // 2. Inserir questionário
        const questionarioResult = await client.query(
            `INSERT INTO questionarios (
                empresa_id, materia_prima, residuos, desmonte, descarte, recuperacao, reciclagem,
                durabilidade, reparavel, reaproveitavel, ciclo_estendido, ciclo_rastreado, documentacao,
                soma, indice_global_circularidade, indice_maturidade_estruturante
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
            [
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
                pontuacao.maturidade
            ]
        );

        await client.query('COMMIT');

        const responseData = {
            success: true,
            empresaId: empresaId,
            questionarioId: questionarioResult.rows[0].id,
            empresaExistente: existingEmpresa.rows.length > 0
        };

        // 3. Salvar no Google Drive (se autenticado)
        if (driveService.isAuthenticated() && relatorioHtml) {
            try {
                console.log('💾 Salvando relatório no Google Drive...');
                const fileName = `Relatorio_${empresa.nomeEmpresa.replace(/\s+/g, '_')}_${Date.now()}.doc`;
                const driveResult = await driveService.saveFile(
                    relatorioHtml,
                    fileName,
                    `Relatório de Circularidade - ${empresa.nomeEmpresa} - Índice: ${pontuacao.percentual}%`
                );
                responseData.driveSaved = true;
                responseData.driveUrl = driveResult.viewUrl;
                console.log('✅ Relatório salvo no Drive:', driveResult.viewUrl);
            } catch (driveError) {
                console.warn('⚠️ Erro ao salvar no Drive:', driveError);
                responseData.driveSaved = false;
                responseData.driveError = driveError.message;
            }
        } else {
            if (!driveService.isAuthenticated()) {
                console.warn('⚠️ Google Drive não autenticado - relatório não salvo no Drive');
            }
            responseData.driveSaved = false;
            responseData.driveError = driveService.isAuthenticated() ? 'HTML não fornecido' : 'Google Drive não autenticado';
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
                q.indice_global_circularidade, q.indice_maturidade_estruturante,
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

    const authUrl = driveService.getAuthUrl();
    console.log('🔗 URL Gerada:', authUrl); // Verifique nos logs do Railway se o client_id está correto aqui

    res.json({
        authUrl: authUrl,
        message: 'Abra esta URL no navegador para autorizar'
    });
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
