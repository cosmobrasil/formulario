# Solução: Configuração do Google Drive no Railway

## Problema Identificado
As variáveis de ambiente do Google não estão configuradas no Railway, impedindo a autenticação com o Google Drive.

## Solução Passo a Passo

### 1. Configurar Variáveis de Ambiente no Railway

Acesse o painel do Railway e configure as seguintes variáveis de ambiente:

#### Variáveis Obrigatórias:
```
GOOGLE_CLIENT_ID=1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
GOOGLE_REDIRECT_URI=https://formulario-production-8df7.up.railway.app/auth/google/callback
```

#### Como configurar no Railway:
1. Vá para o painel do Railway
2. Selecione seu projeto
3. Clique em "Variables" (Variáveis)
4. Adicione cada variável acima com seus respectivos valores
5. Deploy o projeto novamente

### 2. Verificar Configuração no Google Cloud Console

Certifique-se de que o redirect URI está configurado corretamente no Google Cloud Console:

#### Redirect URI que deve estar configurado:
```
https://formulario-production-8df7.up.railway.app/auth/google/callback
```

#### Passos no Google Cloud Console:
1. Acesse: https://console.cloud.google.com/apis/credentials
2. Encontre o OAuth 2.0 Client ID: `<YOUR_CLIENT_ID>`
3. Clique no lápis para editar
4. Na seção "Authorized redirect URIs", adicione:
   ```
   https://formulario-production-8df7.up.railway.app/auth/google/callback
   ```
5. Clique em "Save"

### 3. Testar a Conexão

Após configurar as variáveis de ambiente:

#### Verificar configuração:
```bash
curl https://formulario-production-8df7.up.railway.app/api/debug/config
```

Deve retornar algo como:
```json
{
  "env": {
    "GOOGLE_CLIENT_ID": "DEFINIDO (...)",
    "GOOGLE_CLIENT_SECRET": "DEFINIDO",
    "RAILWAY_STATIC_URL": "formulario-production-8df7.up.railway.app"
  },
  "driveService": {
    "clientIdLoaded": "SIM (...)",
    "redirectUri": "https://formulario-production-8df7.up.railway.app/auth/google/callback",
    "isAuthenticated": false
  }
}
```

#### Obter URL de autenticação:
```bash
curl https://formulario-production-8df7.up.railway.app/api/drive/auth-url
```

### 4. Processo de Autenticação

1. Execute o comando acima para obter a URL de autenticação
2. Abra a URL no navegador
3. Faça login com a conta `ti@cosmobrasil.app`
4. Autorize o acesso ao Google Drive
5. Após autorizar, você será redirecionado para uma página de confirmação

### 5. Verificar Autenticação

Para verificar se a autenticação foi bem-sucedida:
```bash
curl https://formulario-production-8df7.up.railway.app/api/drive/status
```

Deve retornar:
```json
{
  "authenticated": true,
  "message": "Google Drive autenticado e pronto"
}
```

## Solução Alternativa (Fallback)

Se mesmo após configurar as variáveis de ambiente ainda tiver problemas, o sistema tem um fallback que carrega as credenciais de um arquivo local. Certifique-se de que o arquivo `client_secret_*.json` está presente no diretório raiz do projeto.

## Troubleshooting

### Erros Comuns:

1. **"Refresh token não encontrado"**
   - Significa que ainda não foi feita a autenticação inicial
   - Siga o processo de autenticação acima

2. **"redirect_uri_mismatch"**
   - O redirect URI configurado no Google Cloud Console não corresponde ao usado
   - Verifique se ambos estão idênticos

3. **"Client ID não definido"**
   - As variáveis de ambiente não foram configuradas corretamente
   - Verifique se GOOGLE_CLIENT_ID está definido no Railway

## Contato

Se precisar de ajuda adicional, entre em contato com o suporte técnico.