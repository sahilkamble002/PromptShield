/**
 * PromptShield — Shared Constants
 * Zero browser dependencies — portable to VS Code / npm
 */

// ═══════════════════════════════════════════
// RISK LEVELS
// ═══════════════════════════════════════════
const RISK_LEVELS = {
  NONE:     { min: 0,  max: 0,   label: 'None',     color: '#10b981', icon: '✅' },
  LOW:      { min: 1,  max: 30,  label: 'Low',      color: '#22c55e', icon: '🟢' },
  MEDIUM:   { min: 31, max: 60,  label: 'Medium',   color: '#f59e0b', icon: '🟡' },
  HIGH:     { min: 61, max: 80,  label: 'High',     color: '#f97316', icon: '🟠' },
  CRITICAL: { min: 81, max: 100, label: 'Critical', color: '#ef4444', icon: '🔴' },
};

function getRiskLevel(score) {
  if (score <= 0) return RISK_LEVELS.NONE;
  if (score <= 30) return RISK_LEVELS.LOW;
  if (score <= 60) return RISK_LEVELS.MEDIUM;
  if (score <= 80) return RISK_LEVELS.HIGH;
  return RISK_LEVELS.CRITICAL;
}

// ═══════════════════════════════════════════
// FINDING CATEGORIES
// ═══════════════════════════════════════════
const CATEGORY = {
  API_KEY:           'api_key',
  PASSWORD:          'password',
  PRIVATE_KEY:       'private_key',
  CONNECTION_STRING: 'connection_string',
  ENV_VARIABLE:      'env_variable',
  JWT_TOKEN:         'jwt_token',
  CREDIT_CARD:       'credit_card',
  SSN:               'ssn',
  HIGH_ENTROPY:      'high_entropy',
  IP_ADDRESS:        'ip_address',
  EMAIL_LEAK:        'email_leak',
  PHONE_NUMBER:      'phone_number',
};

const CATEGORY_META = {
  [CATEGORY.API_KEY]:           { label: 'API Key',            severity: 'critical', color: '#ef4444' },
  [CATEGORY.PASSWORD]:          { label: 'Password',           severity: 'critical', color: '#ef4444' },
  [CATEGORY.PRIVATE_KEY]:       { label: 'Private Key',        severity: 'critical', color: '#ef4444' },
  [CATEGORY.CONNECTION_STRING]: { label: 'Connection String',  severity: 'critical', color: '#ef4444' },
  [CATEGORY.ENV_VARIABLE]:      { label: 'Env Variable',       severity: 'high',     color: '#f97316' },
  [CATEGORY.JWT_TOKEN]:         { label: 'JWT Token',          severity: 'high',     color: '#f97316' },
  [CATEGORY.CREDIT_CARD]:       { label: 'Credit Card',        severity: 'critical', color: '#ef4444' },
  [CATEGORY.SSN]:               { label: 'SSN',                severity: 'critical', color: '#ef4444' },
  [CATEGORY.HIGH_ENTROPY]:      { label: 'High Entropy String',severity: 'medium',   color: '#f59e0b' },
  [CATEGORY.IP_ADDRESS]:        { label: 'IP Address',         severity: 'low',      color: '#22c55e' },
  [CATEGORY.EMAIL_LEAK]:        { label: 'Email Address',      severity: 'low',      color: '#22c55e' },
  [CATEGORY.PHONE_NUMBER]:      { label: 'Phone Number',       severity: 'medium',   color: '#f59e0b' },
};

// ═══════════════════════════════════════════
// TOOL RISK CLASSIFICATIONS
// ═══════════════════════════════════════════
const TOOL_RISK = {
  read_file:       'low',
  list_files:      'low',
  search_files:    'low',
  write_file:      'high',
  delete_file:     'critical',
  rename_file:     'medium',
  send_email:      'high',
  http_request:    'medium',
  execute_command: 'critical',
  install_package: 'high',
  modify_config:   'high',
  access_database: 'high',
  upload_file:     'high',
};

// ═══════════════════════════════════════════
// SUPPORTED PLATFORMS
// ═══════════════════════════════════════════
const PLATFORMS = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    urls: ['chat.openai.com', 'chatgpt.com'],
    icon: '🤖',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    urls: ['gemini.google.com'],
    icon: '✨',
  },
  copilot: {
    id: 'copilot',
    name: 'Copilot',
    urls: ['copilot.microsoft.com'],
    icon: '🧑‍✈️',
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    urls: ['claude.ai'],
    icon: '🎭',
  },
};

// ═══════════════════════════════════════════
// DEFAULT SETTINGS
// ═══════════════════════════════════════════
const DEFAULT_SETTINGS = {
  enabled: true,
  autoMask: false,          // user-optional masking
  blockMode: 'warn',        // 'warn' | 'block' | 'allow'
  sensitivity: 3,           // 1-5 scale
  soundEnabled: true,
  xrayEnabled: true,
  geminiApiKey: '',
  armorClawApiKey: '',       // ArmorIQ API key (ak_live_...)
  armoriqUserId: '',         // ArmorIQ user ID
  armoriqAgentId: '',        // ArmorIQ agent ID
  armoriqProxyEndpoint: 'https://customer-proxy.armoriq.ai',
  armoriqMode: 'mock',       // 'mock' (local crypto) | 'live' (real API)
  maxAuditEntries: 1000,
};

// ═══════════════════════════════════════════
// MESSAGE TYPES (content ↔ service worker)
// ═══════════════════════════════════════════
const MSG = {
  SCAN_PROMPT:       'SCAN_PROMPT',
  SCAN_RESULT:       'SCAN_RESULT',
  GET_SETTINGS:      'GET_SETTINGS',
  UPDATE_SETTINGS:   'UPDATE_SETTINGS',
  GET_HISTORY:       'GET_HISTORY',
  CLEAR_HISTORY:     'CLEAR_HISTORY',
  EXPORT_AUDIT:      'EXPORT_AUDIT',
  GET_STATUS:        'GET_STATUS',
  EXECUTE_PLAN:      'EXECUTE_PLAN',
  PLAN_RESULT:       'PLAN_RESULT',
};

// ═══════════════════════════════════════════
// SENSITIVITY PRESETS
// ═══════════════════════════════════════════
const SENSITIVITY = {
  1: { label: 'Minimal',    entropyThreshold: 5.5, minPatternWeight: 80 },
  2: { label: 'Low',        entropyThreshold: 5.0, minPatternWeight: 70 },
  3: { label: 'Standard',   entropyThreshold: 4.5, minPatternWeight: 50 },
  4: { label: 'High',       entropyThreshold: 4.0, minPatternWeight: 30 },
  5: { label: 'Paranoid',   entropyThreshold: 3.5, minPatternWeight: 10 },
};

// Debug flag
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[PromptShield]', ...args);
}

function warn(...args) {
  if (DEBUG) console.warn('[PromptShield]', ...args);
}

function error(...args) {
  console.error('[PromptShield]', ...args);
}

// ═══════════════════════════════════════════
// EXPORTS (works in both module and script)
// ═══════════════════════════════════════════
if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') {
  globalThis.__PROMPTSHIELD__ = {};
}

Object.assign(globalThis.__PROMPTSHIELD__, {
  RISK_LEVELS,
  getRiskLevel,
  CATEGORY,
  CATEGORY_META,
  TOOL_RISK,
  PLATFORMS,
  DEFAULT_SETTINGS,
  MSG,
  SENSITIVITY,
  DEBUG,
  log,
  warn,
  error,
});
