# Dashboard de Distrito Circular

Dashboard dark-mode para consolidar os formulários do Questionário de Circularidade em tempo quase real.

## Funcionalidades
- Filtros por setor, produto, cidade, UF e período.
- KPIs: total de formulários, média de pontos, média IGC, média IME.
- Gráficos:
  - barras por tópicos;
  - rosca IGC (alcançado vs gap);
  - radar IME;
  - radar Índice de Circularidade do Produto.
- Painel de recomendações estratégicas por tópicos de menor desempenho.

## Backend esperado
Usa endpoints do backend principal:
- `GET /api/dashboard/filters`
- `GET /api/dashboard/overview`

Por padrão, o frontend aponta para:
- local: `http://localhost:3000`
- produção: `https://formulario-production-8df7.up.railway.app`

## Deploy no Netlify
Publicar esta pasta como site estático:
- `dashboard-circularidade/`

## Observação sobre UF
Para filtros por estado, aplicar migration:
- `backend/database/migrations/2026-03-04_add_uf_empresas.sql`

## Configuração para Netlify
Este projeto já inclui `netlify.toml` com:
- publish da raiz (`.`)
- proxy `/api/*` para o backend Railway
- fallback SPA para `/index.html`

### Passos rápidos
1. Criar novo site no Netlify apontando para o repositório `cosmobrasil/dash-circular`.
2. Build command: **(vazio)**
3. Publish directory: `.`
4. Deploy.

Com o proxy ativo, o frontend usa `/api/...` no domínio do próprio Netlify e evita bloqueios de CORS no navegador.
