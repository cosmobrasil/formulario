#!/bin/bash

# Script de Configuração do Google Drive para Railway
# Executar este script após configurar as variáveis de ambiente no Railway

echo "🚀 Script de Configuração do Google Drive"
echo "======================================="
echo ""

# URL base do seu aplicativo Railway
BASE_URL="https://formulario-production-8df7.up.railway.app"

echo "🔧 Etapa 1: Verificando configuração..."
echo "----------------------------------------"

# Verificar configuração
CONFIG_RESPONSE=$(curl -s "$BASE_URL/api/debug/config")

if [[ $CONFIG_RESPONSE == *"NÃO DEFINIDO"* ]]; then
    echo "❌ ERRO: Variáveis de ambiente do Google não estão configuradas!"
    echo ""
    echo "Por favor, configure as seguintes variáveis no Railway:"
    echo "GOOGLE_CLIENT_ID=<YOUR_CLIENT_ID>"
    echo "GOOGLE_CLIENT_SECRET=<YOUR_CLIENT_SECRET>"
    echo "GOOGLE_REDIRECT_URI=$BASE_URL/auth/google/callback"
    echo ""
    echo "Depois de configurar, execute este script novamente."
    exit 1
fi

echo "✅ Configuração OK!"
echo "$CONFIG_RESPONSE" | jq '.'
echo ""

echo "🔗 Etapa 2: Obtendo URL de autenticação..."
echo "------------------------------------------"

# Obter URL de autenticação
AUTH_RESPONSE=$(curl -s "$BASE_URL/api/drive/auth-url")
AUTH_URL=$(echo "$AUTH_RESPONSE" | jq -r '.authUrl')

if [[ $AUTH_URL == "null" ]] || [[ -z "$AUTH_URL" ]]; then
    echo "❌ Não foi possível obter a URL de autenticação"
    echo "Verifique se o serviço está online e as credenciais estão corretas"
    exit 1
fi

echo "✅ URL de autenticação obtida!"
echo ""
echo "📁 Próximos passos:"
echo "1. Abra esta URL no seu navegador:"
echo "   $AUTH_URL"
echo ""
echo "2. Faça login com a conta: ti@cosmobrasil.app"
echo "3. Autorize o acesso ao Google Drive"
echo "4. Após autorizar, você será redirecionado para uma página de confirmação"
echo ""
echo "5. Depois de autorizar, execute o comando abaixo para verificar:"
echo "   curl $BASE_URL/api/drive/status"
echo ""

echo "🧪 Etapa 3: Testando status atual..."
echo "------------------------------------"

STATUS_RESPONSE=$(curl -s "$BASE_URL/api/drive/status")
echo "$STATUS_RESPONSE" | jq '.'

echo ""
echo "📝 Instruções completas disponíveis em: SOLUCAO_GOOGLE_DRIVE.md"