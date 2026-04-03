/**
 * PromptShield — Risk Pattern Library
 * Regex patterns, entropy calculator, adversarial bypass detection
 * Zero browser dependencies — portable to VS Code / npm
 */

// ═══════════════════════════════════════════
// REGEX PATTERN DEFINITIONS
// ═══════════════════════════════════════════
const PATTERNS = [
  // ─── API Keys ───────────────────────────
  {
    id: 'aws_access_key',
    category: 'api_key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    weight: 95,
    label: 'AWS Access Key',
    description: 'Amazon Web Services access key ID',
    maskPrefix: 4,
  },
  {
    id: 'aws_secret_key',
    category: 'api_key',
    regex: /\b[A-Za-z0-9/+=]{40}\b/g,
    weight: 60,
    label: 'AWS Secret Key (possible)',
    description: 'Potential AWS secret access key',
    maskPrefix: 4,
    requiresContext: true, // only flag if near AWS-related keywords
    contextKeywords: ['aws', 'secret', 'access', 'key', 'iam'],
  },
  {
    id: 'github_pat',
    category: 'api_key',
    regex: /\bghp_[a-zA-Z0-9]{36}\b/g,
    weight: 95,
    label: 'GitHub Personal Access Token',
    description: 'GitHub personal access token (classic)',
    maskPrefix: 4,
  },
  {
    id: 'github_oauth',
    category: 'api_key',
    regex: /\bgho_[a-zA-Z0-9]{36}\b/g,
    weight: 95,
    label: 'GitHub OAuth Token',
    maskPrefix: 4,
  },
  {
    id: 'github_app',
    category: 'api_key',
    regex: /\b(ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b/g,
    weight: 95,
    label: 'GitHub App Token',
    maskPrefix: 4,
  },
  {
    id: 'openai_key',
    category: 'api_key',
    regex: /\bsk-[a-zA-Z0-9]{20,}T3BlbkFJ[a-zA-Z0-9]{20,}\b/g,
    weight: 95,
    label: 'OpenAI API Key',
    maskPrefix: 3,
  },
  {
    id: 'openai_key_new',
    category: 'api_key',
    regex: /\bsk-(?:proj-)?[a-zA-Z0-9_-]{32,}\b/g,
    weight: 90,
    label: 'OpenAI API Key (new format)',
    maskPrefix: 3,
  },
  {
    id: 'google_api_key',
    category: 'api_key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    weight: 90,
    label: 'Google API Key',
    maskPrefix: 4,
  },
  {
    id: 'slack_token',
    category: 'api_key',
    regex: /\bxox[bpars]-[0-9a-zA-Z-]{10,}\b/g,
    weight: 90,
    label: 'Slack Token',
    maskPrefix: 4,
  },
  {
    id: 'stripe_key',
    category: 'api_key',
    regex: /\b(sk|pk)_(test|live)_[0-9a-zA-Z]{10,}\b/g,
    weight: 95,
    label: 'Stripe API Key',
    maskPrefix: 7,
  },
  {
    id: 'generic_api_key',
    category: 'api_key',
    regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    weight: 80,
    label: 'Generic API Key',
    maskPrefix: 0,
    captureGroup: 1,
  },
  {
    id: 'bearer_token',
    category: 'api_key',
    regex: /\bBearer\s+[a-zA-Z0-9_\-.]{20,}\b/gi,
    weight: 85,
    label: 'Bearer Token',
    maskPrefix: 7,
  },

  // ─── Passwords ──────────────────────────
  {
    id: 'password_assignment',
    category: 'password',
    regex: /(?:password|passwd|pwd|pass)\s*[=:]\s*['"]?(\S{3,})['"]?/gi,
    weight: 90,
    label: 'Password',
    description: 'Password assignment detected',
    maskPrefix: 0,
    captureGroup: 1,
  },
  {
    id: 'secret_assignment',
    category: 'password',
    regex: /(?:secret|token|auth)\s*[=:]\s*['"]?([a-zA-Z0-9_\-!@#$%^&*]{6,})['"]?/gi,
    weight: 80,
    label: 'Secret/Token Assignment',
    maskPrefix: 0,
    captureGroup: 1,
  },

  // ─── Private Keys ──────────────────────
  {
    id: 'private_key_rsa',
    category: 'private_key',
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    weight: 100,
    label: 'RSA Private Key',
    maskPrefix: 0,
  },
  {
    id: 'private_key_ec',
    category: 'private_key',
    regex: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/g,
    weight: 100,
    label: 'EC Private Key',
    maskPrefix: 0,
  },
  {
    id: 'private_key_dsa',
    category: 'private_key',
    regex: /-----BEGIN\s+DSA\s+PRIVATE\s+KEY-----/g,
    weight: 100,
    label: 'DSA Private Key',
    maskPrefix: 0,
  },
  {
    id: 'private_key_openssh',
    category: 'private_key',
    regex: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/g,
    weight: 100,
    label: 'OpenSSH Private Key',
    maskPrefix: 0,
  },

  // ─── Connection Strings ─────────────────
  {
    id: 'mongodb_uri',
    category: 'connection_string',
    regex: /mongodb(?:\+srv)?:\/\/[^\s'"]{10,}/gi,
    weight: 92,
    label: 'MongoDB Connection String',
    maskPrefix: 10,
  },
  {
    id: 'postgres_uri',
    category: 'connection_string',
    regex: /postgres(?:ql)?:\/\/[^\s'"]{10,}/gi,
    weight: 92,
    label: 'PostgreSQL Connection String',
    maskPrefix: 11,
  },
  {
    id: 'mysql_uri',
    category: 'connection_string',
    regex: /mysql:\/\/[^\s'"]{10,}/gi,
    weight: 92,
    label: 'MySQL Connection String',
    maskPrefix: 8,
  },
  {
    id: 'redis_uri',
    category: 'connection_string',
    regex: /redis(?:s)?:\/\/[^\s'"]{10,}/gi,
    weight: 88,
    label: 'Redis Connection String',
    maskPrefix: 8,
  },

  // ─── JWT Tokens ─────────────────────────
  {
    id: 'jwt_token',
    category: 'jwt_token',
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    weight: 82,
    label: 'JWT Token',
    maskPrefix: 10,
  },

  // ─── Environment Variables ──────────────
  {
    id: 'env_variable',
    category: 'env_variable',
    regex: /\b[A-Z][A-Z0-9_]{2,}=\S{6,}\b/g,
    weight: 70,
    label: 'Environment Variable',
    maskPrefix: 0,
    // Exclude common false positives
    exclude: /^(PATH|HOME|USER|SHELL|LANG|TERM|EDITOR|NODE_ENV|npm_)/,
  },
  {
    id: 'dotenv_content',
    category: 'env_variable',
    regex: /(?:DB_|DATABASE_|REDIS_|MONGO_|API_|SECRET_|AUTH_|TOKEN_|KEY_)[A-Z_]*=\S+/gi,
    weight: 85,
    label: '.env Variable',
    maskPrefix: 0,
  },

  // ─── Credit Cards ──────────────────────
  {
    id: 'visa_card',
    category: 'credit_card',
    regex: /\b4[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
    weight: 92,
    label: 'Visa Card Number',
    maskPrefix: 4,
  },
  {
    id: 'mastercard',
    category: 'credit_card',
    regex: /\b5[1-5][0-9]{2}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
    weight: 92,
    label: 'Mastercard Number',
    maskPrefix: 4,
  },
  {
    id: 'amex_card',
    category: 'credit_card',
    regex: /\b3[47][0-9]{2}[\s-]?[0-9]{6}[\s-]?[0-9]{5}\b/g,
    weight: 92,
    label: 'Amex Card Number',
    maskPrefix: 4,
  },

  // ─── SSN ────────────────────────────────
  {
    id: 'ssn',
    category: 'ssn',
    regex: /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g,
    weight: 90,
    label: 'Social Security Number',
    maskPrefix: 0,
  },

  // ─── IP Addresses (private/internal) ───
  {
    id: 'private_ip',
    category: 'ip_address',
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    weight: 35,
    label: 'Private IP Address',
    maskPrefix: 0,
  },
];

// ═══════════════════════════════════════════
// SENSITIVE KEYWORDS (for contextual boost)
// ═══════════════════════════════════════════
const SENSITIVE_KEYWORDS = [
  'password', 'passwd', 'pwd', 'pass',
  'secret', 'token', 'auth', 'credential',
  'api_key', 'apikey', 'api-key', 'access_key',
  'private_key', 'private-key', 'ssh_key',
  'database_url', 'db_password', 'db_pass',
  'connection_string', 'conn_str',
  'client_secret', 'client_id',
  'bearer', 'oauth',
  'encryption_key', 'signing_key',
  '.env', 'dotenv',
];

// ═══════════════════════════════════════════
// SHANNON ENTROPY CALCULATOR
// ═══════════════════════════════════════════
function calculateEntropy(str) {
  if (!str || str.length === 0) return 0;

  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  const len = str.length;
  let entropy = 0;

  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Find high-entropy substrings in text
 * @param {string} text
 * @param {number} threshold - minimum entropy (default 4.5)
 * @param {number} minLength - minimum substring length (default 16)
 * @returns {Array} matches with { value, entropy, start, end }
 */
function findHighEntropyStrings(text, threshold = 4.5, minLength = 16) {
  const results = [];
  // Look for contiguous non-whitespace strings
  const wordRegex = /[^\s'"`,;(){}\[\]]{16,}/g;
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    const value = match[0];
    const entropy = calculateEntropy(value);

    if (entropy >= threshold) {
      // Avoid flagging common words and URLs
      if (isLikelyNatural(value)) continue;

      results.push({
        value,
        entropy: Math.round(entropy * 100) / 100,
        start: match.index,
        end: match.index + value.length,
      });
    }
  }

  return results;
}

/**
 * Check if a string is likely natural language (not a secret)
 */
function isLikelyNatural(str) {
  const lower = str.toLowerCase();
  // Common URL patterns
  if (/^https?:\/\//.test(lower)) return true;
  // File paths
  if (/^[./\\]/.test(str) && /\.\w{1,5}$/.test(str)) return true;
  // Very repetitive (like 'aaaaaaaaaa')
  const uniqueChars = new Set(str).size;
  if (uniqueChars < 4) return true;
  // All lowercase dictionary-like words
  if (/^[a-z]+$/.test(str) && str.length < 30) return true;
  return false;
}

// ═══════════════════════════════════════════
// ADVERSARIAL BYPASS DETECTION
// ═══════════════════════════════════════════

/**
 * Detect and decode adversarial encodings
 * @param {string} text
 * @returns {Array} decoded findings
 */
function detectAdversarialBypasses(text) {
  const results = [];

  // 1. Base64 detection
  const base64Regex = /\b[A-Za-z0-9+/]{20,}={0,2}\b/g;
  let match;

  while ((match = base64Regex.exec(text)) !== null) {
    try {
      const decoded = atob(match[0]);
      // Check if decoded is readable ASCII
      if (/^[\x20-\x7E]+$/.test(decoded) && decoded.length >= 8) {
        results.push({
          type: 'base64',
          encoded: match[0],
          decoded,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    } catch (e) {
      // Not valid base64, skip
    }
  }

  // 2. ROT13 detection (look for known prefixes after ROT13)
  const rot13Decoded = rot13(text);
  const rot13Patterns = [
    /AKIA[0-9A-Z]{16}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /sk-[a-zA-Z0-9]{20,}/g,
    /-----BEGIN.*PRIVATE KEY-----/g,
  ];
  for (const pattern of rot13Patterns) {
    let m;
    while ((m = pattern.exec(rot13Decoded)) !== null) {
      results.push({
        type: 'rot13',
        encoded: text.substring(m.index, m.index + m[0].length),
        decoded: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // 3. Split string detection (e.g., "pass" + "word" = "password")
  const splitPatterns = [
    { parts: ['pass', 'word'], combined: 'password' },
    { parts: ['api', 'key'], combined: 'apikey' },
    { parts: ['secret', 'key'], combined: 'secretkey' },
    { parts: ['access', 'token'], combined: 'accesstoken' },
    { parts: ['auth', 'token'], combined: 'authtoken' },
  ];

  const lowerText = text.toLowerCase();
  for (const sp of splitPatterns) {
    // Check for split concatenation patterns: "pass" + "word", pass + word
    const concatRegex = new RegExp(
      `['"]?${sp.parts[0]}['"]?\\s*[+]\\s*['"]?${sp.parts[1]}['"]?`,
      'gi'
    );
    let cm;
    while ((cm = concatRegex.exec(text)) !== null) {
      results.push({
        type: 'split_string',
        encoded: cm[0],
        decoded: sp.combined,
        start: cm.index,
        end: cm.index + cm[0].length,
      });
    }
  }

  // 4. Hex-encoded string detection
  const hexRegex = /(?:0x)?(?:[0-9a-fA-F]{2}\s*){8,}/g;
  while ((match = hexRegex.exec(text)) !== null) {
    const hex = match[0].replace(/\s|0x/g, '');
    if (hex.length >= 16 && hex.length % 2 === 0) {
      try {
        const decoded = hex.match(/.{2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
        if (/^[\x20-\x7E]+$/.test(decoded)) {
          results.push({
            type: 'hex',
            encoded: match[0],
            decoded,
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      } catch (e) { /* skip */ }
    }
  }

  return results;
}

/**
 * ROT13 decoder
 */
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

// ═══════════════════════════════════════════
// MASKING UTILITIES
// ═══════════════════════════════════════════

/**
 * Mask a sensitive value
 * @param {string} value - the sensitive string
 * @param {number} prefixLen - how many chars to keep visible
 * @returns {string} masked value
 */
function maskValue(value, prefixLen = 0) {
  if (!value) return '***';
  if (prefixLen >= value.length) return value;
  const prefix = value.substring(0, prefixLen);
  const masked = '*'.repeat(Math.min(value.length - prefixLen, 20));
  return prefix + masked;
}

// ═══════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════
if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') {
  globalThis.__PROMPTSHIELD__ = {};
}

Object.assign(globalThis.__PROMPTSHIELD__, {
  PATTERNS,
  SENSITIVE_KEYWORDS,
  calculateEntropy,
  findHighEntropyStrings,
  detectAdversarialBypasses,
  rot13,
  maskValue,
  isLikelyNatural,
});
