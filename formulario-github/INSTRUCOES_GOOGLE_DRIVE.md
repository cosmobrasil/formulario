# Instruções para Configurar Google Cloud Console

## Problema: redirect_uri_mismatch

O redirect URI configurado no Google Cloud Console não corresponde ao usado no código.

## Passos para corrigir:

### 1. Acesse o Google Cloud Console
```
https://console.cloud.google.com/apis/credentials
```

### 2. Selecione o projeto
- Projeto: `composed-yen-484512-j4`
- OU procure pelo Client ID: `1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com`

### 3. Edite o OAuth 2.0 Client ID
- Clique no ícone de edição (lápis) no OAuth 2.0 Client ID
- Na seção "Authorized redirect URIs", adicione:

```
http://localhost:3000/auth/google/callback
```

### 4. Salve as alterações
- Clique em "Save"
- Aguarde alguns segundos para as alterações propagarem

### 5. Teste novamente
Após configurar, espere 1-2 minutos e teste a autenticação novamente.

---

## URLs de Autenticação

### Desenvolvimento (Localhost):
```
http://localhost:3000/api/drive/auth-url
```

### URL direta de OAuth:
```
https://accounts.google.com/o/oauth2/v2/auth?client_id=1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fgoogle%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file&access_type=offline&prompt=consent&login_hint=ti@cosmobrasil.app
```

---

## Informações do App

- **Client ID**: `1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com`
- **Redirect URI**: `http://localhost:3000/auth/google/callback`
- **Scopes**: `https://www.googleapis.com/auth/drive.file`
- **Conta**: `ti@cosmobrasil.app`
