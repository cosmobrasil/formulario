# Especificação Técnica do Dashboard Gerencial

Este documento descreve detalhadamente a arquitetura, o design, a lógica do frontend e a integração com o backend do **Dashboard Gerencial**. Ele serve como um guia completo para a reprodução exata desta solução em qualquer outra pasta ou contexto.

---

## 1. Arquitetura Geral

O aplicativo é uma **SPA (Single Page Application)** estática e minimalista baseada em tecnologias web nativas:
* **Estrutura**: HTML5 semântico.
* **Estilização**: CSS Vanilla (sem frameworks ou pré-processadores).
* **Lógica**: JavaScript Vanilla (ES6+) sem dependências externas.
* **Autenticação**: Controle de acesso básico no cliente (Gate com senha), validado pelo backend por token.

---

## 2. Design e Estilização (CSS)

O aplicativo utiliza um tema escuro moderno (*glassmorphism* implícito, bordas finas e contrastes limpos).

### Sistema de Cores (CSS Variables)
```css
:root {
  --bg: #0b1220;
  --card: #131d31;
  --line: #24314f;
  --text: #e6efff;
  --muted: #9fb0cf;
  --accent: #1d9bf0;
  --ok: #22c55e;
}
```

### Elementos Visuais Chave
* **Fundo da Página**: Gradiente radial suave para dar profundidade:
  ```css
  background: radial-gradient(circle at 20% 10%, #182846 0%, #0b1220 50%);
  ```
* **Tipografia**: Família de fontes sem serifa (`Arial, Helvetica, sans-serif`) com tamanho base legível e pesos adequados.
* **Layout**:
  * Centralizado usando uma classe `.wrap` com largura máxima de `1180px` e margem automática.
  * Uso frequente de `display: flex` e `display: grid` para posicionamento e responsividade dos botões e barras de ferramentas.
* **Tabela de Dados**: Layout de tabela padrão adaptada para rolagem lateral em telas pequenas (`max-width: 900px`).

---

## 3. Lógica do Frontend (JavaScript)

Toda a lógica está encapsulada dentro de um **IIFE (Immediately Invoked Function Expression)** para evitar poluição do escopo global.

### A. Resolução Dinâmica da URL da API
O script detecta automaticamente em qual ambiente está rodando:
```javascript
const isLocal = location.hostname.includes('localhost') || location.hostname === '127.0.0.1';
const isNetlify = location.hostname.endsWith('netlify.app');
const API_BASE = isLocal ? 'http://localhost:3000' : (isNetlify ? '' : 'https://formulario-production-8df7.up.railway.app');
```

### B. Controle de Acesso (Gate)
1. **Padrão Inicial**: O wrapper principal (`.wrap`) inicia oculto (com a classe `.locked` tendo `display: none`). A tela de login/senha (`#gate`) é exibida por padrão.
2. **Senha Administrativa**: A senha de acesso (`Cosmob2026@`) está hardcoded no script do cliente como `ADMIN_PASSWORD`.
3. **Transição de Tela**:
   * O formulário intercepta o evento de `submit`.
   * Se a senha informada corresponder a `ADMIN_PASSWORD`, executa-se a função `setLocked(false)` que oculta o `#gate`, remove a classe `.locked` do `.wrap` e inicia o carregamento dos dados.
   * Se incorreta, exibe erro e mantém o bloqueio.

### C. Carregamento dos Dados
1. **Requisição HTTP**: Realiza um `fetch` para `${API_BASE}/api/admin/respostas?token=${ADMIN_PASSWORD}`.
2. **Processamento da Resposta**:
   * O backend retorna um JSON contendo `{ success: true, data: [...] }`.
   * A lista retornada é percorrida gerando dinamicamente linhas (`<tr>`) no DOM.
3. **Formatação e Exibição de Dados**:
   * **Data e Hora**: Convertida para exibição no fuso horário do Brasil (`America/Sao_Paulo`) no formato `DD/MM/AAAA HH:MM`.
   * **Índices (IGC / PCM)**: Valores numéricos formatados para uma casa decimal com sufixo percentual (ex: `75.4% / 60.0%`).
   * **Visualização Condicional do Relatório**:
     * A coluna `temHtml` (booleano) define se o relatório original em formato HTML está disponível no banco de dados.
     * Se `temHtml` for verdadeiro, renderiza botões apontando para o endpoint `/html`. Se falso, aponta para `/pdf`.

---

## 4. Contrato de Integração com o Backend (API)

Para reproduzir este dashboard com sucesso, o backend de destino precisa expor três endpoints específicos:

### A. Listagem de Respostas
* **Rota**: `GET /api/admin/respostas`
* **Query Params / Headers**: `token` (senha de acesso administrado) ou header `x-admin-token`.
* **Retorno Esperado (JSON)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "nomeResponsavel": "João Silva",
        "nomeEmpresa": "Empresa X",
        "cidade": "Macapá",
        "uf": "AP",
        "produto": "Boné",
        "dataHora": "15/06/2026 14:30",
        "igc": 75.5,
        "pcm": 80.0,
        "temHtml": true
      }
    ]
  }
  ```

### B. Relatório em PDF
* **Rota**: `GET /api/admin/respostas/:id/pdf`
* **Query Params**: `token` (validação) e `download=1` (opcional, força download).
* **Comportamento**: Retorna um stream de PDF (`application/pdf`) gerado dinamicamente com os resultados do formulário correspondente ao ID informado.

### C. Relatório em HTML
* **Rota**: `GET /api/admin/respostas/:id/html`
* **Query Params**: `token` (validação) e `download=1` (opcional, força download).
* **Comportamento**: Retorna a página web estática gerada pelo questionário original contida no banco de dados (`text/html; charset=UTF-8`).

---

## 5. Estrutura do Banco de Dados Relacional (PostgreSQL)

O app assume a existência de duas tabelas relacionadas:

### Tabela `empresas`
* `id` (Chave Primária)
* `nome_empresa`
* `nome_responsavel`
* `cidade`
* `uf`
* `produto_avaliado`

### Tabela `questionarios`
* `id` (Chave Primária)
* `empresa_id` (Chave Estrangeira apontando para `empresas.id`)
* `indice_global_circularidade` (valor numérico do IGC)
* `indice_pcm` (valor numérico do PCM)
* `relatorio_html` (Coluna do tipo `TEXT`, contendo o HTML completo do relatório individual compilado na submissão)
* `created_at` (timestamp de criação)

---

## 6. Ajuste/Correção para a Reprodução (Importante!)

O código atual declara explicitamente a chave de sessão no início do arquivo:
```javascript
const ACCESS_TOKEN_KEY = 'dashboardGerencialAccessToken';
```

Esse valor é usado para persistir o acesso durante a sessão do navegador e também para limpar o estado quando a API responde com erro de autenticação.
