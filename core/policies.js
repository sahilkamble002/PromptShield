/**
 * PromptShield — Security Policies
 * Default policies + policy matching engine
 * Zero browser dependencies
 */

const DEFAULT_POLICIES = [
  // System File Protection
  { id: 'block_etc', action: 'deny', tool: '*', pathPattern: '/etc/*', reason: 'System config files protected', severity: 'critical' },
  { id: 'block_sys', action: 'deny', tool: '*', pathPattern: '/sys/*', reason: 'System kernel files protected', severity: 'critical' },
  { id: 'block_proc', action: 'deny', tool: '*', pathPattern: '/proc/*', reason: 'Process info protected', severity: 'critical' },
  { id: 'block_var_log_del', action: 'deny', tool: 'delete_file', pathPattern: '/var/log/*', reason: 'System logs cannot be deleted', severity: 'high' },
  // SSH & Crypto
  { id: 'block_ssh', action: 'deny', tool: '*', pathPattern: '~/.ssh/*', reason: 'SSH keys protected', severity: 'critical' },
  { id: 'block_gnupg', action: 'deny', tool: '*', pathPattern: '~/.gnupg/*', reason: 'GPG keys protected', severity: 'critical' },
  // Credential Files
  { id: 'block_env_write', action: 'deny', tool: 'write_file', pathPattern: '*.env*', reason: 'Env files cannot be modified', severity: 'high' },
  { id: 'block_creds', action: 'deny', tool: '*', pathPattern: '*credentials*', reason: 'Credential files protected', severity: 'high' },
  // Destructive Commands
  { id: 'block_rm_rf', action: 'deny', tool: 'execute_command', commandPattern: 'rm -rf*', reason: 'Recursive delete blocked', severity: 'critical' },
  { id: 'block_format', action: 'deny', tool: 'execute_command', commandPattern: 'format*', reason: 'Disk format blocked', severity: 'critical' },
  { id: 'block_chmod777', action: 'deny', tool: 'execute_command', commandPattern: '*chmod 777*', reason: 'Unsafe permissions blocked', severity: 'high' },
  // Data Exfiltration
  { id: 'block_email_creds', action: 'deny', tool: 'send_email', dataClass: 'CREDENTIALS', reason: 'Cannot email credentials', severity: 'critical' },
  { id: 'block_email_pay', action: 'deny', tool: 'send_email', dataClass: 'PAYMENT', reason: 'Cannot email payment data', severity: 'critical' },
  { id: 'block_upload_sens', action: 'deny', tool: 'upload_file', dataClass: 'SENSITIVE', reason: 'Cannot upload sensitive files', severity: 'high' },
  // Network
  { id: 'block_onion', action: 'deny', tool: 'http_request', urlPattern: '*.onion*', reason: 'Dark web blocked', severity: 'critical' },
  { id: 'block_pastebin', action: 'deny', tool: 'http_request', urlPattern: '*pastebin.com*', reason: 'Pastebin uploads blocked', severity: 'high' },
  // Safe Defaults
  { id: 'allow_local_read', action: 'allow', tool: 'read_file', pathPattern: './*', reason: 'Local project files allowed', severity: 'info' },
  { id: 'allow_list', action: 'allow', tool: 'list_files', pathPattern: './*', reason: 'Listing local files allowed', severity: 'info' },
  { id: 'allow_search', action: 'allow', tool: 'search_files', pathPattern: './*', reason: 'Searching local files allowed', severity: 'info' },
];

function matchPolicy(step, policies) {
  const denyPolicies = policies.filter(p => p.action === 'deny');
  const allowPolicies = policies.filter(p => p.action === 'allow');

  for (const policy of denyPolicies) {
    if (policyMatches(policy, step)) return { ...policy, matched: true };
  }
  for (const policy of allowPolicies) {
    if (policyMatches(policy, step)) return { ...policy, matched: true };
  }
  return null;
}

function policyMatches(policy, step) {
  if (policy.tool !== '*' && policy.tool !== step.tool) return false;

  if (policy.pathPattern && step.args?.path) {
    if (wildcardMatch(step.args.path, policy.pathPattern)) return true;
  }
  if (policy.commandPattern && step.args?.command) {
    if (wildcardMatch(step.args.command, policy.commandPattern)) return true;
  }
  if (policy.urlPattern && step.args?.url) {
    if (wildcardMatch(step.args.url, policy.urlPattern)) return true;
  }
  if (policy.dataClass && step.dataClass) {
    if (step.dataClass === policy.dataClass) return true;
  }

  if (policy.pathPattern || policy.commandPattern || policy.urlPattern || policy.dataClass) return false;
  return true;
}

function wildcardMatch(text, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(text);
}

function validatePolicy(policy) {
  const errors = [];
  if (!policy.id) errors.push('Policy must have an id');
  if (!['allow', 'deny'].includes(policy.action)) errors.push('Action must be "allow" or "deny"');
  if (!policy.tool) errors.push('Policy must specify a tool');
  if (!policy.reason) errors.push('Policy must have a reason');
  return { valid: errors.length === 0, errors };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
Object.assign(globalThis.__PROMPTSHIELD__, { DEFAULT_POLICIES, matchPolicy, policyMatches, wildcardMatch, validatePolicy });
