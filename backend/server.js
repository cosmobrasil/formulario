// Backend API para Questionário de Circularidade 2026
// Conecta frontend ao PostgreSQL Railway + Google Drive automático

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const GoogleDriveService = require('./google-drive-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar serviço do Google Drive
const driveService = new GoogleDriveService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Configuração do PostgreSQL Railway
const pool = new Pool({
    host: 'centerbeam.proxy.rlwy.net',
    port: 16594,
    database: 'railway',
    user: 'postgres',
    password: 'kSYfUUXCRhOPVPwztXwieXmYOGnmSlZD',
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
            message: error.message
        });
    }
});

// Endpoint para salvar questionário
app.post('/api/questionario', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { empresa, respostas, pontuacao, relatorioHtml } = req.body;

        // 1. Verificar se empresa já existe pelo CNPJ
        let empresaId;
        const existingEmpresa = await client.query(
            'SELECT id FROM empresas WHERE cnpj = $1',
            [empresa.cnpj]
        );

        if (existingEmpresa.rows.length > 0) {
            // Empresa já existe - usar ID existente
            empresaId = existingEmpresa.rows[0].id;
            console.log('📌 Empresa já cadastrada, reutilizando ID:', empresaId);
        } else {
            // Nova empresa - inserir
            const empresaResult = await client.query(
                `INSERT INTO empresas (nome_empresa, cnpj, nome_responsavel, email, cidade, celular, setor_economico, produto_avaliado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id`,
                [
                    empresa.nomeEmpresa,
                    empresa.cnpj,
                    empresa.nomeResponsavel,
                    empresa.email,
                    empresa.cidade,
                    empresa.celular,
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
                const fileName = `Relatorio_${empresa.nomeEmpresa.replace(/\s+/g, '_')}_${Date.now()}.html`;
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
            error: error.message
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
            error: error.message
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
    if (driveService.isAuthenticated()) {
        return res.json({
            alreadyAuthenticated: true,
            message: 'Já autenticado'
        });
    }

    const authUrl = driveService.getAuthUrl();
    res.json({
        authUrl: authUrl,
        message: 'Abra esta URL no navegador para autorizar'
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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
