// Backend API para Questionário de Circularidade 2026
// Conecta frontend ao PostgreSQL Railway + Google Drive automático

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const GoogleDriveService = require('./google-drive-service');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_DEBUG_ENDPOINTS = process.env.ENABLE_DEBUG_ENDPOINTS === 'true';
const CNPJ_API_TIMEOUT_MS = parseInt(process.env.CNPJ_API_TIMEOUT_MS || '8000', 10);
const ADMIN_PANEL_TOKEN = (process.env.ADMIN_PANEL_TOKEN || '').trim();
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
function origemPermitidaCors(origin) {
    if (!origin) return true;
    if (originAllowlist.has(origin)) return true;
    return /^https:\/\/[^/]+\.netlify\.app\b/i.test(origin);
}

app.use(cors({
    origin(origin, callback) {
        if (origemPermitidaCors(origin)) {
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
            try {
                await pool.query('ALTER TABLE questionarios ADD COLUMN relatorio_html TEXT');
                hasRelatorioHtmlColumn = true;
                console.log('✅ Coluna questionarios.relatorio_html criada automaticamente.');
            } catch (migrationError) {
                console.warn('⚠️ Não foi possível criar questionarios.relatorio_html automaticamente:', migrationError.message);
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

function origemConfiavelDashboard(req) {
    const origem = `${req.headers.origin || ''}`.trim();
    const referer = `${req.headers.referer || ''}`.trim();
    const valores = [origem, referer].filter(Boolean);
    return valores.some((valor) =>
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(valor) ||
        /^https:\/\/[^/]+\.netlify\.app\b/i.test(valor)
    );
}

function verificarAcessoAdmin(req, res) {
    if (!ADMIN_PANEL_TOKEN) return true;
    const tokenInformado = (req.headers['x-admin-token'] || req.query.token || '').toString().trim();
    if (tokenInformado === ADMIN_PANEL_TOKEN) return true;
    if (origemConfiavelDashboard(req)) return true;
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

function clampPercent(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

function percentualEscolha(count, total) {
    const quantidade = Number(count || 0);
    const base = Number(total || 0);
    if (base <= 0) return 0;
    return clampPercent(Math.round((quantidade / base) * 100));
}

function percentualPropensao(sim, nao, neutro) {
    const yes = Number(sim || 0);
    const no = Number(nao || 0);
    const unknown = Number(neutro || 0);
    const total = yes + no + unknown;
    if (total <= 0) return 0;
    return clampPercent(Math.round(((yes * 100) + (unknown * 50)) / total));
}

function normalizarDistribuicaoPercentual(valores) {
    const entries = Object.entries(valores).map(([chave, valor]) => [chave, Math.max(0, Number(valor || 0))]);
    const soma = entries.reduce((acc, [, valor]) => acc + valor, 0);
    if (soma <= 0) {
        return Object.fromEntries(entries.map(([chave]) => [chave, 0]));
    }

    const normalizados = {};
    let acumulado = 0;
    entries.forEach(([chave, valor], index) => {
        if (index === entries.length - 1) {
            normalizados[chave] = clampPercent(100 - acumulado);
            return;
        }
        const percentual = clampPercent(Math.round((valor / soma) * 100));
        normalizados[chave] = percentual;
        acumulado += percentual;
    });
    return normalizados;
}

function calcularIndicadoresCosmobInferidos(distribuicoes) {
    const totalFormularios = Number(distribuicoes.totalFormularios || 0);
    const entradaFonteRenovavel = percentualEscolha(distribuicoes.mp4, totalFormularios);
    const entradaVirgem = percentualEscolha(distribuicoes.mp1, totalFormularios);
    const entradaReciclado = clampPercent(Math.round(
        (percentualEscolha(distribuicoes.mp2, totalFormularios) * 0.75) +
        (percentualEscolha(distribuicoes.mp3, totalFormularios) * 0.25)
    ));
    const reaproveitamentoMateria = percentualEscolha(distribuicoes.mp3, totalFormularios);
    const designReaproveitamento = percentualPropensao(distribuicoes.q9Sim, distribuicoes.q9Nao, distribuicoes.q9Neutro);
    const desmonteFacilitado = percentualPropensao(distribuicoes.q3Sim, distribuicoes.q3Nao, distribuicoes.q3Neutro);
    const saidaBruta = normalizarDistribuicaoPercentual({
        aterro:
            (percentualPropensao(distribuicoes.q5Sim, distribuicoes.q5Nao, distribuicoes.q5Neutro) * 0.7) +
            (percentualEscolha(distribuicoes.r2Aterro, totalFormularios) * 0.3),
        reciclagem:
            (percentualPropensao(distribuicoes.q4Sim, distribuicoes.q4Nao, distribuicoes.q4Neutro) * 0.5) +
            (desmonteFacilitado * 0.2) +
            (percentualEscolha(distribuicoes.r2Reciclagem, totalFormularios) * 0.3),
        valorizacaoEnergetica:
            (percentualPropensao(distribuicoes.q6Sim, distribuicoes.q6Nao, distribuicoes.q6Neutro) * 0.75) +
            (percentualEscolha(distribuicoes.r2Energia, totalFormularios) * 0.25)
    });

    return {
        fonteRenovavel: entradaFonteRenovavel,
        virgem: entradaVirgem,
        reciclado: entradaReciclado,
        recicladoPermanentemente: clampPercent(Math.round(
            (reaproveitamentoMateria * 0.55) +
            (designReaproveitamento * 0.30) +
            (desmonteFacilitado * 0.15)
        )),
        aterro: saidaBruta.aterro,
        reciclagem: saidaBruta.reciclagem,
        valorizacaoEnergetica: saidaBruta.valorizacaoEnergetica
    };
}

function mediaDistribuicaoPercentual(total, distribuicao, pesos) {
    const base = Number(total || 0);
    if (base <= 0) return 0;

    return Object.entries(pesos).reduce((acc, [chave, peso]) => {
        const quantidade = Number(distribuicao[chave] || 0);
        return acc + ((quantidade / base) * peso);
    }, 0);
}

function calcularPerfilCircularidadeMateriais(respostas = {}) {
    const pontuacoes = {
        1: { 1: 0, 2: 80, 3: 100, 4: 80, 5: 25 },
        2: { 1: 0, 2: 100, 3: 40 },
        3: { 1: 100, 2: 0, 3: 50 },
        4: { 1: 100, 2: 0, 3: 50 },
        5: { 1: 0, 2: 100, 3: 50 },
        6: { 1: 40, 2: 100, 3: 50 },
        9: { 1: 100, 2: 0, 3: 50 }
    };

    const pesos = {
        1: 0.15,
        2: 0.15,
        3: 0.10,
        4: 0.15,
        5: 0.15,
        6: 0.10,
        9: 0.20
    };

    const scorePergunta = (qid) => {
        const mapa = pontuacoes[qid];
        const valor = Number(respostas[qid]);
        if (!mapa || !Number.isFinite(valor)) return 0;
        return Number(mapa[valor] || 0);
    };

    const componentes = {
        entrada: scorePergunta(1),
        residuos: scorePergunta(2),
        desmonte: scorePergunta(3),
        reciclabilidade: scorePergunta(4),
        aterro: scorePergunta(5),
        recuperacaoEnergia: scorePergunta(6),
        reaproveitamento: scorePergunta(9)
    };

    const indice = Math.round(
        (componentes.entrada * pesos[1]) +
        (componentes.residuos * pesos[2]) +
        (componentes.desmonte * pesos[3]) +
        (componentes.reciclabilidade * pesos[4]) +
        (componentes.aterro * pesos[5]) +
        (componentes.recuperacaoEnergia * pesos[6]) +
        (componentes.reaproveitamento * pesos[9])
    );

    return {
        indice,
        componentes
    };
}

function calcularPerfilCircularidadeMateriaisAgregado(distribuicoes = {}) {
    const totalFormularios = Number(distribuicoes.totalFormularios || 0);
    if (totalFormularios <= 0) {
        return {
            indice: 0,
            componentes: {
                entrada: 0,
                residuos: 0,
                desmonte: 0,
                reciclabilidade: 0,
                aterro: 0,
                recuperacaoEnergia: 0,
                reaproveitamento: 0
            }
        };
    }

    const q1 = mediaDistribuicaoPercentual(totalFormularios, {
        mp1: distribuicoes.mp1,
        mp2: distribuicoes.mp2,
        mp3: distribuicoes.mp3,
        mp4: distribuicoes.mp4,
        mp5: distribuicoes.mp5
    }, {
        mp1: 0,
        mp2: 80,
        mp3: 100,
        mp4: 80,
        mp5: 25
    });

    const q2 = mediaDistribuicaoPercentual(totalFormularios, {
        r2Aterro: distribuicoes.r2Aterro,
        r2Reciclagem: distribuicoes.r2Reciclagem,
        r2Energia: distribuicoes.r2Energia
    }, {
        r2Aterro: 0,
        r2Reciclagem: 100,
        r2Energia: 40
    });

    const q3 = mediaDistribuicaoPercentual(totalFormularios, {
        q3Sim: distribuicoes.q3Sim,
        q3Nao: distribuicoes.q3Nao,
        q3Neutro: distribuicoes.q3Neutro
    }, {
        q3Sim: 100,
        q3Nao: 0,
        q3Neutro: 50
    });

    const q4 = mediaDistribuicaoPercentual(totalFormularios, {
        q4Sim: distribuicoes.q4Sim,
        q4Nao: distribuicoes.q4Nao,
        q4Neutro: distribuicoes.q4Neutro
    }, {
        q4Sim: 100,
        q4Nao: 0,
        q4Neutro: 50
    });

    const q5 = mediaDistribuicaoPercentual(totalFormularios, {
        q5Sim: distribuicoes.q5Sim,
        q5Nao: distribuicoes.q5Nao,
        q5Neutro: distribuicoes.q5Neutro
    }, {
        q5Sim: 0,
        q5Nao: 100,
        q5Neutro: 50
    });

    const q6 = mediaDistribuicaoPercentual(totalFormularios, {
        q6Sim: distribuicoes.q6Sim,
        q6Nao: distribuicoes.q6Nao,
        q6Neutro: distribuicoes.q6Neutro
    }, {
        q6Sim: 40,
        q6Nao: 100,
        q6Neutro: 50
    });

    const q9 = mediaDistribuicaoPercentual(totalFormularios, {
        q9Sim: distribuicoes.q9Sim,
        q9Nao: distribuicoes.q9Nao,
        q9Neutro: distribuicoes.q9Neutro
    }, {
        q9Sim: 100,
        q9Nao: 0,
        q9Neutro: 50
    });

    const componentes = {
        entrada: Math.round(q1),
        residuos: Math.round(q2),
        desmonte: Math.round(q3),
        reciclabilidade: Math.round(q4),
        aterro: Math.round(q5),
        recuperacaoEnergia: Math.round(q6),
        reaproveitamento: Math.round(q9)
    };

    const indice = Math.round(
        (componentes.entrada * 0.15) +
        (componentes.residuos * 0.15) +
        (componentes.desmonte * 0.10) +
        (componentes.reciclabilidade * 0.15) +
        (componentes.aterro * 0.15) +
        (componentes.recuperacaoEnergia * 0.10) +
        (componentes.reaproveitamento * 0.20)
    );

    return {
        indice,
        componentes
    };
}

function drawDoughnutIGC(doc, x, y, percentual) {
    const p = clampPercent(percentual);
    const radius = 58;
    const innerRadius = 38;
    const start = -Math.PI / 2;
    const end = start + ((2 * Math.PI * p) / 100);
    const startX = x + (Math.cos(start) * radius);
    const startY = y + (Math.sin(start) * radius);

    doc.save();
    doc.lineWidth(0);
    doc.circle(x, y, radius).fill('#334155');
    if (p > 0) {
        doc.fillColor('#22c55e');
        doc.moveTo(x, y);
        doc.lineTo(startX, startY);
        doc.arc(x, y, radius, start, end);
        doc.lineTo(x, y);
        doc.fill();
    }
    doc.fillColor('#ffffff').circle(x, y, innerRadius).fill();
    doc.restore();

    doc.fillColor('#111827').fontSize(16).text(`${Math.round(p)}%`, x - 22, y - 10, { width: 44, align: 'center' });
    doc.fillColor('#475569').fontSize(8).text('IGC', x - 22, y + 8, { width: 44, align: 'center' });
}

function drawTopicosBars(doc, x, y, topicos) {
    const itens = [
        { nome: 'Entrada', valor: clampPercent(topicos.entrada), cor: '#22c55e' },
        { nome: 'Resíduos', valor: clampPercent(topicos.residuos), cor: '#06b6d4' },
        { nome: 'Saída', valor: clampPercent(topicos.output), cor: '#6366f1' },
        { nome: 'Vida', valor: clampPercent(topicos.vida), cor: '#f59e0b' },
        { nome: 'Monitoramento', valor: clampPercent(topicos.monitoramento), cor: '#ef4444' }
    ];
    const larguraMax = 220;
    let yy = y;

    itens.forEach((item) => {
        doc.fillColor('#1f2937').fontSize(9).text(item.nome, x, yy, { width: 80 });
        doc.roundedRect(x + 84, yy + 2, larguraMax, 8, 3).fill('#334155');
        doc.roundedRect(x + 84, yy + 2, (larguraMax * item.valor) / 100, 8, 3).fill(item.cor);
        doc.fillColor('#cbd5e1').fontSize(8).text(`${item.valor}%`, x + 84 + larguraMax + 6, yy + 1, { width: 36 });
        yy += 16;
    });
}

function escreverRecomendacoes(doc, topicos, startY) {
    const regras = [
        {
            chave: 'entrada',
            titulo: 'Entrada (Input)',
            texto: 'Ampliar fornecedores com materia-prima reciclada e rastreavel.'
        },
        {
            chave: 'residuos',
            titulo: 'Gestao de Residuos',
            texto: 'Fortalecer segregacao, reuso interno e parcerias de recicladores.'
        },
        {
            chave: 'output',
            titulo: 'Saida do Produto',
            texto: 'Melhorar design para desmontagem e estrutura de logistica reversa.'
        },
        {
            chave: 'vida',
            titulo: 'Vida do Produto',
            texto: 'Priorizar durabilidade, reparabilidade e reaproveitamento modular.'
        },
        {
            chave: 'monitoramento',
            titulo: 'Monitoramento',
            texto: 'Reforcar rastreabilidade e documentacao tecnica para transparencia.'
        }
    ];

    const criticos = regras
        .map((r) => ({ ...r, score: clampPercent(topicos[r.chave]) }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3);

    doc.fillColor('#0f172a').fontSize(12).text('Pontos Estrategicos de Atencao', 44, startY);
    let y = startY + 16;
    criticos.forEach((item, idx) => {
        doc.fillColor('#334155').fontSize(9).text(`${idx + 1}. ${item.titulo} (${item.score}%)`, 44, y);
        y += 12;
        doc.fillColor('#475569').fontSize(9).text(item.texto, 54, y, { width: 500 });
        y += 16;
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

function clampPercent(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

function percentualEscolha(count, total) {
    const quantidade = Number(count || 0);
    const base = Number(total || 0);
    if (base <= 0) return 0;
    return clampPercent(Math.round((quantidade / base) * 100));
}

function percentualPropensao(sim, nao, neutro) {
    const yes = Number(sim || 0);
    const no = Number(nao || 0);
    const unknown = Number(neutro || 0);
    const total = yes + no + unknown;
    if (total <= 0) return 0;
    return clampPercent(Math.round(((yes * 100) + (unknown * 50)) / total));
}

function normalizarDistribuicaoPercentual(valores) {
    const entries = Object.entries(valores).map(([chave, valor]) => [chave, Math.max(0, Number(valor || 0))]);
    const soma = entries.reduce((acc, [, valor]) => acc + valor, 0);
    if (soma <= 0) {
        return Object.fromEntries(entries.map(([chave]) => [chave, 0]));
    }

    const normalizados = {};
    let acumulado = 0;
    entries.forEach(([chave, valor], index) => {
        if (index === entries.length - 1) {
            normalizados[chave] = clampPercent(100 - acumulado);
            return;
        }
        const percentual = clampPercent(Math.round((valor / soma) * 100));
        normalizados[chave] = percentual;
        acumulado += percentual;
    });
    return normalizados;
}

function calcularIndicadoresCosmobInferidos(distribuicoes) {
    const totalFormularios = Number(distribuicoes.totalFormularios || 0);
    const entradaFonteRenovavel = percentualEscolha(distribuicoes.mp4, totalFormularios);
    const entradaVirgem = percentualEscolha(distribuicoes.mp1, totalFormularios);
    const entradaReciclado = clampPercent(Math.round(
        (percentualEscolha(distribuicoes.mp2, totalFormularios) * 0.75) +
        (percentualEscolha(distribuicoes.mp3, totalFormularios) * 0.25)
    ));
    const reaproveitamentoMateria = percentualEscolha(distribuicoes.mp3, totalFormularios);
    const designReaproveitamento = percentualPropensao(distribuicoes.q9Sim, distribuicoes.q9Nao, distribuicoes.q9Neutro);
    const desmonteFacilitado = percentualPropensao(distribuicoes.q3Sim, distribuicoes.q3Nao, distribuicoes.q3Neutro);
    const saidaBruta = normalizarDistribuicaoPercentual({
        aterro:
            (percentualPropensao(distribuicoes.q5Sim, distribuicoes.q5Nao, distribuicoes.q5Neutro) * 0.7) +
            (percentualEscolha(distribuicoes.r2Aterro, totalFormularios) * 0.3),
        reciclagem:
            (percentualPropensao(distribuicoes.q4Sim, distribuicoes.q4Nao, distribuicoes.q4Neutro) * 0.5) +
            (desmonteFacilitado * 0.2) +
            (percentualEscolha(distribuicoes.r2Reciclagem, totalFormularios) * 0.3),
        valorizacaoEnergetica:
            (percentualPropensao(distribuicoes.q6Sim, distribuicoes.q6Nao, distribuicoes.q6Neutro) * 0.75) +
            (percentualEscolha(distribuicoes.r2Energia, totalFormularios) * 0.25)
    });

    return {
        fonteRenovavel: entradaFonteRenovavel,
        virgem: entradaVirgem,
        reciclado: entradaReciclado,
        recicladoPermanentemente: clampPercent(Math.round(
            (reaproveitamentoMateria * 0.55) +
            (designReaproveitamento * 0.30) +
            (desmonteFacilitado * 0.15)
        )),
        aterro: saidaBruta.aterro,
        reciclagem: saidaBruta.reciclagem,
        valorizacaoEnergetica: saidaBruta.valorizacaoEnergetica
    };
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
                        normalizarTexto(empresa.nomeEmpresa),
                        normalizarTexto(empresa.nomeResponsavel),
                        normalizarTexto(empresa.email).toLowerCase(),
                        normalizarCidade(empresa.cidade),
                        celularLimpo,
                        normalizarSetor(empresa.setorEconomico),
                        normalizarProduto(empresa.produtoAvaliado),
                        normalizarUF(empresa.uf),
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
                        normalizarTexto(empresa.nomeEmpresa),
                        normalizarTexto(empresa.nomeResponsavel),
                        normalizarTexto(empresa.email).toLowerCase(),
                        normalizarCidade(empresa.cidade),
                        celularLimpo,
                        normalizarSetor(empresa.setorEconomico),
                        normalizarProduto(empresa.produtoAvaliado),
                        empresaId
                    ]
                );
            }
            console.log('📌 Empresa já cadastrada, reutilizando ID:', empresaId);
        } else {
            // Nova empresa - inserir com dados limpos
            const empresaValues = [
                normalizarTexto(empresa.nomeEmpresa),
                cnpjLimpo,
                normalizarTexto(empresa.nomeResponsavel),
                normalizarTexto(empresa.email).toLowerCase(),
                normalizarCidade(empresa.cidade),
                celularLimpo,
                normalizarSetor(empresa.setorEconomico),
                normalizarProduto(empresa.produtoAvaliado)
            ];

            let insertEmpresaSql = `INSERT INTO empresas (nome_empresa, cnpj, nome_responsavel, email, cidade, celular, setor_economico, produto_avaliado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id`;

            if (hasUfColumn) {
                empresaValues.push(normalizarUF(empresa.uf));
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

        if (hasRelatorioHtmlColumn) {
            questionarioColumns.push('relatorio_html');
            questionarioParams.push(relatorioHtml || null);
        }

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
                COUNT(*) FILTER (WHERE q.materia_prima = 1)::int AS mp1,
                COUNT(*) FILTER (WHERE q.materia_prima = 2)::int AS mp2,
                COUNT(*) FILTER (WHERE q.materia_prima = 3)::int AS mp3,
                COUNT(*) FILTER (WHERE q.materia_prima = 4)::int AS mp4,
                COUNT(*) FILTER (WHERE q.materia_prima = 5)::int AS mp5,
                COUNT(*) FILTER (WHERE q.residuos = 1)::int AS r2_aterro,
                COUNT(*) FILTER (WHERE q.residuos = 2)::int AS r2_reciclagem,
                COUNT(*) FILTER (WHERE q.residuos = 3)::int AS r2_energia,
                COUNT(*) FILTER (WHERE q.desmonte = 1)::int AS q3_sim,
                COUNT(*) FILTER (WHERE q.desmonte = 2)::int AS q3_nao,
                COUNT(*) FILTER (WHERE q.desmonte = 3)::int AS q3_neutro,
                COUNT(*) FILTER (WHERE q.descarte = 1)::int AS q4_sim,
                COUNT(*) FILTER (WHERE q.descarte = 2)::int AS q4_nao,
                COUNT(*) FILTER (WHERE q.descarte = 3)::int AS q4_neutro,
                COUNT(*) FILTER (WHERE q.recuperacao = 1)::int AS q5_sim,
                COUNT(*) FILTER (WHERE q.recuperacao = 2)::int AS q5_nao,
                COUNT(*) FILTER (WHERE q.recuperacao = 3)::int AS q5_neutro,
                COUNT(*) FILTER (WHERE q.reciclagem = 1)::int AS q6_sim,
                COUNT(*) FILTER (WHERE q.reciclagem = 2)::int AS q6_nao,
                COUNT(*) FILTER (WHERE q.reciclagem = 3)::int AS q6_neutro,
                COUNT(*) FILTER (WHERE q.reaproveitavel = 1)::int AS q9_sim,
                COUNT(*) FILTER (WHERE q.reaproveitavel = 2)::int AS q9_nao,
                COUNT(*) FILTER (WHERE q.reaproveitavel = 3)::int AS q9_neutro,
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

        const mediaIgc = Number(row.media_igc || 0);
        const perfilCircularidadeMateriais = calcularPerfilCircularidadeMateriaisAgregado({
            totalFormularios,
            mp1: row.mp1,
            mp2: row.mp2,
            mp3: row.mp3,
            mp4: row.mp4,
            mp5: row.mp5,
            r2Aterro: row.r2_aterro,
            r2Reciclagem: row.r2_reciclagem,
            r2Energia: row.r2_energia,
            q3Sim: row.q3_sim,
            q3Nao: row.q3_nao,
            q3Neutro: row.q3_neutro,
            q4Sim: row.q4_sim,
            q4Nao: row.q4_nao,
            q4Neutro: row.q4_neutro,
            q5Sim: row.q5_sim,
            q5Nao: row.q5_nao,
            q5Neutro: row.q5_neutro,
            q6Sim: row.q6_sim,
            q6Nao: row.q6_nao,
            q6Neutro: row.q6_neutro,
            q9Sim: row.q9_sim,
            q9Nao: row.q9_nao,
            q9Neutro: row.q9_neutro
        });
        const cosmobIndicadores = calcularIndicadoresCosmobInferidos({
            totalFormularios,
            mp1: row.mp1,
            mp2: row.mp2,
            mp3: row.mp3,
            mp4: row.mp4,
            mp5: row.mp5,
            q9Sim: row.q9_sim,
            q9Nao: row.q9_nao,
            q9Neutro: row.q9_neutro,
            q5Sim: row.q5_sim,
            q5Nao: row.q5_nao,
            q5Neutro: row.q5_neutro,
            q4Sim: row.q4_sim,
            q4Nao: row.q4_nao,
            q4Neutro: row.q4_neutro,
            q3Sim: row.q3_sim,
            q3Nao: row.q3_nao,
            q3Neutro: row.q3_neutro,
            q6Sim: row.q6_sim,
            q6Nao: row.q6_nao,
            q6Neutro: row.q6_neutro,
            r2Aterro: row.r2_aterro,
            r2Reciclagem: row.r2_reciclagem,
            r2Energia: row.r2_energia
        });

        res.json({
            success: true,
            data: {
                totalFormularios,
                mediaTotalPontos: Number(row.media_total_pontos || 0),
                mediaIGC: mediaIgc,
                mediaPCM: perfilCircularidadeMateriais.indice,
                mediaIME: perfilCircularidadeMateriais.indice,
                igcGap: Math.max(0, 100 - mediaIgc),
                topicos,
                pcmDimensoes: perfilCircularidadeMateriais.componentes,
                imeDimensoes: perfilCircularidadeMateriais.componentes,
                cosmobIndicadores
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
                e.produto_avaliado,
                q.materia_prima, q.residuos, q.desmonte, q.descarte, q.recuperacao, q.reciclagem,
                q.durabilidade, q.reparavel, q.reaproveitavel, q.ciclo_estendido, q.ciclo_rastreado, q.documentacao
            FROM questionarios q
            INNER JOIN empresas e ON q.empresa_id = e.id
            ORDER BY q.created_at DESC
        `);

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
        const perfilCircularidadeMateriais = calcularPerfilCircularidadeMateriais({
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
        });
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

        const igc = clampPercent(row.indice_global_circularidade);
        const pcm = clampPercent(perfilCircularidadeMateriais.indice);

        doc.rect(0, 0, doc.page.width, 96).fill('#0f172a');
        doc.fillColor('#f8fafc').fontSize(20).text('Relatorio de Circularidade', 44, 30);
        doc.fillColor('#cbd5e1').fontSize(10).text(`ID: ${row.questionario_id}`, 44, 58);
        doc.text(`Data/Hora: ${formatarDataHora(row.created_at)}`, 44, 72);

        doc.fillColor('#0f172a').fontSize(12).text('Identificacao', 44, 118);
        doc.fillColor('#334155').fontSize(10);
        doc.text(`Empresa: ${row.nome_empresa}`, 44, 136);
        doc.text(`Responsavel: ${row.nome_responsavel}`, 44, 150);
        doc.text(`Cidade/UF: ${row.cidade}${row.uf ? `/${row.uf}` : ''}`, 44, 164);
        doc.text(`Setor: ${row.setor_economico}`, 44, 178);
        doc.text(`Produto: ${formatarProdutoExibicao(row.produto_avaliado)}`, 44, 192);

        doc.roundedRect(44, 222, 250, 90, 8).fill('#f1f5f9');
        doc.fillColor('#0f172a').fontSize(11).text('Indicadores Gerais', 56, 236);
        doc.fillColor('#334155').fontSize(10);
        doc.text(`Pontuacao total: ${row.soma}`, 56, 254);
        doc.text(`IGC: ${igc.toFixed(2)}%`, 56, 270);
        doc.text(`PCM: ${pcm.toFixed(2)}%`, 56, 286);

        drawDoughnutIGC(doc, 396, 266, igc);
        doc.fillColor('#334155').fontSize(9).text('Indice Global de Circularidade', 332, 332, { width: 130, align: 'center' });

        doc.fillColor('#0f172a').fontSize(12).text('Percentual por Topico', 44, 356);
        drawTopicosBars(doc, 44, 374, topicos);

        escreverRecomendacoes(doc, topicos, 472);

        doc.addPage();
        doc.fillColor('#0f172a').fontSize(14).text('Respostas por Questao', 44, 44);
        let y = 72;
        for (let i = 1; i <= 12; i += 1) {
            const valor = respostas[i];
            const label = `Q${i}: ${textoAlternativa(i, valor)} (valor ${valor})`;
            doc.fillColor('#334155').fontSize(10).text(label, 44, y, { width: 500 });
            y += 18;
        }

        doc.fillColor('#64748b').fontSize(9).text(
            'Documento gerado automaticamente pelo backend da plataforma. Relatorio sintetico para consulta gerencial.',
            44,
            300,
            { width: 500 }
        );
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
