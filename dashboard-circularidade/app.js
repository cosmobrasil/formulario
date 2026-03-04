(function () {
  const API_BASE = window.location.hostname.includes('localhost')
    ? 'http://localhost:3000'
    : 'https://formulario-production-8df7.up.railway.app';

  const el = {
    setor: document.getElementById('filtroSetor'),
    produto: document.getElementById('filtroProduto'),
    cidade: document.getElementById('filtroCidade'),
    uf: document.getElementById('filtroUf'),
    dataInicio: document.getElementById('filtroDataInicio'),
    dataFim: document.getElementById('filtroDataFim'),
    btnAtualizar: document.getElementById('btnAtualizar'),
    autoRefresh: document.getElementById('autoRefresh'),
    kpiTotal: document.getElementById('kpiTotal'),
    kpiPontos: document.getElementById('kpiPontos'),
    kpiIGC: document.getElementById('kpiIGC'),
    kpiIME: document.getElementById('kpiIME'),
    recomendacoes: document.getElementById('recomendacoes')
  };

  const charts = {};
  let refreshTimer = null;

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

  async function getJSON(path, filtros = {}) {
    const query = paramsToQuery(filtros);
    const url = `${API_BASE}${path}${query ? `?${query}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro ${response.status} em ${path}`);
    return response.json();
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
    if (!result.success) return;
    const data = result.data;
    preencherSelect(el.setor, data.setores || [], 'Todos');
    preencherSelect(el.produto, data.produtos || [], 'Todos');
    preencherSelect(el.cidade, data.cidades || [], 'Todas');
    preencherSelect(el.uf, data.ufs || [], data.hasUf ? 'Todas' : 'UF indisponível');
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

  function renderCharts(data) {
    const topicos = data.topicos || {};
    const ime = data.imeDimensoes || {};

    destroyChart('topicos');
    charts.topicos = new Chart(document.getElementById('chartTopicos'), {
      type: 'bar',
      data: {
        labels: ['Entrada', 'Resíduos', 'Saída', 'Vida', 'Monitoramento'],
        datasets: [{
          label: 'Percentual (%)',
          data: [topicos.entrada, topicos.residuos, topicos.output, topicos.vida, topicos.monitoramento],
          backgroundColor: ['#22c55e', '#06b6d4', '#6366f1', '#f59e0b', '#ef4444'],
          borderRadius: 6
        }]
      },
      options: chartBaseOptions()
    });

    destroyChart('igc');
    charts.igc = new Chart(document.getElementById('chartIGC'), {
      type: 'doughnut',
      data: {
        labels: ['IGC alcançado', 'Gap de melhoria'],
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
        plugins: { legend: { labels: { color: '#dbe7ff' } } }
      }
    });

    destroyChart('ime');
    charts.ime = new Chart(document.getElementById('chartIME'), {
      type: 'radar',
      data: {
        labels: [
          'Ensaios de durabilidade',
          'Design reparável',
          'Design para reaproveitamento',
          'Serviços de extensão do ciclo',
          'Rastreabilidade',
          'Transparência das informações'
        ],
        datasets: [{
          label: 'IME (%)',
          data: [
            ime.durabilidade,
            ime.designReparavel,
            ime.designReaproveitamento,
            ime.servicosCiclo,
            ime.rastreabilidade,
            ime.transparencia
          ],
          backgroundColor: 'rgba(59, 130, 246, 0.25)',
          borderColor: '#3b82f6',
          pointBackgroundColor: '#93c5fd'
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

    destroyChart('produto');
    charts.produto = new Chart(document.getElementById('chartCircularidadeProduto'), {
      type: 'radar',
      data: {
        labels: ['Entrada', 'Gestão de resíduos', 'Saída do produto', 'Vida do produto', 'Monitoramento'],
        datasets: [{
          label: 'Índice de Circularidade do Produto (%)',
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
        icon: '📥',
        titulo: 'ENTRADA (INPUT)',
        itens: [
          'Explore fornecedores de matérias-primas recicladas.',
          'Implemente aproveitamento de resíduos de outras empresas.',
          'Priorize materiais de fontes renováveis.'
        ]
      },
      residuos: {
        icon: '♻️',
        titulo: 'GESTÃO DE RESÍDUOS',
        itens: [
          'Desenvolva parcerias para reciclagem de resíduos.',
          'Implemente sistema de recuperação de energia.',
          'Reduza destinação para aterros sanitários.'
        ]
      },
      output: {
        icon: '📦',
        titulo: 'SAÍDA DO PRODUTO (OUTPUT)',
        itens: [
          'Desenhe produtos para facilitar desmontagem.',
          'Utilize materiais mais recicláveis.',
          'Crie sistema de logística reversa.'
        ]
      },
      vida: {
        icon: '🔧',
        titulo: 'VIDA DO PRODUTO',
        itens: [
          'Invista em testes de durabilidade.',
          'Aprimore design para reparabilidade.',
          'Crie produtos modulares e reaproveitáveis.'
        ]
      },
      monitoramento: {
        icon: '📊',
        titulo: 'MONITORAMENTO',
        itens: [
          'Implemente serviços pós-venda.',
          'Use rastreamento (QR Code, chips).',
          'Amplie documentação e transparência.'
        ]
      }
    };

    const ordem = Object.keys(topicos || {}).sort((a, b) => (topicos[a] || 0) - (topicos[b] || 0));
    const foco = ordem.slice(0, 3);

    el.recomendacoes.innerHTML = foco
      .map((k) => {
        const rec = matriz[k];
        return `
          <article class="rec-card">
            <h4>${rec.icon} ${rec.titulo}</h4>
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
      if (!result.success) return;
      const data = result.data;

      el.kpiTotal.textContent = Number(data.totalFormularios || 0).toLocaleString('pt-BR');
      el.kpiPontos.textContent = Number(data.mediaTotalPontos || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
      el.kpiIGC.textContent = `${Number(data.mediaIGC || 0).toFixed(1)}%`;
      el.kpiIME.textContent = `${Number(data.mediaIME || 0).toFixed(1)}%`;

      renderCharts(data);
      recomendacoesPorTopico(data.topicos || {});
    } catch (error) {
      console.error('Erro ao atualizar dashboard:', error);
      alert('Falha ao atualizar dashboard. Verifique backend e filtros.');
    }
  }

  function configurarEventos() {
    el.btnAtualizar.addEventListener('click', async () => {
      await carregarFiltros();
      await atualizarDashboard();
    });

    [el.setor, el.produto, el.cidade, el.uf, el.dataInicio, el.dataFim].forEach((input) => {
      input.addEventListener('change', async () => {
        await carregarFiltros();
        await atualizarDashboard();
      });
    });

    el.autoRefresh.addEventListener('change', () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (el.autoRefresh.checked) {
        refreshTimer = setInterval(async () => {
          await carregarFiltros();
          await atualizarDashboard();
        }, 60000);
      }
    });
  }

  async function init() {
    configurarEventos();
    await carregarFiltros();
    await atualizarDashboard();
  }

  init();
})();
