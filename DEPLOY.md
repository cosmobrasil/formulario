# Questionário de Circularidade 2026 - Deploy Guide

## 🚀 Arquitetura de Deploy

### Frontend (Netlify)
- **Plataforma**: Netlify (Static Site)
- **URL**: `https://questionario-circularidade-2026.netlify.app`
- **Arquivos**: index.html, config.js, app.v2.js, style-2026.css, logo.png

### Backend (Railway/Render/Heroku)
- **Plataforma**: Railway (recomendado) ou Render/Heroku
- **URL**: `https://cosmobrasil-questionario-backend.railway.app`
- **Tecnologias**: Node.js + Express + PostgreSQL
- **Arquivos**: backend/server.js, backend/google-drive-service.js

---

## 📋 Passo a Passo - Deploy Completo

### 1️⃣ Preparar o Repositório GitHub

```bash
# No diretório raiz do projeto
git init
git add .
git commit -m "Initial commit: Questionário de Circularidade 2026"
```

### 2️⃣ Criar Repositório no GitHub

1. Acesse: https://github.com/new
2. Nome: `questionario-circularidade-2026`
3. Marque "Private" (recomendado para proteger credenciais)
4. **NÃO** inicialize com README
5. Clique em "Create repository"

### 3️⃣ Conectar Local ao GitHub

```bash
# Adicione suas credenciais do GitHub no Railway primeiro!
# Depois, no terminal:

git remote add origin https://github.com/SEU_USUARIO/questionario-circularidade-2026.git
git branch -M main
git push -u origin main
```

### 4️⃣ Deploy do Backend no Railway

1. **Acesse**: https://railway.app/new
2. **Clique em**: "Deploy from GitHub repo"
3. **Selecione**: `questionario-circularidade-2026`
4. **Configure**:
   - Root: `backend`
   - Start Command: `npm start`
5. **Variáveis de Ambiente** (necessário configurar antes):
   - Copie `client_secret_*.json` para o Railway
   - Ou configure como variáveis de ambiente:
     ```
     DB_HOST=centerbeam.proxy.rlwy.net
     DB_PORT=16594
     DB_NAME=railway
     DB_USER=postgres
     DB_PASSWORD=sua_senha_aqui
     ```
6. **Deploy**: Clique em "Deploy Now"
7. **Copie a URL** do seu backend Railway

### 5️⃣ Atualizar netlify.toml

Antes de fazer deploy no Netlify, **edite o arquivo `netlify.toml`** na linha 5:

```toml
[[redirects]]
  from = "/api/*"
  to = "SUA_URL_RAILWAY_AQUI/api/:splat"
  status = 200
  force = true
```

Exemplo:
```toml
to = "https://cosmobrasil-questionario-backend.railway.app/api/:splat"
```

**Commit e push**:
```bash
git add netlify.toml
git commit -m "Update Railway backend URL"
git push
```

### 6️⃣ Deploy do Frontend no Netlify

#### Opção A: Através do Site Netlify (Recomendado)

1. **Acesse**: https://app.netlify.com/start
2. **Clique em**: "Deploy with GitHub"
3. **Autorize** o Netlify a acessar seu GitHub
4. **Selecione** o repositório: `questionario-circularidade-2026`
5. **Configure**:
   - Branch: `main`
   - Build command: (deixe vazio ou `echo 'No build needed'`)
   - Publish directory: `/`
   - Clique em "Deploy site"
6. **Aguarde** o deploy terminar
7. **URL gerada**: `https://questionario-circularidade-2026.netlify.app`

#### Opção B: Através da CLI Netlify

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

---

## 🔧 Configurações Importantes

### Variáveis de Ambiente (Railway)

No painel do Railway, configure estas variáveis:

```
DB_HOST=centerbeam.proxy.rlwy.net
DB_PORT=16594
DB_NAME=railway
DB_USER=postgres
DB_PASSWORD=sua_senha_aqui
```

### Google Credentials

**Não comite** arquivos com credenciais!
- `client_secret_*.json` está no `.gitignore`
- Para Railway: faça upload manual ou configure como variável de ambiente

### Redirect Netlify

O `netlify.toml` configura redirecionamento de `/api/*` para o backend Railway.

---

## ✅ Verificação Pós-Deploy

### 1. Testar Backend

```bash
curl https://SEU_BACKEND_RAILWAY/api/health
```

Deve retornar:
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

### 2. Testar Frontend

Acesse: `https://SEU_SITE_NETLIFY.app`

Deve carregar a página do questionário.

### 3. Testar Questionário Completo

1. Aceite os termos
2. Preencha os dados da empresa
3. Responda às perguntas
4. Finalize
5. Verifique:
   - Console do navegador (F12) para erros
   - Banco de dados Railway
   - Google Drive da conta ti@cosmobrasil.app

---

## 🔗 URLs de Produção

Após o deploy completo:

- **Frontend**: `https://questionario-circularidade-2026.netlify.app`
- **Backend**: `https://cosmobrasil-questionario-backend.railway.app`
- **Database**: PostgreSQL Railway
- **Google Drive**: Pasta "Relatorios_Circularidade_2026"

---

## 📝 Comandos Úteis

```bash
# Ver status do Git
git status

# Fazer commit de alterações
git add .
git commit -m "Descrição das alterações"
git push

# Ver logs do Railway
# Acesse o painel Railway > View Logs

# Ver logs do Netlify
# Acesse o painel Netlify > Deploys > View logs
```

---

## 🐛 Troubleshooting

### Erro: "API request failed"

- Verifique se o backend Railway está rodando
- Confira se a URL no `netlify.toml` está correta

### Erro: "CORS"

- Confira se o CORS está habilitado no backend (server.js)

### Erro: "redirect_uri_mismatch"

- Configure o redirect URI no Google Cloud Console
- Adicione a URL do Netlify como redirect URI autorizado

---

## 📚 Recursos

- [Netlify Docs](https://docs.netlify.com/)
- [Railway Docs](https://docs.railway.app/)
- [GitHub Pages](https://pages.github.com/)
