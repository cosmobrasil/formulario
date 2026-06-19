# CONFIGURAÇÃO DO GOOGLE DRIVE - RAILWAY

## 🚨 PROBLEMA ATUAL
O aplicativo não consegue conectar ao Google Drive porque as variáveis de ambiente não estão configuradas no Railway.

## ✅ SOLUÇÃO PASSO A PASSO

### 1. CONFIGURAR VARIÁVEIS DE AMBIENTE NO RAILWAY

Acesse o painel do Railway e adicione estas variáveis:

```
GOOGLE_CLIENT_ID=1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
GOOGLE_REDIRECT_URI=https://formulario-production-8df7.up.railway.app/auth/google/callback
```

**Passos no Railway:**
1. Entre no painel do Railway
2. Selecione seu projeto
3. Clique em "Variables" 
4. Adicione cada variável acima
5. Faça deploy do projeto

### 2. VERIFICAR REDIRECT URI NO GOOGLE CLOUD CONSOLE

Certifique-se de que esta URL está autorizada:

```
https://formulario-production-8df7.up.railway.app/auth/google/callback
```

**Passos no Google Cloud Console:**
1. Acesse: https://console.cloud.google.com/apis/credentials
2. Encontre o Client ID: `<YOUR_CLIENT_ID>`
3. Clique no ícone de edição (lápis)
4. Em "Authorized redirect URIs", adicione a URL acima
5. Clique em "Save"

### 3. AUTENTICAR O GOOGLE DRIVE

Após configurar as variáveis:

1. **Obtenha a URL de autenticação:**
   ```bash
   curl https://formulario-production-8df7.up.railway.app/api/drive/auth-url
   ```

2. **Abra a URL retornada no navegador**

3. **Faça login com:** `ti@cosmobrasil.app`

4. **Autorize o acesso ao Google Drive**

### 4. VERIFICAR SUCESSO

Teste se a autenticação funcionou:
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

## 🛠 SCRIPT AUTOMATIZADO

Execute o script de configuração:
```bash
./setup-google-drive.sh
```

Este script vai:
- Verificar se as variáveis estão configuradas
- Obter a URL de autenticação automaticamente
- Mostrar instruções passo a passo

## 📋 ARQUIVOS AUXILIARES

- `SOLUCAO_GOOGLE_DRIVE.md` - Documentação completa
- `setup-google-drive.sh` - Script automatizado
- `INSTRUCOES_GOOGLE_DRIVE.md` - Instruções originais

## ❓ SUPORTE

Se ainda tiver problemas:
1. Verifique os logs do Railway
2. Confirme que todas as variáveis estão exatamente como mostrado
3. Certifique-se de que o deploy foi concluído após adicionar as variáveis