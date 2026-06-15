// Google Drive Service - Server-side OAuth 2.0
// Salva relatórios automaticamente na conta configurada

const fs = require('fs');
const path = require('path');

function loadClientSecretFromEnv() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      web: {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      },
    };
  }
  return null;
}

function loadClientSecretFromDisk() {
  const candidates = [
    path.join(__dirname, '..', 'google-credentials.json'),
    path.join(__dirname, '..', 'client_secret_1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com.json'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const contents = fs.readFileSync(candidate, 'utf8');
        return JSON.parse(contents);
      }
    } catch (error) {
      console.warn(`⚠️ Falha ao carregar credenciais Google de ${candidate}:`, error.message);
    }
  }

  return null;
}

const clientSecret = loadClientSecretFromEnv() || loadClientSecretFromDisk();

if (!clientSecret) {
  console.error('❌ NENHUMA CREDENCIAL GOOGLE ENCONTRADA!');
  console.error('   Configure as variáveis de ambiente no Railway:');
  console.error('   - GOOGLE_CLIENT_ID');
  console.error('   - GOOGLE_CLIENT_SECRET');
  console.error('   Ou coloque um arquivo google-credentials.json na raiz do projeto');
}

class GoogleDriveService {
  constructor() {
    if (!clientSecret || !clientSecret.web) {
      console.error('❌ Serviço Google Drive não pode ser inicializado - credenciais ausentes');
      this.clientId = null;
      this.clientSecret = null;
      this.redirectUri = null;
      this.refreshToken = null;
      this.accessToken = null;
      this.tokenExpiry = null;
      return;
    }

    this.clientId = clientSecret.web.client_id;
    this.clientSecret = clientSecret.web.client_secret;

    if (process.env.GOOGLE_REDIRECT_URI) {
      this.redirectUri = process.env.GOOGLE_REDIRECT_URI;
    } else if (process.env.RAILWAY_STATIC_URL) {
      this.redirectUri = `https://${process.env.RAILWAY_STATIC_URL}/auth/google/callback`;
    } else if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
      this.redirectUri = 'https://formulario-production-8df7.up.railway.app/auth/google/callback';
    } else {
      this.redirectUri = 'http://localhost:3000/auth/google/callback';
    }

    console.log('🔗 Redirect URI configurado:', this.redirectUri);
    this.refreshToken = null;
    this.accessToken = null;
    this.tokenExpiry = null;

    this.loadRefreshToken();
  }

  loadRefreshToken() {
    try {
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        this.refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
        console.log('✅ Refresh token carregado (variável de ambiente)');
        return;
      }

      const tokenPath = path.join(__dirname, 'google_refresh_token.json');
      if (fs.existsSync(tokenPath)) {
        const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        this.refreshToken = tokenData.refresh_token;
        console.log('✅ Refresh token carregado (arquivo local)');
      }
    } catch (error) {
      console.warn('⚠️ Nenhum refresh token encontrado:', error.message);
    }
  }

  saveRefreshToken(refreshToken) {
    try {
      const tokenPath = path.join(__dirname, 'google_refresh_token.json');
      fs.writeFileSync(tokenPath, JSON.stringify({ refresh_token: refreshToken }));
      this.refreshToken = refreshToken;
      if (process.env.RAILWAY_ENVIRONMENT) {
        console.log('✅ Refresh token atualizado em memória. Defina GOOGLE_REFRESH_TOKEN no Railway para persistência.');
      } else {
        console.log('✅ Refresh token salvo');
      }
    } catch (error) {
      console.error('❌ Erro ao salvar refresh token:', error);
    }
  }

  async getAccessToken() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Credenciais Google não configuradas. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Railway.');
    }

    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.refreshToken) {
      throw new Error('Refresh token não encontrado. É necessário autenticar primeiro.');
    }

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
  }

  async exchangeCodeForTokens(code) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Credenciais Google não configuradas. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Railway.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
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

    if (data.refresh_token) {
      this.saveRefreshToken(data.refresh_token);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);

    return data;
  }

  getAuthUrl() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      return null;
    }

    const scopes = ['https://www.googleapis.com/auth/drive.file'].join(' ');

    return `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `login_hint=ti@cosmobrasil.app`;
  }

  async saveFile(htmlContent, fileName, description = '') {
    const token = await this.getAccessToken();
    const folderId = await this.getOrCreateFolder(token);
    const docFileName = fileName.replace('.html', '.doc');
    const boundary = '-------314159265358979323846';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelimiter = '\r\n--' + boundary + '--';

    const fileMetadata = {
      name: docFileName,
      parents: [folderId],
      description,
      mimeType: 'application/vnd.google-apps.document',
    };

    const metadataPart = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(fileMetadata);

    const contentPart = delimiter +
      'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
      htmlContent;

    const requestBody = metadataPart + contentPart + closeDelimiter;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body: requestBody,
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
      viewUrl: `https://docs.google.com/document/d/${result.id}/edit`,
    };
  }

  async getOrCreateFolder(token) {
    const searchQuery = encodeURIComponent("name='Relatorios_Circularidade_2026' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${searchQuery}`, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    });

    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
      console.log('✅ Pasta encontrada no Drive');
      return searchData.files[0].id;
    }

    const folderMetadata = {
      name: 'Relatorios_Circularidade_2026',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Relatórios do Questionário de Circularidade 2026 - CosmoBrasil',
    };

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(folderMetadata),
    });

    const folderData = await createResponse.json();
    console.log('✅ Pasta criada no Drive:', folderData.id);
    return folderData.id;
  }

  isAuthenticated() {
    return !!(this.clientId && this.clientSecret && this.refreshToken);
  }
}

module.exports = GoogleDriveService;
