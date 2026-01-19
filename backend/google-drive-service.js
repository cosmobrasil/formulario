// Google Drive Service - Server-side OAuth 2.0
// Salva relatórios automaticamente na conta ti@cosmobrasil.app

const fs = require('fs');
const path = require('path');

// Carregar credenciais OAuth de variáveis de ambiente (produção) ou arquivo local
let clientSecret;

// Tenta carregar de variáveis de ambiente primeiro
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    clientSecret = {
        web: {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET
        }
    };
    console.log('✅ Credenciais Google carregadas (variáveis de ambiente)');
} else {
    // Fallback: tenta carregar de arquivo local (desenvolvimento)
    try {
        const clientSecretPath = path.join(__dirname, '..', 'client_secret_1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com.json');
        if (fs.existsSync(clientSecretPath)) {
            const clientSecretFile = fs.readFileSync(clientSecretPath, 'utf8');
            clientSecret = JSON.parse(clientSecretFile);
            console.log('✅ Credenciais Google carregadas (arquivo local)');
        }
    } catch (error) {
        console.warn('⚠️ Google credentials não encontradas - Drive não será configurado');
    }
}

class GoogleDriveService {
    constructor() {
        this.clientId = clientSecret?.web?.client_id;
        this.clientSecret = clientSecret?.web?.client_secret;
        // Usar redirect URI dinâmico baseado em variável de ambiente ou public URL
        if (process.env.GOOGLE_REDIRECT_URI) {
            this.redirectUri = process.env.GOOGLE_REDIRECT_URI;
        } else if (process.env.RAILWAY_STATIC_URL) {
            this.redirectUri = `https://${process.env.RAILWAY_STATIC_URL}/auth/google/callback`;
        } else if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
            // Fallback seguro para a URL informada
            this.redirectUri = 'https://formulario-production-8df7.up.railway.app/auth/google/callback';
        } else {
            this.redirectUri = 'http://localhost:3000/auth/google/callback';
        }

        console.log('🔗 Redirect URI configurado:', this.redirectUri);
        this.refreshToken = null;
        this.accessToken = null;
        this.tokenExpiry = null;

        // Carregar refresh token do arquivo (se existir)
        this.loadRefreshToken();
    }

    // Carregar refresh token salvo
    loadRefreshToken() {
        try {
            const tokenPath = path.join(__dirname, 'google_refresh_token.json');
            if (fs.existsSync(tokenPath)) {
                const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
                this.refreshToken = tokenData.refresh_token;
                console.log('✅ Refresh token carregado');
            }
        } catch (error) {
            console.warn('⚠️ Nenhum refresh token encontrado');
        }
    }

    // Salvar refresh token
    saveRefreshToken(refreshToken) {
        try {
            const tokenPath = path.join(__dirname, 'google_refresh_token.json');
            fs.writeFileSync(tokenPath, JSON.stringify({ refresh_token: refreshToken }));
            this.refreshToken = refreshToken;
            console.log('✅ Refresh token salvo');
        } catch (error) {
            console.error('❌ Erro ao salvar refresh token:', error);
        }
    }

    // Obter access token usando refresh token
    async getAccessToken() {
        // Se temos um access token válido, retorna ele
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        // Se não tem refresh token, precisa autenticar
        if (!this.refreshToken) {
            throw new Error('Refresh token não encontrado. É necessário autenticar primeiro.');
        }

        // Usar refresh token para obter novo access token
        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    refresh_token: this.refreshToken,
                    grant_type: 'refresh_token',
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Erro ao renovar token: ${error.error_description || error.error}`);
            }

            const data = await response.json();
            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);
            console.log('✅ Access token renovado');
            return this.accessToken;

        } catch (error) {
            console.error('❌ Erro ao obter access token:', error);
            throw error;
        }
    }

    // Trocar código de autorização por tokens
    async exchangeCodeForTokens(code) {
        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    code: code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: this.redirectUri,
                    grant_type: 'authorization_code',
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Erro ao trocar código: ${error.error_description || error.error}`);
            }

            const data = await response.json();

            // Salvar refresh token
            if (data.refresh_token) {
                this.saveRefreshToken(data.refresh_token);
            }

            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            return data;

        } catch (error) {
            console.error('❌ Erro ao trocar código por tokens:', error);
            throw error;
        }
    }

    // Gerar URL de autorização
    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/drive.file',
        ].join(' ');

        return `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${this.clientId}&` +
            `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
            `response_type=code&` +
            `scope=${encodeURIComponent(scopes)}&` +
            `access_type=offline&` +
            `prompt=consent&` +
            `login_hint=ti@cosmobrasil.app`;
    }

    // Salvar arquivo no Google Drive como Google Doc
    async saveFile(htmlContent, fileName, description = '') {
        const token = await this.getAccessToken();

        try {
            // Buscar ou criar pasta
            const folderId = await this.getOrCreateFolder(token);

            // Mudar extensão para .doc (Google Doc)
            const docFileName = fileName.replace('.html', '.doc');

            // Criar multipart upload COM CONVERSÃO para Google Doc
            const boundary = '-------314159265358979323846';
            const delimiter = '\r\n--' + boundary + '\r\n';
            const closeDelimiter = '\r\n--' + boundary + '--';

            const fileMetadata = {
                name: docFileName,
                parents: [folderId],
                description: description,
                mimeType: 'application/vnd.google-apps.document'
            };

            const metadataPart = delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(fileMetadata);

            const contentPart = delimiter +
                'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
                htmlContent;

            const requestBody = metadataPart + contentPart + closeDelimiter;

            // Adicionar convert=true para transformar HTML em Google Doc
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'multipart/related; boundary=' + boundary
                },
                body: requestBody
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Erro ao fazer upload: ${error.error?.message || 'Upload failed'}`);
            }

            const result = await response.json();
            console.log('✅ Google Doc salvo no Drive:', result.id);

            return {
                success: true,
                fileId: result.id,
                fileName: docFileName,
                viewUrl: `https://docs.google.com/document/d/${result.id}/edit`
            };

        } catch (error) {
            console.error('❌ Erro ao salvar no Drive:', error);
            throw error;
        }
    }

    // Buscar ou criar pasta para os relatórios
    async getOrCreateFolder(token) {
        try {
            // Buscar pasta existente
            const searchQuery = encodeURIComponent("name='Relatorios_Circularidade_2026' and mimeType='application/vnd.google-apps.folder' and trashed=false");
            const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${searchQuery}`, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            });

            const searchData = await searchResponse.json();

            if (searchData.files && searchData.files.length > 0) {
                console.log('✅ Pasta encontrada no Drive');
                return searchData.files[0].id;
            }

            // Criar nova pasta
            const folderMetadata = {
                name: 'Relatorios_Circularidade_2026',
                mimeType: 'application/vnd.google-apps.folder',
                description: 'Relatórios do Questionário de Circularidade 2026 - CosmoBrasil'
            };

            const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(folderMetadata)
            });

            const folderData = await createResponse.json();
            console.log('✅ Pasta criada no Drive:', folderData.id);
            return folderData.id;

        } catch (error) {
            console.error('❌ Erro ao gerenciar pasta:', error);
            throw error;
        }
    }

    // Verificar se está autenticado
    isAuthenticated() {
        return !!this.refreshToken;
    }
}

module.exports = GoogleDriveService;
