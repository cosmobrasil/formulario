// Logger estruturado com categorias
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const CATEGORIES = {
  DB:     { prefix: '🗄️  [DB]',     color: '\x1b[36m' },
  DRIVE:  { prefix: '☁️  [DRIVE]',  color: '\x1b[34m' },
  CNPJ:   { prefix: '🔍 [CNPJ]',    color: '\x1b[33m' },
  AUTH:   { prefix: '🔐 [AUTH]',    color: '\x1b[35m' },
  API:    { prefix: '🌐 [API]',     color: '\x1b[32m' },
  SCHEMA: { prefix: '🧭 [SCHEMA]',  color: '\x1b[37m' },
  INIT:   { prefix: '🚀 [INIT]',    color: '\x1b[32m' },
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(category, level, message, data) {
  const cat = CATEGORIES[category] || { prefix: `[${category}]`, color: '\x1b[0m' };
  const label = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : '✅';
  const ts = timestamp();
  const prefix = `${ts} ${cat.prefix}`;
  const line = data
    ? `${prefix} ${label} ${message} ${JSON.stringify(data)}`
    : `${prefix} ${label} ${message}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

module.exports = {
  debug: (category, msg, data) => log(category, 'DEBUG', msg, data),
  info:  (category, msg, data) => log(category, 'INFO', msg, data),
  warn:  (category, msg, data) => log(category, 'WARN', msg, data),
  error: (category, msg, data) => log(category, 'ERROR', msg, data),
};
