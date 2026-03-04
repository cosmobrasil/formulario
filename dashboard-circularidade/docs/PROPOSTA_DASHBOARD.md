# Proposta Técnica - Dashboard de Circularidade

## Objetivo
Construir um dashboard consolidado, em tempo quase real, com visão de circularidade por setor, produto, cidade e UF, alimentado diretamente pelos formulários enviados ao banco PostgreSQL.

## Situação atual (base existente)
- O formulário já grava respostas e índices no PostgreSQL imediatamente após envio.
- Tabelas principais: `empresas` e `questionarios`.
- Métricas já persistidas por formulário:
  - `soma`
  - `indice_global_circularidade`
  - `indice_maturidade_estruturante`
- Já existe `vw_dados_dashboard`, mas ainda sem agregações/filtros avançados para o painel proposto.

## Ajustes necessários antes do dashboard
1. **Adicionar UF na empresa**
- Hoje existe `cidade`, mas não há coluna `uf` na tabela `empresas`.
- Para filtrar por estado, precisamos de `empresas.uf` com índice.

2. **Definir regra de agrupamento oficial das perguntas**
- Sua proposta usa:
  - OUTPUT: Q3, Q4, Q5
  - VIDA: Q6, Q7, Q8, Q9
- A metodologia atual no app usa:
  - OUTPUT: Q3, Q4, Q5, Q6
  - VIDA: Q7, Q8, Q9
- Precisamos escolher uma convenção única para que o dashboard e o relatório final não diverjam.

3. **Decidir unidade de análise**
- Opção A: cada formulário conta como 1 observação.
- Opção B: por empresa, considerar apenas a resposta mais recente.
- Recomendação: suportar as duas visões com um toggle no dashboard.

## Itens já previstos e aderência
Sua proposta está muito boa e cobre os principais blocos:
- Filtros: setor, produto, cidade, UF.
- KPIs: total formulários, média de pontos, média IGC, média IME.
- Gráficos:
  - barras por tópicos
  - rosca IGC (atingido vs gap)
  - aranha IME
  - aranha Índice de Circularidade por 5 tópicos
- Painel de recomendações estratégicas por tópico.

## Melhorias recomendadas para robustez
1. **Filtro de período**
- Últimos 30 dias, trimestre, ano, personalizado.
- Sem isso, médias podem ficar distorcidas por dados antigos.

2. **Comparativos temporais**
- Exibir variação vs período anterior para IGC, IME e total de formulários.

3. **Qualidade da amostra**
- Exibir `n` por recorte (ex.: cidade/produto com poucos formulários).
- Alertar quando a amostra for pequena.

4. **Distribuição além da média**
- Mediana e quartis de IGC/IME para evitar leitura enviesada por outliers.

5. **Top/Bottom insights**
- Top 5 cidades/setores com maior IGC.
- Top 5 com maior gap de melhoria.

6. **Exportação**
- CSV e PDF executivo do recorte aplicado.

## Arquitetura sugerida
1. **Backend (API analytics dedicada)**
- Novos endpoints agregados, por exemplo:
  - `GET /api/dashboard/filters`
  - `GET /api/dashboard/kpis`
  - `GET /api/dashboard/topicos`
  - `GET /api/dashboard/igc-ime`
  - `GET /api/dashboard/recomendacoes`
- Todos aceitando query params: `setor`, `produto`, `cidade`, `uf`, `data_inicio`, `data_fim`.

2. **Banco**
- View/materialized view para acelerar agregações.
- Índices em `empresas(setor_economico, produto_avaliado, cidade, uf)` e `questionarios(created_at)`.

3. **Frontend dashboard**
- SPA simples (HTML/JS) ou React/Vite.
- Gráficos recomendados: ECharts ou Chart.js.

## Atualização imediata dos dados
- Já atendido pela persistência atual: formulário enviado já entra no banco.
- Dashboard deve consultar a API a cada carregamento e opcionalmente em auto-refresh (ex.: 60s).

## Entrega em fases
1. Fase 1: filtros + KPIs + barras por tópico + rosca IGC.
2. Fase 2: aranhas IME e Circularidade do Produto + recomendações estratégicas.
3. Fase 3: comparativos temporais, exportações e otimizações de performance.

## Pasta do novo projeto
- Criada em: `dashboard-circularidade/`
- Documento base: `dashboard-circularidade/docs/PROPOSTA_DASHBOARD.md`
