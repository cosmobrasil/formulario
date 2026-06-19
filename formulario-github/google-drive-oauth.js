// Google Drive OAuth 2.0 Integration - Complete Implementation
// Questionário de Circularidade 2026

const GoogleDriveAuth = {
    // OAuth 2.0 Configuration
    CLIENT_ID: '1013653365990-ui04jq5na330791qg3e232vkhsm8d70v.apps.googleusercontent.com',
    API_KEY: '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',
    SCOPES: 'https://www.googleapis.com/auth/drive.file',
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',

    tokenClient: null,
    gapiInited: false,
    gisInited: false,
    accessToken: null,

    // Initialize Google APIs
    async init() {
        return new Promise((resolve, reject) => {
            // Load GAPI client
            const script1 = document.createElement('script');
            script1.src = 'https://apis.google.com/js/api.js';
            script1.onload = () => {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: this.API_KEY,
                            discoveryDocs: [this.DISCOVERY_DOC],
                        });
                        this.gapiInited = true;
                        console.log('✅ GAPI initialized');
                        this.checkInit();
                        resolve();
                    } catch (error) {
                        console.error('❌ Error initializing GAPI:', error);
                        reject(error);
                    }
                });
            };
            document.head.appendChild(script1);

            // Load GIS (Google Identity Services)
            const script2 = document.createElement('script');
            script2.src = 'https://accounts.google.com/gsi/client';
            script2.onload = () => {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.CLIENT_ID,
                    scope: this.SCOPES,
                    callback: (response) => {
                        if (response.access_token) {
                            this.accessToken = response.access_token;
                            localStorage.setItem('gdrive_token_2026', response.access_token);
                            console.log('✅ Google Drive authenticated!');
                            this.onAuthSuccess?.(response.access_token);
                        }
                    },
                });
                this.gisInited = true;
                console.log('✅ GIS initialized');
                this.checkInit();
                resolve();
            };
            document.head.appendChild(script2);
        });
    },

    checkInit() {
        if (this.gapiInited && this.gisInited) {
            console.log('✅ Google Drive API ready');
        }
    },

    // Request authorization
    authorize() {
        if (!this.tokenClient) {
            console.error('❌ Token client not initialized');
            return;
        }

        // Check if we already have a valid token
        const existingToken = localStorage.getItem('gdrive_token_2026');
        if (existingToken) {
            this.accessToken = existingToken;
            console.log('✅ Using existing token');
            this.onAuthSuccess?.(existingToken);
            return;
        }

        // Request new token
        this.tokenClient.requestAccessToken();
    },

    // Check if authenticated
    isAuthenticated() {
        return !!this.accessToken || !!localStorage.getItem('gdrive_token_2026');
    },

    // Get access token
    getAccessToken() {
        return this.accessToken || localStorage.getItem('gdrive_token_2026');
    },

    // Save report to Google Drive
    async saveReport(htmlContent, fileName, description = '') {
        const token = this.getAccessToken();
        if (!token) {
            throw new Error('Not authenticated with Google Drive');
        }

        try {
            // Find or create folder
            const folderId = await this.getOrCreateFolder(token);

            // Create file metadata
            const fileMetadata = {
                name: fileName,
                parents: [folderId],
                description: description,
                mimeType: 'text/html'
            };

            // Create multipart upload body
            const boundary = '-------314159265358979323846';
            const delimiter = '\r\n--' + boundary + '\r\n';
            const closeDelimiter = '\r\n--' + boundary + '--';

            const requestBody =
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(fileMetadata) +
                delimiter +
                'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
                htmlContent +
                closeDelimiter;

            // Upload file
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'multipart/related; boundary=' + boundary
                },
                body: requestBody
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Upload failed');
            }

            const result = await response.json();
            console.log('✅ File saved to Drive:', result.id);
            return {
                success: true,
                fileId: result.id,
                fileName: fileName,
                viewUrl: `https://drive.google.com/file/d/${result.id}/view`
            };

        } catch (error) {
            console.error('❌ Error saving to Drive:', error);
            throw error;
        }
    },

    // Get or create reports folder
    async getOrCreateFolder(token) {
        try {
            // Search for existing folder
            const searchResponse = await fetch(
                'https://www.googleapis.com/drive/v3/files?q=name=%27Relatorios_Circularidade_2026%27+and+mimeType=%27application/vnd.google-apps.folder%27+and+trashed=false',
                {
                    headers: {
                        'Authorization': 'Bearer ' + token
                    }
                }
            );

            const searchData = await searchResponse.json();

            if (searchData.files && searchData.files.length > 0) {
                console.log('✅ Using existing folder:', searchData.files[0].id);
                return searchData.files[0].id;
            }

            // Create new folder
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
            console.log('✅ Created folder:', folderData.id);
            return folderData.id;

        } catch (error) {
            console.error('❌ Error with folder:', error);
            throw error;
        }
    },

    // Clear authentication
    logout() {
        this.accessToken = null;
        localStorage.removeItem('gdrive_token_2026');
        console.log('✅ Logged out from Google Drive');
    },

    // Callback for successful auth
    onAuthSuccess: null
};

// Make it available globally
window.GoogleDriveAuth = GoogleDriveAuth;
