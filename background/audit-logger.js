/**
 * PromptShield — Audit Logger
 * Full audit trail with export capability
 */

async function addAuditEntry(entry) {
  try {
    const { auditLog = [] } = await chrome.storage.local.get('auditLog');
    const fullEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    auditLog.unshift(fullEntry);

    // Cap at 1000
    if (auditLog.length > 1000) auditLog.length = 1000;

    await chrome.storage.local.set({ auditLog });
    return fullEntry;
  } catch (err) {
    console.error('[PromptShield] Audit log error:', err);
  }
}

async function getAuditLog(limit = 100) {
  const { auditLog = [] } = await chrome.storage.local.get('auditLog');
  return auditLog.slice(0, limit);
}

async function exportAuditLog() {
  const { auditLog = [] } = await chrome.storage.local.get('auditLog');
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    agent: 'PromptShield',
    totalEntries: auditLog.length,
    entries: auditLog,
  };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
Object.assign(globalThis.__PROMPTSHIELD__, { addAuditEntry, getAuditLog, exportAuditLog });
