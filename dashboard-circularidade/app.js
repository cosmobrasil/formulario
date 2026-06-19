(function () {
  const FETCH_TIMEOUT_MS = 15000;
  function fetchComTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }
  function mostrarStatus(texto, tipo) {
    const el = document.getElementById('statusMsg');
    if (!el) return;
    el.textContent = texto;
    el.className = 'status-msg' + (tipo ? ' status-' + tipo : '');
    el.hidden = false;
  }

  const RAILWAY_API_BASE = 'https://formulario-production-8df7.up.railway.app';
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1';
  const isNetlify = window.location.hostname.endsWith('netlify.app');
  const apiBaseFromQuery = new URLSearchParams(window.location.search).get('apiBase');
  const apiBaseFromGlobal = window.__API_BASE__;
  const apiBaseFromStorage = window.localStorage.getItem('dashboardCircularidadeApiBase');
  const isLocalBackendHost = isLocal && window.location.port === '3000';
  const API_BASE = apiBaseFromQuery
    || apiBaseFromGlobal
    || apiBaseFromStorage
    || (isNetlify ? '' : (isLocalBackendHost ? '' : RAILWAY_API_BASE));

  const STORAGE_KEY = 'dashboardCircularidadeAdminToken';

  const el = {
    setor: document.getElementById('filtroSetor'),
    produto: document.getElementById('filtroProduto'),
    cidade: document.getElementById('filtroCidade'),
    uf: document.getElementById('filtroUf'),
    dataInicio: document.getElementById('filtroDataInicio'),
    dataFim: document.getElementById('filtroDataFim'),
    btnAtualizar: document.getElementById('btnAtualizar'),
    autoRefresh: document.getElementById('autoRefresh'),
    adminToken: document.getElementById('adminToken'),
    kpiTotal: document.getElementById('kpiTotal'),
    kpiPontos: document.getElementById('kpiPontos'),
    kpiIGC: document.getElementById('kpiIGC'),
    kpiPCM: document.getElementById('kpiPCM'),
    recomendacoes: document.getElementById('recomendacoes')
  };

  const charts = {};
  let refreshTimer = null;
  let chartPluginsRegistered = false;

  function getAdminToken() {
    return el.adminToken.value.trim();
  }

  function buildHeaders(extra = {}) {
    const headers = { ...extra };
    const token = getAdminToken();
    if (token) {
      headers['x-admin-token'] = token;
    }
    return headers;
  }

  function paramsToQuery(obj) {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') p.set(k, String(v).trim());
    });
    return p.toString();
  }

  function filtrosAtuais() {
    return {
      setor: el.setor.value,
      produto: el.produto.value,
      cidade: el.cidade.value,
      uf: el.uf.value,
      data_inicio: el.dataInicio.value,
      data_fim: el.dataFim.value
    };
  }

  async function getJSON(path, filtros = {}, options = {}) {
    const query = paramsToQuery(filtros);
    const url = `${API_BASE}${path}${query ? `?${query}` : ''}`;
    const response = await fetchComTimeout(url, {
      headers: buildHeaders(options.headers || {})
    });
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const message = data && data.error ? data.error : `Erro ${response.status} em ${path}`;
      throw new Error(message);
    }
    return data;
  }

  async function getText(path, filtros = {}, options = {}) {
    const query = paramsToQuery(filtros);
    const url = `${API_BASE}${path}${query ? `?${query}` : ''}`;
    const response = await fetchComTimeout(url, {
      headers: buildHeaders(options.headers || {})
    });
    if (!response.ok) {
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      let message = `Erro ${response.status} em ${path}`;
      if (contentType.includes('application/json')) {
        try {
          const payload = await response.json();
          if (payload && payload.error) message = payload.error;
        } catch (_) {
          /* no-op */
        }
      } else {
        const body = await response.text();
        if (body) message = body;
      }
      throw new Error(message);
    }
    return response.text();
  }

  function persistToken() {
    sessionStorage.setItem(STORAGE_KEY, getAdminToken());
  }

  function restoreToken() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      el.adminToken.value = stored;
    }
  }

  function registerChartPlugins() {
    if (chartPluginsRegistered) return;

    Chart.register({
      id: 'valueLabels',
      afterDatasetsDraw(chart, args, pluginOptions) {
        if (!pluginOptions || !pluginOptions.enabled || chart.config.type !== 'bar') return;
        const { ctx } = chart;
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);

        ctx.save();
        ctx.fillStyle = pluginOptions.color || '#ffffff';
        ctx.font = `700 ${pluginOptions.fontSize || 12}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        meta.data.forEach((bar, index) => {
          const value = Number(dataset.data[index] || 0);
          ctx.fillText(`${Math.round(value)}%`, bar.x, bar.y - 6);
        });

        ctx.restore();
      }
    });

    Chart.register({
      id: 'doughnutCenterText',
      afterDatasetsDraw(chart, args, pluginOptions) {
        if (!pluginOptions || !pluginOptions.enabled || chart.config.type !== 'doughnut') return;
        const { ctx, chartArea } = chart;
        const x = (chartArea.left + chartArea.right) / 2;
        const y = (chartArea.top + chartArea.bottom) / 2;
        const value = Number(pluginOptions.value || 0);

        ctx.save();
        ctx.fillStyle = pluginOptions.color || '#ffffff';
        ctx.font = `700 ${pluginOptions.fontSize || 28}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(value)}%`, x, y);
        ctx.restore();
      }
    });

    chartPluginsRegistered = true;
  }

  function preencherSelect(select, valores, placeholder) {
    const atual = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    valores.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    select.value = valores.includes(atual) ? atual : '';
  }

  async function carregarFiltros() {
    const filtros = filtrosAtuais();
    const result = await getJSON('/api/dashboard/filters', filtros);
    if (!result || !result.success) return;
    const data = result.data || {};
    preencherSelect(el.setor, data.setores || [], 'Todos');
    preencherSelect(el.produto, data.produtos || [], 'Todos');
    preencherSelect(el.cidade, data.cidades || [], 'Todas');
    preencherSelect(el.uf, data.ufs || [], data.hasUf ? 'Todas' : 'UF indisponivel');
    el.uf.disabled = !data.hasUf;
  }

  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function chartBaseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#dbe7ff' } },
        tooltip: {
          backgroundColor: '#0c1424',
          borderColor: '#2b3d63',
          borderWidth: 1,
          titleColor: '#e5efff',
          bodyColor: '#b8c9ea'
        }
      },
      scales: {
        x: { ticks: { color: '#b5c6ea' }, grid: { color: '#223355' } },
        y: { ticks: { color: '#b5c6ea' }, grid: { color: '#223355' }, min: 0, max: 100 }
      }
    };
  }

  function numeroSeguro(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function renderCharts(data) {
    registerChartPlugins();

    const topicos = data.topicos || {};
    const pcmDimensoesRaw = data.pcmDimensoes || data.cosmobIndicadores || {};
    const pcmDimensoes = {
      durabilidade: numeroSeguro(pcmDimensoesRaw.durabilidade),
      designReparavel: numeroSeguro(pcmDimensoesRaw.designReparavel),
      designReaproveitamento: numeroSeguro(pcmDimensoesRaw.designReaproveitamento),
      servicosCiclo: numeroSeguro(pcmDimensoesRaw.servicosCiclo),
      rastreabilidade: numeroSeguro(pcmDimensoesRaw.rastreabilidade),
      transparencia: numeroSeguro(pcmDimensoesRaw.transparencia)
    };

    destroyChart('topicos');
    charts.topicos = new Chart(document.getElementById('chartTopicos'), {
      type: 'bar',
      data: {
        labels: ['Entrada', 'Residuos', 'Saida', 'Vida', 'Monitoramento'],
        datasets: [{
          label: 'Percentual (%)',
          data: [topicos.entrada, topicos.residuos, topicos.output, topicos.vida, topicos.monitoramento],
          backgroundColor: ['#22c55e', '#06b6d4', '#6366f1', '#f59e0b', '#ef4444'],
          borderRadius: 8
        }]
      },
      options: {
        ...chartBaseOptions(),
        plugins: {
          ...chartBaseOptions().plugins,
          valueLabels: {
            enabled: true,
            color: '#ffffff',
            fontSize: 12
          }
        }
      }
    });

    destroyChart('igc');
    charts.igc = new Chart(document.getElementById('chartIGC'), {
      type: 'doughnut',
      data: {
        labels: ['IGC alcancado', 'Gap de melhoria'],
        datasets: [{
          data: [data.mediaIGC || 0, data.igcGap || 0],
          backgroundColor: ['#22c55e', '#334155'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { labels: { color: '#dbe7ff' } },
          doughnutCenterText: {
            enabled: true,
            value: data.mediaIGC || 0,
            color: '#ffffff',
            fontSize: 28
          }
        }
      }
    });

    destroyChart('pcm');
    charts.pcm = new Chart(document.getElementById('chartPCM'), {
      type: 'radar',
      data: {
        labels: [
          'Matéria-prima virgem',
          'Matéria-prima reciclada',
          'Matéria-prima de reaproveitamento',
          'Matéria-prima renovável',
          'Desmontagem no fim de vida',
          'Circularidade no fim de vida do produto'
        ],
        datasets: [{
          label: 'Dimensoes do PCM (%)',
          data: [
            pcmDimensoes.durabilidade,
            pcmDimensoes.designReparavel,
            pcmDimensoes.designReaproveitamento,
            pcmDimensoes.servicosCiclo,
            pcmDimensoes.rastreabilidade,
            pcmDimensoes.transparencia
          ],
          backgroundColor: 'rgba(16, 185, 129, 0.22)',
          borderColor: '#10b981',
          pointBackgroundColor: '#6ee7b7',
          pointBorderColor: '#d1fae5',
          pointHoverBackgroundColor: '#d1fae5',
          pointHoverBorderColor: '#10b981'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            angleLines: { color: '#2b3d63' },
            grid: { color: '#2b3d63' },
            pointLabels: { color: '#c6d6f5', font: { size: 11 } },
            ticks: { color: '#9fb0d4', backdropColor: 'transparent' }
          }
        },
        plugins: {
          legend: { labels: { color: '#dbe7ff' } },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.label}: ${Math.round(Number(context.raw || 0))}%`;
              }
            }
          }
        }
      }
    });

    destroyChart('produto');
    charts.produto = new Chart(document.getElementById('chartCircularidadeProduto'), {
      type: 'radar',
      data: {
        labels: ['Entrada', 'Gestao de residuos', 'Saida do produto', 'Vida do produto', 'Monitoramento'],
        datasets: [{
          label: 'Indice de Circularidade do Produto (%)',
          data: [topicos.entrada, topicos.residuos, topicos.output, topicos.vida, topicos.monitoramento],
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          borderColor: '#22c55e',
          pointBackgroundColor: '#86efac'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            angleLines: { color: '#2b3d63' },
            grid: { color: '#2b3d63' },
            pointLabels: { color: '#c6d6f5', font: { size: 11 } },
            ticks: { color: '#9fb0d4', backdropColor: 'transparent' }
          }
        },
        plugins: { legend: { labels: { color: '#dbe7ff' } } }
      }
    });
  }

  function recomendacoesPorTopico(topicos) {
    const matriz = {
      entrada: {
        icon: 'Entrada',
        titulo: 'INPUT',
        perguntas: 'Q1',
        itens: [
          'Explore fornecedores de materias-primas recicladas.',
          'Implemente aproveitamento de residuos de outras empresas.',
          'Priorize materiais de fontes renovaveis.'
        ]
      },
      residuos: {
        icon: 'Residuos',
        titulo: 'GESTAO DE RESIDUOS',
        perguntas: 'Q2',
        itens: [
          'Desenvolva parcerias para reciclagem de residuos.',
          'Implemente sistema de recuperacao de energia.',
          'Reduza destinacao para aterros sanitarios.'
        ]
      },
      output: {
        icon: 'Saida',
        titulo: 'SAIDA DO PRODUTO',
        perguntas: 'Q3, Q4, Q5',
        itens: [
          'Desenhe produtos para facilitar desmontagem.',
          'Utilize materiais mais reciclaveis.',
          'Crie sistema de logistica reversa.'
        ]
      },
      vida: {
        icon: 'Vida',
        titulo: 'VIDA DO PRODUTO',
        perguntas: 'Q6, Q7, Q8, Q9',
        itens: [
          'Invista em testes de durabilidade.',
          'Aprimore design para reparabilidade.',
          'Crie produtos modulares e reaproveitaveis.'
        ]
      },
      monitoramento: {
        icon: 'Monitoramento',
        titulo: 'MONITORAMENTO',
        perguntas: 'Q10, Q11, Q12',
        itens: [
          'Implemente servicos pos-venda.',
          'Use rastreamento (QR Code, chips).',
          'Amplie documentacao e transparencia.'
        ]
      }
    };

    const ordemFixa = ['entrada', 'residuos', 'output', 'vida', 'monitoramento'];

    el.recomendacoes.innerHTML = ordemFixa
      .map((k) => {
        const rec = matriz[k];
        const score = Number(topicos[k] || 0);
        return `
          <article class="rec-card">
            <h4>${rec.icon} - ${rec.titulo}</h4>
            <p><strong>Perguntas:</strong> ${rec.perguntas}</p>
            <p><strong>Pontuacao do topico:</strong> ${score}%</p>
            <ul>
              ${rec.itens.map((item) => `<li>${item}</li>`).join('')}
            </ul>
          </article>
        `;
      })
      .join('');
  }

  async function atualizarDashboard() {
    try {
      const filtros = filtrosAtuais();
      const result = await getJSON('/api/dashboard/overview', filtros);
      if (!result || !result.success) return;
      const data = result.data || {};

      el.kpiTotal.textContent = Number(data.totalFormularios || 0).toLocaleString('pt-BR');
      el.kpiPontos.textContent = Number(data.mediaTotalPontos || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
      el.kpiIGC.textContent = `${Number(data.mediaIGC || 0).toFixed(1)}%`;
      el.kpiPCM.textContent = `${Number(data.mediaPCM || 0).toFixed(1)}%`;

      renderCharts(data);
      recomendacoesPorTopico(data.topicos || {});
      mostrarStatus('', '');
    } catch (error) {
      console.error('Erro ao atualizar dashboard:', error);
      mostrarStatus(error.message || 'Falha ao atualizar dashboard.', 'erro');
    }
  }

  async function atualizarTudo() {
    mostrarStatus('Atualizando...', 'info');
    await atualizarDashboard();

    const resultados = await Promise.allSettled([carregarFiltros()]);

    resultados.forEach((resultado) => {
      if (resultado.status === 'rejected') {
        console.warn('Falha ao atualizar parte do painel:', resultado.reason);
      }
    });
  }

  function configurarEventos() {
    el.btnAtualizar.addEventListener('click', async () => {
      await atualizarTudo();
    });

    [el.setor, el.produto, el.cidade, el.uf, el.dataInicio, el.dataFim].forEach((input) => {
      input.addEventListener('change', async () => {
        await atualizarDashboard();
        await Promise.allSettled([carregarFiltros()]);
      });
    });

    el.adminToken.addEventListener('input', () => {
      persistToken();
    });

    el.autoRefresh.addEventListener('change', () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }

      if (el.autoRefresh.checked) {
        refreshTimer = setInterval(async () => {
          await atualizarDashboard();
        }, 60000);
      }
    });
  }

  async function init() {
    restoreToken();
    configurarEventos();
    await atualizarTudo();
  }

  init();
})();
