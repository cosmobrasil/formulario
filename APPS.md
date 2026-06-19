# Aplicativos da pasta

Esta pasta contem 4 aplicativos distintos:

1. `formulario-github/`
Formulário principal (Questionário de Circularidade 2.0). Contem o formulário, lógica (app-postgres.js), configuração (config.js) e estilos. Backend e dashboards não estão mais duplicados aqui — usam as versões da raiz.

2. `index.html`
Painel de relatórios com acesso aos registros respondidos.

3. `dashboard-circularidade/`
Dashboard analítico com consolidação e análise dos resultados.

4. `dashboard-gerencial/`
Dashboard administrativo com lista de formulários respondidos e acesso ao HTML e ao PDF de cada relatório.

## Backend

`backend/` — API Express + PostgreSQL Railway, atendendo todos os apps acima.
