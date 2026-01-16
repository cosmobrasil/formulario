// Simplified Google Drive Integration for Questionário 2026
// Silent background service - no user interaction

const GoogleDriveIntegration = {
    // Google API configuration (using your credentials)
    CLIENT_ID: '1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com',
    API_KEY: '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',
    DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    SCOPES: 'https://www.googleapis.com/auth/drive.file',
    
    accessToken: null,
    initialized: false,
    
    // Initialize silently
    async init() {
        try {
            // Try to load existing token
            this.accessToken = localStorage.getItem('gdrive_token_2026');
            
            if (this.accessToken) {
                // Test if token is still valid
                const isValid = await this.testToken();
                if (!isValid) {
                    this.accessToken = null;
                    localStorage.removeItem('gdrive_token_2026');
                }
            }
            
            this.initialized = true;
            console.log('✅ Google Drive integration initialized silently');
            return true;
            
        } catch (error) {
            console.warn('⚠️ Google Drive initialization failed:', error);
            return false;
        }
    },
    
    // Test if current token is valid
    async testToken() {
        if (!this.accessToken) return false;
        
        try {
            const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            return response.ok;
        } catch {
            return false;
        }
    },
    
    // Silently save report to Google Drive
    async saveReportSilently(reportHtml, empresaData, idRelatorio) {
        if (!this.initialized) {
            await this.init();
        }
        
        // Only proceed if we have a valid token
        if (!this.accessToken) {
            console.log('ℹ️ No Google Drive token - skipping silent save');
            return null;
        }
        
        try {
            // Create filename
            const fileName = `Relatorio_${empresaData.nomeEmpresa.replace(/\s+/g, '_')}_${idRelatorio}_${new Date().toISOString().split('T')[0]}.html`;
            
            // Find or create folder
            const folderId = await this.getOrCreateFolder();
            
            // Upload file
            const fileMetadata = {
                name: fileName,
                parents: [folderId],
                description: `Relatório de Circularidade - ${empresaData.nomeEmpresa}`,
                mimeType: 'text/html'
            };
            
            const boundary = '----GoogleDriveUploadBoundary';
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;
            
            const metadata = JSON.stringify(fileMetadata);
            const multipartBody = 
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                metadata +
                delimiter +
                'Content-Type: text/html\r\n\r\n' +
                reportHtml +
                closeDelimiter;
            
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': `multipart/related; boundary="${boundary}"`
                },
                body: multipartBody
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Relatório salvo silenciosamente no Google Drive:', result.id);
                return {
                    fileId: result.id,
                    fileName: fileName,
                    success: true
                };
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Upload failed');
            }
            
        } catch (error) {
            console.warn('⚠️ Erro silencioso no upload do Google Drive:', error);
            return null;
        }
    },
    
    // Get or create reports folder
    async getOrCreateFolder() {
        try {
            // Search for existing folder
            const searchResponse = await fetch(
                'https://www.googleapis.com/drive/v3/files?q=name=\'Relatorios_Circularidade_2026\' and mimeType=\'application/vnd.google-apps.folder\' and trashed=false',
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );
            
            const searchData = await searchResponse.json();
            
            if (searchData.files && searchData.files.length > 0) {
                return searchData.files[0].id;
            }
            
            // Create new folder
            const folderMetadata = {
                name: 'Relatorios_Circularidade_2026',
                mimeType: 'application/vnd.google-apps.folder',
                description: 'Relatórios do Questionário de Circularidade 2026'
            };
            
            const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(folderMetadata)
            });
            
            const folderData = await createResponse.json();
            return folderData.id;
            
        } catch (error) {
            console.warn('⚠️ Erro ao criar/acessar pasta:', error);
            throw error;
        }
    }
};

// Make it available globally
window.GoogleDriveIntegration = GoogleDriveIntegration;