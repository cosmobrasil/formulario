// Aplicativo do Questionário de Circularidade
(() => {
    'use strict';
    
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
    elementos.aceitarTermos.addEventListener('change', function() {
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

    elementos.formIdentificacao.addEventListener('submit', function(e) {
        e.preventDefault();
        
        dados.empresa = {
            nomeEmpresa: document.getElementById('nomeEmpresa').value || 'não identificado',
            cnpj: document.getElementById('cnpj').value || '',
            nomeResponsavel: document.getElementById('nomeResponsavel').value || 'não identificado',
            cidade: document.getElementById('cidade').value || 'NÃO INFORMADO',
            celular: document.getElementById('celular').value || '',
            email: document.getElementById('email').value || 'sem-email@cosmobrasil.app',
            setorEconomico: document.getElementById('setorEconomico').value || 'Outro',
            produtoAvaliado: document.getElementById('produtoAvaliado').value || 'Não Informado'
        };
        
        iniciarQuestionario();
    });
    
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
                    <div class="text-sm text-blue-600 font-semibold mb-2">${questao.categoria}</div>
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Questão ${questao.id} de ${QUESTÕES.length}</h2>
                </div>
                
                <div class="space-y-4">
                    <h3 class="text-lg font-semibold text-gray-800">${questao.pergunta}</h3>
                    ${questao.subtitulo ? `<p class="text-sm text-gray-600">${questao.subtitulo}</p>` : ''}
                    
                    <form id="formQuestao" class="space-y-3">
                        ${questao.opcoes.map(opcao => `
                            <label class="flex items-start gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer group">
                                <input type="radio" name="resposta" value="${opcao.valor}" required class="mt-1 accent-blue-600">
                                <span class="text-gray-700 group-hover:text-gray-900">${opcao.label}</span>
                            </label>
                        `).join('')}
                    </form>
                    
                    <div class="flex justify-between mt-8 pt-6 border-t border-gray-200">
                        <button id="btnAnterior" class="px-6 py-3 bg-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-400 transition-colors">
                            ← Anterior
                        </button>
                        <button id="btnProximo" form="formQuestao" type="submit" class="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                            ${dados.questaoAtual === QUESTÕES.length - 1 ? 'Finalizar' : 'Próximo →'}
                        </button>
                    </div>
                    
                    <div class="mt-4">
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-blue-600 h-2 rounded-full" style="width: ${((dados.questaoAtual + 1) / QUESTÕES.length) * 100}%"></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-2 text-center">${dados.questaoAtual + 1} de ${QUESTÕES.length}</p>
                    </div>
                </div>
            </div>
        `;
        
        elementos.questionarioScreen.innerHTML = html;
        
        // Event listeners para o formulário
        const formQuestao = document.getElementById('formQuestao');
        formQuestao.addEventListener('submit', function(e) {
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
    
    async function finalizarQuestionario() {
        // Mostrar loading enquanto salva
        mostrarLoading();
        try {
            console.log('Salvando dados no PostgreSQL...');

            // Calcular pontuação
            const { pontos, totalPossivel, percentual, maturidade } = calcularPontuacao();
            const perfilCircularidadeMateriais = calcularPerfilCircularidadeMateriais(dados.respostas);

            // Preparar dados do questionário usando o mapeamento
            const respostasMapeadas = Object.entries(CONFIG.MAPEAMENTO_RESPOSTAS || MAP_DEFAULT).reduce((acc, [id, coluna]) => {
                acc[coluna] = dados.respostas[parseInt(id, 10)] || null;
                return acc;
            }, {});

            // Gerar HTML do relatório
            const empresa = dados.empresa || {};
            const data = new Date();
            const dataStr = data.toLocaleString('pt-BR');
            const idRelatorio = Math.floor(Math.random() * 1000) + 1;
            const estagio = classificarEstagio(percentual);
            const recs = gerarRecomendacoes(dados.respostas);
            const potencial = 100 - percentual;
            const htmlEmail = construirHtmlEmailRelatorio({
                empresa,
                percentual,
                perfilCircularidadeMateriais,
                estagio,
                grupos: calcularPontuacao().grupos,
                recs,
                dataStr,
                idRelatorio,
                pontos,
                totalPossivel,
                potencial
            });

            // Enviar para o backend
            const apiUrl = CONFIG.API_URL || '';
            const response = await fetch(`${apiUrl}/api/questionario`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    empresa: dados.empresa,
                    respostas: respostasMapeadas,
                    pontuacao: {
                        pontos,
                        percentual,
                        maturidade: perfilCircularidadeMateriais.indice,
                        perfilCircularidadeMateriais: perfilCircularidadeMateriais.indice
                    },
                    relatorioHtml: htmlEmail  // Enviar HTML para salvar no Drive
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('Dados salvos com sucesso!', result);

            // Mostrar se foi salvo no Drive
            if (result.driveSaved) {
                console.log('✅ Relatório também salvo no Google Drive:', result.driveUrl);
            }

            mostrarConfirmacao();

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
                    <button onclick="window.location.href='index.html'" class="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
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

        // Cálculo por grupos para consolidar a leitura do perfil por dimensão
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

    function calcularPerfilCircularidadeMateriais(respostas) {
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

        return { indice, componentes };
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

    async function mostrarRelatorio() {
        elementos.confirmacaoScreen.classList.add('hidden');
        elementos.relatorioScreen.classList.remove('hidden');
        const { pontos, totalPossivel, percentual, grupos } = calcularPontuacao();
        const perfilCircularidadeMateriais = calcularPerfilCircularidadeMateriais(dados.respostas);
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
                    <h2 class="text-3xl font-bold text-gray-900">Relatório Completo de Circularidade</h2>
                    <p class="text-sm text-gray-500">ID do Relatório: <span class="font-mono">#${idRelatorio}</span> · Gerado em ${dataStr}</p>
                </div>

                <div class="grid md:grid-cols-2 gap-6 mb-8">
                    <div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <h3 class="font-semibold text-slate-900 mb-2">Empresa</h3>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Nome:</span> ${empresa.nomeEmpresa || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">CNPJ:</span> ${empresa.cnpj || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Responsável:</span> ${empresa.nomeResponsavel || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">E-mail:</span> ${empresa.email || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Setor:</span> ${empresa.setorEconomico || '-'} </p>
                        <p class="text-sm text-slate-700"><span class="font-semibold">Produto:</span> ${empresa.produtoAvaliado || '-'} </p>
                    </div>
                    <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                        <h3 class="font-semibold text-emerald-900 mb-2">Resultado do Diagnóstico</h3>
                        <p class="text-sm text-emerald-800">Pontuação Total: <span class="font-bold">${pontos}</span> de ${totalPossivel} pontos</p>
                        <p class="text-sm text-emerald-800">Índice de Circularidade: <span class="font-bold">${percentual}%</span></p>
                        <p class="text-sm text-emerald-800">Perfil de Circularidade de Materiais: <span class="font-bold">${perfilCircularidadeMateriais.indice}%</span></p>
                        <p class="text-sm text-emerald-800">Estágio: <span class="font-bold">${estagio}</span></p>
                        <div class="mt-3">
                            <div class="w-full bg-emerald-100 rounded-full h-2">
                                <div class="bg-emerald-600 h-2 rounded-full" style="width: ${percentual}%"></div>
                            </div>
                            <p class="text-xs text-emerald-700 mt-2 text-center">Circularidade alcançada: ${percentual}% · Potencial de melhoria: ${potencial}%</p>
                        </div>
                        <div class="mt-4 grid md:grid-cols-5 gap-3">
                            ${Object.entries(grupos).map(([nome, perc]) => `
                                <div class="text-center bg-white border border-emerald-200 rounded-lg p-2">
                                    <div class="text-xs text-gray-500">${nome}</div>
                                    <div class="text-lg font-bold text-emerald-700">${perc}%</div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="mt-5 pt-4 border-t border-emerald-200">
                            <h4 class="text-sm font-bold text-emerald-900 mb-1">O que é o Índice Global de Circularidade?</h4>
                            <p class="text-xs text-emerald-800 mb-3">É a pontuação principal que mede o quanto a sua empresa e o seu produto avaliado já incorporam os princípios da Economia Circular na prática. Ele reflete a sua eficiência no uso de matérias-primas renováveis, no prolongamento da vida útil dos produtos e na gestão correta dos resíduos (como reuso ou reciclagem) em todo o ciclo de produção.</p>
                            
                            <h4 class="text-sm font-bold text-emerald-900 mb-1">O que é o Perfil de Circularidade de Materiais?</h4>
                            <p class="text-xs text-emerald-800">É a síntese da circularidade dos materiais do produto avaliado, combinando a origem da matéria-prima, a gestão de resíduos e os desfechos de fim de vida mais relevantes. O cálculo usa as respostas das questões Q1, Q2, Q3, Q4, Q5, Q6 e Q9 para transformar o questionário em um indicador único, de leitura mais direta para o usuário.</p>
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

        // Envio por e‑mail movido para a finalização do questionário
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

    // ===== E-mail do Relatório =====
    function construirHtmlEmailRelatorio({ empresa, percentual, perfilCircularidadeMateriais, estagio, grupos, recs, dataStr, idRelatorio, pontos, totalPossivel, potencial }) {
        const setores = grupos || {};
        const pcm = perfilCircularidadeMateriais || { indice: 0, componentes: {} };
        const lista = (arr) => Array.isArray(arr) ? arr.map(i => `<li>${i}</li>`).join('') : '';

        // Determinar cor baseada no percentual
        const getCor = (pct) => {
            if (pct >= 75) return { bg: '#ecfdf5', text: '#065f46', border: '#10b981', progress: '#10b981' };
            if (pct >= 60) return { bg: '#eff6ff', text: '#1e40af', border: '#3b82f6', progress: '#3b82f6' };
            if (pct >= 45) return { bg: '#fffbeb', text: '#92400e', border: '#f59e0b', progress: '#f59e0b' };
            if (pct >= 30) return { bg: '#fef3c7', text: '#78350f', border: '#fbbf24', progress: '#fbbf24' };
            return { bg: '#fef2f2', text: '#991b1b', border: '#ef4444', progress: '#ef4444' };
        };

        const cores = getCor(percentual);

        return `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Relatório de Circularidade - ${empresa.nomeEmpresa || 'Empresa'}</title>
          <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
              color:#1f2937;
              background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
              margin:0;
              padding:20px;
              line-height:1.6;
            }
            .container{
              max-width:900px;
              margin:0 auto;
              background:#ffffff;
              border-radius:20px;
              box-shadow:0 20px 60px rgba(0,0,0,0.3);
              overflow:hidden;
            }
            .header{
              background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
              color:white;
              padding:40px;
              text-align:center;
            }
            .header h1{
              font-size:32px;
              font-weight:700;
              margin:0 0 10px 0;
              color:white;
            }
            .header p{
              font-size:14px;
              opacity:0.9;
              margin:0;
            }
            .content{
              padding:40px;
            }
            .card{
              background:#f9fafb;
              border:1px solid #e5e7eb;
              border-radius:12px;
              padding:24px;
              margin-bottom:24px;
            }
            .card h2{
              font-size:20px;
              font-weight:600;
              color:#111827;
              margin:0 0 16px 0;
              padding-bottom:12px;
              border-bottom:2px solid #e5e7eb;
            }
            .card p{
              font-size:15px;
              color:#374151;
              margin:8px 0;
            }
            .badge-container{
              display:flex;
              flex-wrap:wrap;
              gap:10px;
              margin:16px 0;
            }
            .badge{
              display:inline-block;
              padding:8px 16px;
              border-radius:20px;
              background:${cores.bg};
              color:${cores.text};
              font-weight:600;
              font-size:14px;
              border:2px solid ${cores.border};
            }
            .progress-section{
              background:${cores.bg};
              border:2px solid ${cores.border};
              border-radius:12px;
              padding:24px;
              margin:20px 0;
              text-align:center;
            }
            .progress-title{
              font-size:24px;
              font-weight:700;
              color:${cores.text};
              margin:0 0 16px 0;
            }
            .progress-bar{
              width:100%;
              height:30px;
              background:#e5e7eb;
              border-radius:15px;
              overflow:hidden;
              margin:16px 0;
            }
            .progress-fill{
              height:100%;
              background:linear-gradient(90deg,${cores.progress} 0%,${cores.border} 100%);
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight:700;
              color:white;
              font-size:16px;
              transition:width 1s ease;
            }
            .stats-grid{
              display:grid;
              grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
              gap:16px;
              margin:20px 0;
            }
            .stat-item{
              background:#ffffff;
              border:2px solid #e5e7eb;
              border-radius:10px;
              padding:16px;
              text-align:center;
            }
            .stat-label{
              font-size:12px;
              color:#6b7280;
              font-weight:600;
              text-transform:uppercase;
              margin-bottom:8px;
            }
            .stat-value{
              font-size:28px;
              font-weight:700;
              color:${cores.text};
            }
            .recommendations ul{
              list-style:none;
              padding:0;
              margin:0;
            }
            .recommendations li{
              padding:12px 16px;
              margin:8px 0;
              background:#ffffff;
              border-left:4px solid ${cores.border};
              border-radius:6px;
              font-size:14px;
              color:#374151;
            }
            .section-title{
              font-size:16px;
              font-weight:600;
              color:${cores.text};
              margin:16px 0 8px 0;
              padding:8px 12px;
              background:${cores.bg};
              border-radius:6px;
            }
            .footer{
              background:#f9fafb;
              padding:24px;
              text-align:center;
              border-top:1px solid #e5e7eb;
            }
            .footer p{
              font-size:13px;
              color:#6b7280;
              margin:0;
            }
            .company-info{
              background:#ffffff;
              border:2px dashed ${cores.border};
              border-radius:10px;
              padding:20px;
            }
            .company-info p{
              margin:6px 0;
              font-size:14px;
            }
            .company-info strong{
              color:${cores.text};
              min-width:120px;
              display:inline-block;
            }
            @media print{
              body{background:white;padding:0;}
              .container{box-shadow:none;border-radius:0;}
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Relatório de Circularidade</h1>
              <p>ID: #${idRelatorio} · Gerado em ${dataStr}</p>
            </div>

            <div class="content">
              <div class="card">
                <h2>🏢 Empresa</h2>
                <div class="company-info">
                  <p><strong>Nome:</strong> ${empresa.nomeEmpresa || '-'}</p>
                  <p><strong>CNPJ:</strong> ${empresa.cnpj || '-'}</p>
                  <p><strong>Responsável:</strong> ${empresa.nomeResponsavel || '-'}</p>
                  <p><strong>E-mail:</strong> ${empresa.email || '-'}</p>
                  <p><strong>Cidade:</strong> ${empresa.cidade || '-'}</p>
                  <p><strong>Celular:</strong> ${empresa.celular || '-'}</p>
                  <p><strong>Setor:</strong> ${empresa.setorEconomico || '-'}</p>
                  <p><strong>Produto Avaliado:</strong> ${empresa.produtoAvaliado || '-'}</p>
                </div>
              </div>

              <div class="progress-section">
                <h2 class="progress-title">Índice Global de Circularidade</h2>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${percentual}%">
                    ${percentual}%
                  </div>
                </div>
                <p style="font-size:16px;color:${cores.text};font-weight:600;margin-top:16px;">
                  Estágio: <strong>${estagio}</strong> · Potencial de melhoria: <strong>${potencial}%</strong>
                </p>
              </div>

              <div class="card">
                <h2>📈 Métricas Detalhadas</h2>
                <div class="stats-grid">
                  <div class="stat-item">
                    <div class="stat-label">Pontuação Total</div>
                    <div class="stat-value">${pontos}<span style="font-size:16px;color:#6b7280;">/${totalPossivel}</span></div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-label">Índice Global</div>
                    <div class="stat-value">${percentual}%</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-label">Perfil de Circularidade de Materiais</div>
                    <div class="stat-value">${pcm.indice}%</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-label">Classificação</div>
                    <div class="stat-value" style="font-size:20px;">${estagio}</div>
                  </div>
                </div>
                <div class="badge-container">
                  ${Object.entries(setores).map(([nome, perc]) => `
                    <div class="badge">
                      <strong>${nome}</strong>: ${perc}%
                    </div>
                  `).join('')}
                </div>
                
                <div style="margin-top:24px; padding-top:20px; border-top:2px solid #e5e7eb;">
                  <h3 style="font-size:16px; font-weight:600; color:#111827; margin:0 0 8px 0;">O que é o Índice Global de Circularidade?</h3>
                  <p style="font-size:14px; color:#374151; margin:0 0 16px 0; line-height:1.5;">É a pontuação principal que mede o quanto a sua empresa e o seu produto avaliado já incorporam os princípios da Economia Circular na prática. Ele reflete a sua eficiência no uso de matérias-primas renováveis, no prolongamento da vida útil dos produtos e na gestão correta dos resíduos (como reuso ou reciclagem) em todo o ciclo de produção.</p>
                  <h3 style="font-size:16px; font-weight:600; color:#111827; margin:0 0 8px 0;">O que é o Perfil de Circularidade de Materiais?</h3>
                  <p style="font-size:14px; color:#374151; margin:0; line-height:1.5;">É a síntese da circularidade dos materiais do produto avaliado, combinando a origem da matéria-prima, a gestão de resíduos e os desfechos de fim de vida mais relevantes. O cálculo usa as respostas das questões Q1, Q2, Q3, Q4, Q5, Q6 e Q9 para transformar o questionário em um indicador único, de leitura mais direta para o usuário.</p>
                </div>
              </div>

              <div class="card recommendations">
                <h2>💡 Recomendações Personalizadas</h2>

                <div class="section-title">📥 Entradas (Input)</div>
                <ul>${lista(recs.INPUT)}</ul>

                <div class="section-title">♻️ Resíduos</div>
                <ul>${lista(recs.RESIDUOS)}</ul>

                <div class="section-title">📤 Saídas (Output)</div>
                <ul>${lista(recs.OUTPUT)}</ul>

                <div class="section-title">🔧 Vida Útil & Pós-venda</div>
                <ul>${lista(recs.VIDA)}</ul>

                <div class="section-title">📊 Monitoramento</div>
                <ul>${lista(recs.MONITORAMENTO)}</ul>
              </div>
            </div>

            <div class="footer">
              <p><strong>Relatório gerado automaticamente pelo Questionário de Circularidade CosmoBrasil 2026</strong></p>
              <p style="margin-top:8px;">Centro Tecnológico de Economia Circular</p>
            </div>
          </div>
        </body>
        </html>`;
    }

    async function enviarRelatorioPorEmail({ html, empresa, assunto }) {
        // TODO: Implementar envio de e-mail via backend
        // Por enquanto, apenas loga o HTML e retorna true
        console.log('📧 Email seria enviado para:', empresa?.email);
        console.log('📧 Assunto:', assunto);
        console.log('📧 HTML do relatório gerado (primeiros 500 chars):', html.substring(0, 500));
        return true;
    }
    
    function mostrarConfirmacao() {
        elementos.questionarioScreen.classList.add('hidden');
        elementos.confirmacaoScreen.classList.remove('hidden');
        
        elementos.confirmacaoScreen.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-3xl mx-auto">
                <div class="text-center">
                    <div class="text-6xl mb-4">✅</div>
                    <h2 class="text-3xl font-bold text-gray-900 mb-4">Questionário Concluído!</h2>
                    <p class="text-gray-600 mb-6">Obrigado por participar do pré-diagnóstico de circularidade.</p>
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-left">
                        <h3 class="font-bold text-blue-900 mb-3">Próximos Passos:</h3>
                        <ul class="space-y-2 text-sm text-gray-700">
                            <li>• Os dados foram salvos com sucesso</li>
                            <li>• O dashboard de análise estará disponível em breve</li>
                        </ul>
                    </div>
                    <div class="flex justify-center gap-3">
                        <button id="btnVerRelatorio" class="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                            Ver Relatório
                        </button>
                        <button onclick="window.location.href='index.html'" class="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
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
    
    // Inicialização
    console.log('✅ Aplicativo do Questionário carregado');
    console.log('📊 Total de questões:', QUESTÕES.length);
    console.log('🔗 Backend API:', CONFIG.API_URL || 'http://localhost:3000');

})();
