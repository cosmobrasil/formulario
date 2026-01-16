# Backend API - Questionário de Circularidade 2026

Backend em Node.js + Express para conectar o frontend ao PostgreSQL Railway.

## 🚀 Instalação

```bash
cd backend
npm install
```

## 🔧 Configuração

As credenciais do PostgreSQL Railway já estão configuradas no arquivo `server.js`.

## ▶️ Executar

```bash
# Modo desenvolvimento (com auto-reload)
npm run dev

# Modo produção
npm start
```

O servidor irá rodar em `http://localhost:3000`

## 📡 Endpoints

### Health Check
```
GET /api/health
```
Retorna status da conexão com o banco de dados.

### Salvar Questionário
```
POST /api/questionario
Content-Type: application/json

{
  "empresa": {
    "nomeEmpresa": "Exemplo Ltda",
    "cnpj": "12345678000190",
    "nomeResponsavel": "João Silva",
    "email": "joao@exemplo.com",
    "cidade": "São Paulo",
    "celular": "11999999999",
    "setorEconomico": "Indústria",
    "produtoAvaliado": "Chapéu"
  },
  "respostas": {
    "materia_prima": 2,
    "residuos": 2,
    "desmonte": 1,
    ...
  },
  "pontuacao": {
    "pontos": 18,
    "percentual": 75,
    "maturidade": 72
  }
}
```

### Listar Questionários
```
GET /api/questionarios
```
Retorna lista de questionários para o dashboard.

## 🔒 Segurança

⚠️ **IMPORTANTE**: As credenciais do PostgreSQL estão hardcoded no `server.js`. Para produção, mova-as para variáveis de ambiente:

```bash
# .env
DB_HOST=centerbeam.proxy.rlwy.net
DB_PORT=16594
DB_NAME=railway
DB_USER=postgres
DB_PASSWORD=sua_senha_aqui
```

E modifique o `server.js` para usar `process.env`.

## 📧 Email

O envio de email está temporariamente desabilitado (apenas log no console). Para implementar, use:
- Nodemailer com SMTP
- SendGrid API
- Resend API
- Ou outro serviço de email

## 🧪 Testar

Após iniciar o servidor:
```bash
curl http://localhost:3000/api/health
```

Deve retornar:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-01-16T10:30:00.000Z"
}
```
