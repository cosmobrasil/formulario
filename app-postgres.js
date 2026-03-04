// Aplicativo do Questionário de Circularidade 2.0 - 2026
// Versão com conexão PostgreSQL Railway e Google Drive silencioso
(() => {
    'use strict';

    // Carregar configuração PostgreSQL
    const PG_CONFIG = window.POSTGRES_CONFIG || {};
    const DATABASE_CONFIG = PG_CONFIG.DATABASE_CONFIG || {};
    const REPORT_EMAIL = PG_CONFIG.REPORT_EMAIL || 'ti@cosmobrasil.app';

    const CONFIG = window.QUESTIONARIO_CONFIG || {};

    // Fallbacks defensivos caso config.js não carregue em produção
    const MAP_DEFAULT = {
        1: 'materia_prima',
        2: 'residuos',
        3: 'desmonte',
        4: 'descarte',
        5: 'recuperacao',
        6: 'reciclagem',
        7: 'durabilidade',
        8: 'reparavel',
        9: 'reaproveitavel',
        10: 'ciclo_estendido',
        11: 'ciclo_rastreado',
        12: 'documentacao'
    };

    const MET_DEFAULT = {
        PONTOS: {
            1: { 1: 0, 2: 2, 3: 3, 4: 2, 5: 1 },
            2: { 1: 0, 2: 2, 3: 1 },
            5: { 1: 0, 2: 2, 3: 1 },
            6: { 1: 1, 2: 0, 3: 1 },
            default: { 1: 2, 2: 0, 3: 1 }
        },
        GRUPOS: {
            INPUT: [1],
            RESIDUOS: [2],
            OUTPUT: [3, 4, 5, 6],
            VIDA: [7, 8, 9],
            MONITORAMENTO: [10, 11, 12]
        },
        PESOS: {
            INPUT: 0.25,
            RESIDUOS: 0.20,
            OUTPUT: 0.20,
            VIDA: 0.20,
            MONITORAMENTO: 0.15
        }
    };

    const QUESTÕES = Array.isArray(CONFIG.QUESTÕES) ? CONFIG.QUESTÕES : [];

    const elementos = {
        termosScreen: document.getElementById('termosScreen'),
        identificacaoScreen: document.getElementById('identificacaoScreen'),
        questionarioScreen: document.getElementById('questionarioScreen'),
        confirmacaoScreen: document.getElementById('confirmacaoScreen'),
        relatorioScreen: document.getElementById('relatorioScreen'),
        aceitarTermos: document.getElementById('aceitarTermos'),
        btnContinuar: document.getElementById('btnContinuar'),
        btnVoltarTermos: document.getElementById('btnVoltarTermos'),
        formIdentificacao: document.getElementById('formIdentificacao')
    };

    const dados = {
        empresa: {},
        respostas: {},
        questaoAtual: 0
    };

    // Event Listeners
    elementos.aceitarTermos.addEventListener('change', function () {
        elementos.btnContinuar.disabled = !this.checked;
    });

    elementos.btnContinuar.addEventListener('click', () => {
        elementos.termosScreen.classList.add('hidden');
        elementos.identificacaoScreen.classList.remove('hidden');
    });

    elementos.btnVoltarTermos.addEventListener('click', () => {
        elementos.identificacaoScreen.classList.add('hidden');
        elementos.termosScreen.classList.remove('hidden');
    });

    function normalizarCNPJ(valor) {
        return (valor || '').replace(/\D/g, '').slice(0, 14);
    }

    elementos.formIdentificacao.addEventListener('submit', function (e) {
        e.preventDefault();

        const cnpjNormalizado = normalizarCNPJ(document.getElementById('cnpj').value);
        if (cnpjNormalizado.length !== 14) {
            mostrarFeedbackCNPJ('Informe um CNPJ válido com 14 dígitos.', 'text-red-600');
            return;
        }

        document.getElementById('cnpj').value = cnpjNormalizado;

        dados.empresa = {
            nomeEmpresa: document.getElementById('nomeEmpresa').value,
            cnpj: cnpjNormalizado,
            nomeResponsavel: document.getElementById('nomeResponsavel').value,
            cidade: document.getElementById('cidade').value,
            celular: document.getElementById('celular').value,
            email: document.getElementById('email').value,
            setorEconomico: document.getElementById('setorEconomico').value,
            produtoAvaliado: document.getElementById('produtoAvaliado').value
        };

        iniciarQuestionario();
    });

    // Funcionalidade de consulta de CNPJ via API EmpresaAqui
    const btnConsultar = document.getElementById('btnConsultarCNPJ');
    const inputCNPJ = document.getElementById('cnpj');
    const feedbackCNPJ = document.getElementById('feedbackCNPJ');

    if (inputCNPJ) {
        inputCNPJ.addEventListener('input', () => {
            inputCNPJ.value = normalizarCNPJ(inputCNPJ.value);
        });
    }

    if (btnConsultar) {
        btnConsultar.addEventListener('click', async () => {
            const cnpj = normalizarCNPJ(inputCNPJ.value);
            inputCNPJ.value = cnpj;

            if (cnpj.length !== 14) {
                mostrarFeedbackCNPJ('Informe um CNPJ válido com 14 dígitos.', 'text-red-600');
                return;
            }

            try {
                btnConsultar.disabled = true;
                btnConsultar.innerHTML = '<span class="animate-pulse">Consultando...</span>';
                mostrarFeedbackCNPJ('Buscando dados na Receita...', 'text-orange-600');

                const response = await fetch(`${CONFIG.API_URL || ''}/api/cnpj/${cnpj}`);
                const result = await response.json();

                if (result.success && result.data) {
                    const d = result.data;
                    document.getElementById('nomeEmpresa').value = d.fantasia || d.razao || '';
                    document.getElementById('cidade').value = d.cidade || '';
                    document.getElementById('email').value = d.email || '';
                    document.getElementById('celular').value = d.telefone || '';

                    // Tentar mapear setor pelo CNAE
                    mapearSetorPeloCNAE(d.cnae_principal);

                    mostrarFeedbackCNPJ('✅ Dados carregados com sucesso!', 'text-emerald-600');
                } else {
                    mostrarFeedbackCNPJ('❌ ' + (result.error || 'CNPJ não encontrado.'), 'text-red-600');
                }
            } catch (error) {
                console.error('Erro na consulta de CNPJ:', error);
                mostrarFeedbackCNPJ('⚠️ Erro na conexão com o servidor.', 'text-red-600');
            } finally {
                btnConsultar.disabled = false;
                btnConsultar.innerText = 'Consultar';
            }
        });
    }

    function mostrarFeedbackCNPJ(texto, classeCor) {
        if (!feedbackCNPJ) return;
        feedbackCNPJ.innerText = texto;
        feedbackCNPJ.className = `text-xs mt-1 ${classeCor}`;
        feedbackCNPJ.classList.remove('hidden');
    }

    function mapearSetorPeloCNAE(cnae) {
        if (!cnae) return;
        const div = parseInt(cnae.substring(0, 2), 10);
        const select = document.getElementById('setorEconomico');
        if (!select) return;

        let setor = '';
        if (div >= 1 && div <= 3) setor = 'Agropecuária';
        else if (div >= 5 && div <= 33) setor = 'Indústria';
        else if (div >= 41 && div <= 43) setor = 'Construção Civil';
        else if (div >= 45 && div <= 47) setor = 'Comércio';
        else if (div >= 49 && div <= 53) setor = 'Transporte e Logística';
        else if (div >= 62 && div <= 63) setor = 'Tecnologia da Informação';
        else if (div === 85) setor = 'Educação';
        else if (div >= 86 && div <= 88) setor = 'Saúde';
        else setor = 'Serviços';

        if (setor) {
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].text === setor) {
                    select.selectedIndex = i;
                    break;
                }
            }
        }
    }

    function iniciarQuestionario() {
        elementos.identificacaoScreen.classList.add('hidden');
        elementos.questionarioScreen.classList.remove('hidden');

        dados.questaoAtual = 0;
        renderizarQuestao();
    }

    function renderizarQuestao() {
        const questao = QUESTÕES[dados.questaoAtual];
        const html = `
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-4xl mx-auto">
                <div class="mb-6">
                    <div class="text-sm text-orange-600 font-semibold mb-2">${questao.categoria}</div>
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Questão ${questao.id} de ${QUESTÕES.length}</h2>
                </div>
                
                <div class="space-y-4">
                    <h3 class="text-lg font-semibold text-gray-800">${questao.pergunta}</h3>
                    ${questao.subtitulo ? `<p class="text-sm text-gray-600">${questao.subtitulo}</p>` : ''}
                    
                    <form id="formQuestao" class="space-y-3">
                        ${questao.opcoes.map(opcao => `
                            <label class="flex items-start gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-all cursor-pointer group">
                                <input type="radio" name="resposta" value="${opcao.valor}" required class="mt-1 accent-orange-600">
                                <span class="text-gray-700 group-hover:text-gray-900">${opcao.label}</span>
                            </label>
                        `).join('')}
                    </form>
                    
                    <div class="flex justify-between mt-8 pt-6 border-t border-gray-200">
                        <button id="btnAnterior" class="px-6 py-3 bg-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-400 transition-colors">
                            ← Anterior
                        </button>
                        <button id="btnProximo" form="formQuestao" type="submit" class="px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors">
                            ${dados.questaoAtual === QUESTÕES.length - 1 ? 'Finalizar' : 'Próximo →'}
                        </button>
                    </div>
                    
                    <div class="mt-4">
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-orange-600 h-2 rounded-full" style="width: ${((dados.questaoAtual + 1) / QUESTÕES.length) * 100}%"></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-2 text-center">${dados.questaoAtual + 1} de ${QUESTÕES.length}</p>
                    </div>
                </div>
            </div>
        `;

        elementos.questionarioScreen.innerHTML = html;

        // Event listeners para o formulário
        const formQuestao = document.getElementById('formQuestao');
        formQuestao.addEventListener('submit', function (e) {
            e.preventDefault();
            const resposta = formQuestao.querySelector('input[name="resposta"]:checked').value;
            dados.respostas[questao.id] = parseInt(resposta);
            proximaQuestao();
        });

        const btnAnterior = document.getElementById('btnAnterior');
        if (dados.questaoAtual > 0) {
            btnAnterior.addEventListener('click', questaoAnterior);
        } else {
            btnAnterior.style.display = 'none';
        }
    }

    function proximaQuestao() {
        if (dados.questaoAtual < QUESTÕES.length - 1) {
            dados.questaoAtual++;
            renderizarQuestao();
        } else {
            finalizarQuestionario();
        }
    }

    function questaoAnterior() {
        if (dados.questaoAtual > 0) {
            dados.questaoAtual--;
            renderizarQuestao();
        }
    }

    // Função para conectar ao PostgreSQL e salvar dados VIA API BACKEND
    async function salvarDadosNoPostgreSQL() {
        try {
            console.log('🔄 Enviando dados para o Backend API...');

            // Validar configuração
            const apiUrl = CONFIG.API_URL || '';

            // Calcular índices
            const { pontos, totalPossivel, percentual, maturidade } = calcularPontuacao();

            // Preparar dados do questionário
            const respostasMapeadas = Object.entries(CONFIG.MAPEAMENTO_RESPOSTAS || MAP_DEFAULT).reduce((acc, [id, coluna]) => {
                acc[coluna] = dados.respostas[parseInt(id, 10)] || null;
                return acc;
            }, {});

            // Gerar relatório HTML para envio
            const estagio = classificarEstagio(percentual);
            const recs = gerarRecomendacoes(dados.respostas);
            const potencial = 100 - percentual;
            const dataStr = new Date().toLocaleString('pt-BR');
            const idRelatorio = Math.floor(Math.random() * 1000) + 1;

            const htmlEmail = construirHtmlEmailRelatorio({
                empresa: dados.empresa,
                percentual,
                maturidade,
                estagio,
                grupos: calcularPontuacao().grupos,
                recs,
                dataStr,
                idRelatorio,
                pontos,
                totalPossivel,
                potencial
            });

            // Dados completos para o backend
            const payload = {
                empresa: dados.empresa,
                respostas: respostasMapeadas,
                pontuacao: {
                    pontos,
                    percentual,
                    maturidade
                },
                relatorioHtml: htmlEmail
            };

            console.log('📋 Payload preparado:', {
                empresa: payload.empresa.nomeEmpresa,
                apiUrl
            });

            // Envio real para o backend
            const response = await fetch(`${apiUrl}/api/questionario`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro na API: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Dados salvos com sucesso via API:', result);

            return {
                success: true,
                driveSaved: result.driveSaved,
                driveUrl: result.driveUrl,
                empresaId: result.empresaId
            };

        } catch (error) {
            console.error('❌ Erro ao salvar dados:', error);
            throw error;
        }
    }

    async function finalizarQuestionario() {
        // Mostrar loading enquanto salva
        mostrarLoading();
        try {
            // Salvar dados via API (PostgreSQL + Drive no backend)
            const result = await salvarDadosNoPostgreSQL();

            if (!result.success) {
                throw new Error('Falha ao salvar dados no backend');
            }

            console.log('Processo de salvamento concluído.');

            if (result.driveSaved) {
                console.log('💾 Relatório salvo no Drive:', result.driveUrl);
            } else {
                console.warn('⚠️ Relatório foi salvo no banco, mas não no Drive (verifique o backend).');
            }

            mostrarConfirmacao(result);

        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            mostrarErro(error.message);
        }
    }

    function mostrarLoading() {
        elementos.questionarioScreen.classList.remove('hidden');
        elementos.confirmacaoScreen.classList.add('hidden');
        elementos.questionarioScreen.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-3xl mx-auto">
                <div class="flex flex-col items-center text-center">
                    <div class="loading-spinner mb-4"></div>
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Salvando dados...</h2>
                    <p class="text-gray-600">Por favor, aguarde enquanto processamos suas informações.</p>
                </div>
            </div>
        `;
    }

    function mostrarErro(mensagem) {
        elementos.confirmacaoScreen.classList.remove('hidden');
        elementos.confirmacaoScreen.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-3xl mx-auto">
                <div class="text-center">
                    <div class="text-6xl mb-4">⚠️</div>
                    <h2 class="text-3xl font-bold text-red-600 mb-4">Erro ao Salvar</h2>
                    <p class="text-gray-600 mb-6">Ocorreu um erro ao salvar seus dados.</p>
                    <div class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                        <p class="text-sm text-red-800">${mensagem}</p>
                    </div>
                    <button onclick="window.location.href='index.html'" class="px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors">
                        Tentar Novamente
                    </button>
                </div>
            </div>
        `;
    }

    function calcularPontuacao() {
        const MET = CONFIG.METODOLOGIA || MET_DEFAULT;
        const r = dados.respostas;
        let pontos = 0;
        let totalPossivel = 0;

        for (let i = 1; i <= 12; i++) {
            const mapa = MET.PONTOS[i] || MET.PONTOS.default;
            const max = Math.max(...Object.values(mapa));
            totalPossivel += max;
            const val = r[i];
            if (val != null && mapa[val] != null) {
                pontos += mapa[val];
            }
        }

        const percentual = totalPossivel > 0 ? Math.round((pontos / totalPossivel) * 100) : 0;

        // Cálculo por grupos e índice de maturidade (média ponderada dos grupos)
        const grupos = {};
        let somaPesos = 0;
        let somaPonderada = 0;
        for (const [nomeGrupo, ids] of Object.entries(MET.GRUPOS)) {
            const peso = MET.PESOS[nomeGrupo] || 1;
            let ptsGrupo = 0;
            let maxGrupo = 0;
            ids.forEach((qid) => {
                const mapa = MET.PONTOS[qid] || MET.PONTOS.default;
                const max = Math.max(...Object.values(mapa));
                maxGrupo += max;
                const val = r[qid];
                if (val != null && mapa[val] != null) ptsGrupo += mapa[val];
            });
            const percGrupo = maxGrupo > 0 ? Math.round((ptsGrupo / maxGrupo) * 100) : 0;
            grupos[nomeGrupo] = percGrupo;
            somaPesos += peso;
            somaPonderada += percGrupo * peso;
        }
        const maturidade = somaPesos > 0 ? Math.round(somaPonderada / somaPesos) : percentual;

        return { pontos, totalPossivel, percentual, grupos, maturidade };
    }

    function classificarEstagio(percentual) {
        if (percentual >= 75) return 'Alto';
        if (percentual >= 60) return 'Médio/Alto';
        if (percentual >= 45) return 'Médio';
        if (percentual >= 30) return 'Baixo/Médio';
        return 'Baixo';
    }

    function gerarRecomendacoes(r) {
        const rec = {
            INPUT: [], RESIDUOS: [], OUTPUT: [], VIDA: [], MONITORAMENTO: []
        };
        // INPUT (Q1)
        if (r[1] === 1) {
            rec.INPUT.push('Migrar gradualmente para matérias recicladas ou renováveis (metas trimestrais).');
            rec.INPUT.push('Mapear fornecedores com certificações e rastreabilidade de insumos.');
        } else if (r[1] === 5) {
            rec.INPUT.push('Realizar auditoria de materiais e origem dos insumos.');
            rec.INPUT.push('Implantar rastreio básico de fornecedores (contratos e comprovantes).');
        } else {
            rec.INPUT.push('Manter nível atual e ampliar participação de materiais com menor impacto.');
        }
        // RESÍDUOS (Q2)
        if (r[2] === 1) {
            rec.RESIDUOS.push('Redirecionar fluxos de resíduos para reciclagem e reuso.');
            rec.RESIDUOS.push('Firmar parceria com recicladores locais e cooperativas.');
        } else if (r[2] === 3) {
            rec.RESIDUOS.push('Avançar para recuperação material antes da energética quando possível.');
            rec.RESIDUOS.push('Aprimorar segregação e triagem para aumentar reciclabilidade.');
        } else {
            rec.RESIDUOS.push('Otimizar triagem, documentação e rastreabilidade de resíduos.');
        }
        // OUTPUT (Q3..Q6)
        if (r[3] !== 1) rec.OUTPUT.push('Aplicar design para desmonte e facilitar separação de materiais.');
        if (r[4] !== 1) rec.OUTPUT.push('Aumentar reciclabilidade dos materiais e simplificar composições.');
        if (r[5] === 1) rec.OUTPUT.push('Evitar descarte em aterro, planejar reuso e reciclagem.');
        if (r[6] === 1) rec.OUTPUT.push('Avaliar alternativas à recuperação energética priorizando reciclagem.');
        if (rec.OUTPUT.length === 0) rec.OUTPUT.push('Manter práticas e validar reciclabilidade com testes periódicos.');
        // VIDA (Q7..Q9)
        if (r[7] !== 1) rec.VIDA.push('Testar durabilidade e estabelecer garantias claras.');
        if (r[8] !== 1) rec.VIDA.push('Projetar para reparo e disponibilizar peças/guia de manutenção.');
        if (r[9] !== 1) rec.VIDA.push('Criar programas de reuso e reaproveitamento pós-uso.');
        if (rec.VIDA.length === 0) rec.VIDA.push('Fortalecer comunicação de durabilidade e reparabilidade ao cliente.');
        // MONITORAMENTO (Q10..Q12)
        if (r[10] !== 1) rec.MONITORAMENTO.push('Oferecer serviços pós-venda (limpeza, manutenção, recolhimento).');
        if (r[11] !== 1) rec.MONITORAMENTO.push('Implementar rastreio (QR Code, passaporte digital) para ciclo de vida.');
        if (r[12] !== 1) rec.MONITORAMENTO.push('Disponibilizar documentação clara ao consumidor (materiais, certificações).');
        if (rec.MONITORAMENTO.length === 0) rec.MONITORAMENTO.push('Integrar dados de ciclo de vida ao CRM e suporte técnico.');
        return rec;
    }

    // Funções de relatório (mantidas iguais)
    function construirHtmlEmailRelatorio({ empresa, percentual, maturidade, estagio, grupos, recs, dataStr, idRelatorio, pontos, totalPossivel, potencial }) {
        const setores = grupos || {};
        const lista = (arr) => Array.isArray(arr) ? arr.map(i => `<li>${i}</li>`).join('') : '';
        return `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Relatório de Circularidade</title>
          <style>
            body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;background:#ffffff;margin:0;padding:24px;}
            .container{max-width:720px;margin:0 auto;}
            h1{font-size:22px;margin:0 0 8px;color:#111827}
            h2{font-size:18px;margin:16px 0 8px;color:#111827}
            p,li{font-size:14px;line-height:1.5;color:#374151}
            .card{border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:10px}
            .grid{display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:12px}
            .badge{display:inline-block;padding:4px 8px;border-radius:6px;background:#ecfdf5;color:#065f46;font-weight:600;font-size:12px}
            .small{font-size:12px;color:#6b7280}
            .footer{margin-top:24px;font-size:12px;color:#9ca3af}
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Relatório de Circularidade</h1>
            <p class="small">ID #${idRelatorio} · Gerado em ${dataStr}</p>
            <div class="card">
              <h2>Empresa</h2>
              <p><strong>Nome:</strong> ${empresa.nomeEmpresa || '-'}<br/>
              <strong>Cidade:</strong> ${empresa.cidade || '-'}<br/>
              <strong>Celular:</strong> ${empresa.celular || '-'}<br/>
              <strong>CNPJ:</strong> ${empresa.cnpj || '-'}<br/>
              <strong>Responsável:</strong> ${empresa.nomeResponsavel || '-'}<br/>
              <strong>E-mail:</strong> ${empresa.email || '-'}<br/>
              <strong>Setor:</strong> ${empresa.setorEconomico || '-'}<br/>
              <strong>Produto:</strong> ${empresa.produtoAvaliado || '-'}</p>
            </div>
            <div class="card">
              <h2>Resultado</h2>
              <p><span class="badge">Índice Global: ${percentual}%</span> · <span class="badge">Maturidade: ${maturidade}%</span> · <span class="badge">Estágio: ${estagio}</span></p>
              <p>Pontuação: ${pontos} de ${totalPossivel} · Potencial de melhoria: ${potencial}%</p>
              <div class="grid">
                ${Object.entries(setores).map(([nome, perc]) => `<div><p class="small"><strong>${nome}</strong></p><p>${perc}%</p></div>`).join('')}
              </div>
            </div>
            <div class="card">
              <h2>Recomendações</h2>
              <p><strong>Entradas</strong></p>
              <ul>${lista(recs.INPUT)}</ul>
              <p><strong>Resíduos</strong></p>
              <ul>${lista(recs.RESIDUOS)}</ul>
              <p><strong>Saídas</strong></p>
              <ul>${lista(recs.OUTPUT)}</ul>
              <p><strong>Vida Útil & Pós-venda</strong></p>
              <ul>${lista(recs.VIDA)}</ul>
              <p><strong>Monitoramento</strong></p>
              <ul>${lista(recs.MONITORAMENTO)}</ul>
            </div>
            <p class="footer">Este relatório foi gerado automaticamente pelo Questionário de Circularidade da CosmoBrasil 2.0 - 2026.</p>
          </div>
        </body>
        </html>`;
    }

    function mostrarConfirmacao(driveResult = null) {
        elementos.questionarioScreen.classList.add('hidden');
        elementos.confirmacaoScreen.classList.remove('hidden');

        elementos.confirmacaoScreen.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-3xl mx-auto">
                <div class="text-center">
                    <div class="text-6xl mb-4">✅</div>
                    <h2 class="text-3xl font-bold text-gray-900 mb-4">Questionário Concluído!</h2>
                    <p class="text-gray-600 mb-6">Obrigado por participar do pré-diagnóstico de circularidade.</p>
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6 text-left">
                        <h3 class="font-bold text-orange-900 mb-3">Próximos Passos:</h3>
                        <ul class="space-y-2 text-sm text-gray-700">
                            <li>• Os dados foram salvos com sucesso no banco PostgreSQL</li>
                            <li>• Relatório gerado e processado</li>
                            <li>• Dashboard de análise estará disponível em breve</li>
                        </ul>
                    </div>
                    <div class="flex justify-center gap-3">
                        <button id="btnVerRelatorio" class="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                            Ver Relatório
                        </button>
                        <button onclick="window.location.href='index.html'" class="px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors">
                            Voltar ao Início
                        </button>
                    </div>
                </div>
            </div>
        `;

        const btnVerRelatorio = document.getElementById('btnVerRelatorio');
        if (btnVerRelatorio) {
            btnVerRelatorio.addEventListener('click', mostrarRelatorio);
        }
    }

    async function mostrarRelatorio() {
        elementos.confirmacaoScreen.classList.add('hidden');
        elementos.relatorioScreen.classList.remove('hidden');
        const { pontos, totalPossivel, percentual, grupos, maturidade } = calcularPontuacao();
        const potencial = 100 - percentual;
        const empresa = dados.empresa || {};
        const data = new Date();
        const dataStr = data.toLocaleString('pt-BR');
        const idRelatorio = Math.floor(Math.random() * 1000) + 1;
        const estagio = classificarEstagio(percentual);
        const recs = gerarRecomendacoes(dados.respostas);

        elementos.relatorioScreen.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-4xl mx-auto">
                <div class="mb-6">
                    <h2 class="text-3xl font-bold text-gray-900">Relatório Completo de Circularidade 2.0</h2>
                    <p class="text-sm text-gray-500">ID do Relatório: <span class="font-mono">#${idRelatorio}</span> · Gerado em ${dataStr}</p>
                </div>
                <div class="grid md:grid-cols-2 gap-6 mb-8">
                    <div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <h3 class="font-semibold text-slate-900 mb-2">Empresa</h3>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Nome:</span> ${empresa.nomeEmpresa || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Cidade:</span> ${empresa.cidade || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Celular:</span> ${empresa.celular || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">CNPJ:</span> ${empresa.cnpj || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Responsável:</span> ${empresa.nomeResponsavel || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">E-mail:</span> ${empresa.email || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Setor:</span> ${empresa.setorEconomico || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Produto:</span> ${empresa.produtoAvaliado || '-'} </p>
                    </div>
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <h3 class="font-semibold text-orange-900 mb-2">Resultado do Diagnóstico</h3>
                        <p class="text-sm text-orange-800">Pontuação Total: <span class="font-bold">${pontos}</span> de ${totalPossivel} pontos</p>
                        <p class="text-sm text-orange-800">Índice de Circularidade: <span class="font-bold">${percentual}%</span></p>
                        <p class="text-sm text-orange-800">Índice de Maturidade Estruturante: <span class="font-bold">${maturidade}%</span></p>
                        <p class="text-sm text-orange-800">Estágio: <span class="font-bold">${estagio}</span></p>
                        <div class="mt-3">
                            <div class="w-full bg-orange-100 rounded-full h-2">
                                <div class="bg-orange-600 h-2 rounded-full" style="width: ${percentual}%"></div>
                            </div>
                            <p class="text-xs text-orange-700 mt-2 text-center">Circularidade alcançada: ${percentual}% · Potencial de melhoria: ${potencial}%</p>
                        </div>
                        <div class="mt-4 grid md:grid-cols-5 gap-3">
                            ${Object.entries(grupos).map(([nome, perc]) => `
                                <div class="text-center bg-white border border-orange-200 rounded-lg p-2">
                                    <div class="text-xs text-gray-500">${nome}</div>
                                    <div class="text-lg font-bold text-orange-700">${perc}%</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="space-y-6">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">Recomendações Personalizadas</h3>
                        <div class="mt-3 grid md:grid-cols-2 gap-4">
                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 class="font-semibold text-blue-900 mb-2">Entradas</h4>
                                <ul class="text-sm text-blue-800 space-y-1">
                                    ${recs.INPUT.map(item => `<li>• ${item}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <h4 class="font-semibold text-orange-900 mb-2">Resíduos</h4>
                                <ul class="text-sm text-orange-800 space-y-1">
                                    ${recs.RESIDUOS.map(item => `<li>• ${item}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                <h4 class="font-semibold text-indigo-900 mb-2">Saídas</h4>
                                <ul class="text-sm text-indigo-800 space-y-1">
                                    ${recs.OUTPUT.map(item => `<li>• ${item}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="bg-teal-50 border border-teal-200 rounded-lg p-4">
                                <h4 class="font-semibold text-teal-900 mb-2">Vida Útil & Pós-venda</h4>
                                <ul class="text-sm text-teal-800 space-y-1">
                                    ${recs.VIDA.map(item => `<li>• ${item}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 md:col-span-2">
                                <h4 class="font-semibold text-slate-900 mb-2">Monitoramento</h4>
                                <ul class="text-sm text-slate-800 space-y-1">
                                    ${recs.MONITORAMENTO.map(item => `<li>• ${item}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h3 class="text-lg font-semibold text-gray-900">Observações Técnicas</h3>
                        <p class="text-sm text-gray-700">Este relatório é gerado automaticamente com base nas respostas fornecidas no pré-diagnóstico. Recomenda-se validação técnica para decisões estratégicas.</p>
                    </div>
                </div>
                <div class="mt-8 flex justify-between">
                    <button id="btnVoltarConfirmacao" class="px-6 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400">← Voltar</button>
                    <div class="flex gap-2">
                        <button id="btnExportarPDF" class="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700">Exportar PDF</button>
                        <button id="btnBaixarHTML" class="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">Baixar HTML</button>
                    </div>
                </div>
            </div>
        `;

        const btnVoltar = document.getElementById('btnVoltarConfirmacao');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => {
                elementos.relatorioScreen.classList.add('hidden');
                elementos.confirmacaoScreen.classList.remove('hidden');
            });
        }

        const btnPDF = document.getElementById('btnExportarPDF');
        if (btnPDF) {
            btnPDF.addEventListener('click', exportarRelatorioPDF);
        }
        const btnHTML = document.getElementById('btnBaixarHTML');
        if (btnHTML) {
            btnHTML.addEventListener('click', baixarRelatorioHTML);
        }
    }

    function exportarRelatorioPDF() {
        const html = elementos.relatorioScreen.innerHTML;
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Circularidade</title><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="style.css"><style>@page{size:A4;margin:20mm;} body{background:#fff;} .no-print{display:none !important;} @media print{button,a{display:none !important;}}</style></head><body class="p-8">${html}</body></html>`);
        win.document.close();
        win.onload = () => {
            win.focus();
            win.print();
        };
    }

    function baixarRelatorioHTML() {
        const htmlConteudo = elementos.relatorioScreen.innerHTML;
        const doc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Circularidade</title><link rel="stylesheet" href="style.css"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#fff;padding:2rem;max-width:900px;margin:auto;} h2{margin:0 0 0.5rem;} .card{border:1px solid #e5e7eb;border-radius:0.5rem;padding:1rem;margin-bottom:1rem;} .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;} .badge{display:inline-block;padding:0.25rem 0.5rem;border-radius:0.375rem;background:#f1f5f9;color:#0f172a;font-weight:600;font-size:0.75rem;} ul{margin:0;padding-left:1rem;} li{margin:0.25rem 0;}</style></head><body>${htmlConteudo}</body></html>`;
        const blob = new Blob([doc], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'relatorio-circularidade.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Inicialização
    console.log('Aplicativo do Questionário 2.0 - 2026 carregado');
    console.log('Total de questões:', QUESTÕES.length);

})();
