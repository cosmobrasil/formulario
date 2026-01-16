// Google Drive Service for Questionário 2026
// Handles authentication and file upload to Google Drive

class GoogleDriveService {
    constructor() {
        this.clientId = ''; // Will be loaded from credentials
        this.clientSecret = ''; // Will be loaded from credentials
        this.redirectUri = 'http://localhost:8080/callback'; // Fixed for local development
        this.accessToken = null;
        this.folderId = null; // ID of the folder where reports will be saved
    }

    // Load credentials from JSON file
    async loadCredentials() {
        try {
            // Try to load from the actual credentials file first
            const response = await fetch('../client_secret_1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com.json');
            
            if (response.ok) {
                const credentials = await response.json();
                this.clientId = credentials.web.client_id;
                this.clientSecret = credentials.web.client_secret;
                this.redirectUri = 'http://localhost:8080/callback'; // Default for local testing
                
                console.log('✅ Google credentials loaded successfully from actual file');
                return true;
            }
            
            // Fallback to local credentials file
            const fallbackResponse = await fetch('google-credentials.json');
            const fallbackCredentials = await fallbackResponse.json();
            
            this.clientId = fallbackCredentials.web.client_id;
            this.clientSecret = fallbackCredentials.web.client_secret;
            this.redirectUri = fallbackCredentials.web.redirect_uris[0];
            
            console.log('✅ Google credentials loaded from fallback file');
            return true;
            
        } catch (error) {
            console.error('❌ Error loading Google credentials:', error);
            return false;
        }
    }

    // Generate authentication URL
    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.appdata'
        ].join(' ');

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.append('client_id', this.clientId);
        authUrl.searchParams.append('redirect_uri', this.redirectUri);
        authUrl.searchParams.append('response_type', 'token');
        authUrl.searchParams.append('scope', scopes);
        authUrl.searchParams.append('access_type', 'offline');
        authUrl.searchParams.append('prompt', 'consent');
        authUrl.searchParams.append('include_granted_scopes', 'true');

        return authUrl.toString();
    }

    // Start authentication flow
    async authenticate() {
        try {
            // Load credentials first
            const credentialsLoaded = await this.loadCredentials();
            if (!credentialsLoaded) {
                throw new Error('Failed to load Google credentials');
            }
            
            // Generate auth URL
            const authUrl = this.getAuthUrl();
            
            // Open popup window for authentication
            const popup = window.open(
                authUrl,
                'google_auth',
                'width=600,height=600,scrollbars=yes,resizable=yes'
            );
            
            if (!popup) {
                throw new Error('Popup blocked by browser. Please allow popups for this site.');
            }
            
            // Wait for authentication to complete
            return new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    try {
                        // Check if popup is closed
                        if (popup.closed) {
                            clearInterval(checkInterval);
                            
                            // Check if we got a token
                            const token = localStorage.getItem('google_drive_token');
                            if (token) {
                                this.accessToken = token;
                                resolve(true);
                            } else {
                                reject(new Error('Authentication cancelled or failed')); 
                            }
                        }
                    } catch (error) {
                        clearInterval(checkInterval);
                        reject(error);
                    }
                }, 500);
                
                // Timeout after 5 minutes
                setTimeout(() => {
                    clearInterval(checkInterval);
                    popup.close();
                    reject(new Error('Authentication timeout')); 
                }, 300000);
            });
            
        } catch (error) {
            console.error('❌ Authentication error:', error);
            throw error;
        }
    }

    // Set access token after authentication
    setAccessToken(token) {
        this.accessToken = token;
        localStorage.setItem('google_drive_token', token);
        console.log('✅ Access token saved');
    }

    // Load token from localStorage
    loadToken() {
        const token = localStorage.getItem('google_drive_token');
        if (token) {
            this.accessToken = token;
            console.log('✅ Token loaded from storage');
            return true;
        }
        return false;
    }

    // Create folder for reports if it doesn't exist
    async createReportsFolder() {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            // First, try to find existing folder
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
                this.folderId = searchData.files[0].id;
                console.log('✅ Found existing reports folder:', this.folderId);
                return this.folderId;
            }

            // Create new folder if not found
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
            this.folderId = folderData.id;
            
            console.log('✅ Created new reports folder:', this.folderId);
            return this.folderId;

        } catch (error) {
            console.error('❌ Error creating/accessing folder:', error);
            throw error;
        }
    }

    // Upload HTML report to Google Drive
    async uploadReport(reportHtml, empresaData, idRelatorio) {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        if (!this.folderId) {
            await this.createReportsFolder();
        }

        try {
            const fileName = `Relatorio_${empresaData.nomeEmpresa.replace(/\s+/g, '_')}_${idRelatorio}_${new Date().toISOString().split('T')[0]}.html`;
            
            // Create file metadata
            const fileMetadata = {
                name: fileName,
                parents: [this.folderId],
                description: `Relatório de Circularidade - ${empresaData.nomeEmpresa}`,
                mimeType: 'text/html'
            };

            // Create multipart body
            const boundary = '----GoogleDriveUploadBoundary';
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;

            const metadata = JSON.stringify(fileMetadata);
            const multipartRequestBody = 
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
                body: multipartRequestBody
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Upload failed: ${errorData.error?.message || response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Report uploaded successfully:', result.id);
            
            return {
                fileId: result.id,
                fileName: fileName,
                webViewLink: result.webViewLink,
                webContentLink: result.webContentLink
            };

        } catch (error) {
            console.error('❌ Error uploading report:', error);
            throw error;
        }
    }

    // Save data to Google Sheets (optional)
    async saveToSheets(empresaData, resultados) {
        // Implementation for saving to Google Sheets
        // This would require additional Sheets API setup
        console.log('📊 Saving data to Google Sheets (placeholder)');
        return true;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.accessToken;
    }

    // Logout and clear token
    logout() {
        this.accessToken = null;
        localStorage.removeItem('google_drive_token');
        console.log('👋 User logged out');
    }
}

// Export for use in other files
window.GoogleDriveService = GoogleDriveService;