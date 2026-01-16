// Configuration for Questionário de Circularidade 2.0 - 2026
// PostgreSQL Railway Connection Settings

// Railway PostgreSQL credentials
const DATABASE_CONFIG = {
    host: 'centerbeam.proxy.rlwy.net',              // Railway PostgreSQL host
    port: 16594,                                     // Railway port
    database: 'railway',                            // Database name
    user: 'postgres',                               // Username
    password: 'kSYfUUXCRhOPVPwztXwieXmYOGnmSlZD',  // Password from Railway
    ssl: {
        rejectUnauthorized: false                     // Required for Railway
    }
};

// TODO: Define the new report email address
const REPORT_EMAIL = 'novorelatorio@cosmobrasil.com.br'; // Change this to your desired email

// Export configuration
window.POSTGRES_CONFIG = {
    DATABASE_CONFIG,
    REPORT_EMAIL
};

console.log('PostgreSQL Configuration loaded for 2026 version');