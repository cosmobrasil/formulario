# Dashboard Gerencial

Aplicação administrativa para listar formulários respondidos e abrir ou baixar o HTML original de cada resposta, com fallback para PDF quando o HTML não estiver disponível.

## Acesso

O dashboard abre bloqueado por uma senha. O usuário precisa informar a senha de acesso para carregar a lista e acessar os relatórios. O acesso fica preservado na sessão do navegador enquanto a aba estiver aberta.

## Endpoints usados

- `GET /api/admin/respostas`
- `GET /api/admin/respostas/:id/html`
- `GET /api/admin/respostas/:id/pdf`

## Estrutura

- `index.html`: frontend estatico do dashboard gerencial
