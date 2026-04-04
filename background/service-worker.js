/**
 * PromptShield — Service Worker (Background)
 * Main orchestrator — routes messages between content scripts, popup, and core engines
 */

// Note: All modules are loaded by sw.js — do not use importScripts here
// (MV3 only allows importScripts during top-level service worker evaluation)

const PS = globalThis.__PROMPTSHIELD__;

// ═══════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════
chrome.runtime.onInstalled.addListener(async (details) => {
  PS.log('Extension installed/updated:', details.reason);

  // Set default settings
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: PS.DEFAULT_SETTINGS });
    PS.log('Default settings initialized');
  }

  // Initialize storage
  await chrome.storage.local.set({
    scanHistory: [],
    auditLog: [],
    customPolicies: [],
  });

  // Set badge
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  chrome.action.setBadgeText({ text: '✓' });
});

// ═══════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  PS.log('Message received:', message.type, 'from:', sender.tab?.url || 'popup');
  handleMessage(message, sender).then(sendResponse).catch(err => {
    PS.error('Message handler error:', err);
    sendResponse({ error: err.message });
  });
  return true; // Keep message channel open for async response
});

async function handleMessage(message, sender) {
  const settings = await getSettings();

  switch (message.type) {
    case PS.MSG.SCAN_PROMPT:
      return handleScanPrompt(message, sender, settings);

    case PS.MSG.GET_SETTINGS:
      return { settings };

    case PS.MSG.UPDATE_SETTINGS:
      return handleUpdateSettings(message.settings);

    case PS.MSG.GET_HISTORY:
      return handleGetHistory(message.limit);

    case PS.MSG.CLEAR_HISTORY:
      return handleClearHistory();

    case PS.MSG.EXPORT_AUDIT:
      return handleExportAudit();

    case PS.MSG.GET_STATUS:
      return handleGetStatus(settings);

    case PS.MSG.EXECUTE_PLAN:
      return handleExecutePlan(message.plan, settings);

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ═══════════════════════════════════════════
// SCAN PROMPT HANDLER (Main Pipeline)
// ═══════════════════════════════════════════
async function handleScanPrompt(message, sender, settings) {
  if (!settings.enabled) {
    return { skipped: true, reason: 'Shield disabled' };
  }

  const { text, platform } = message;
  if (!text || text.trim().length === 0) {
    return { skipped: true, reason: 'Empty input' };
  }

  // ── Step 1: Prompt Firewall (instant, ~30ms) ──
  const scanResult = PS.scanPrompt(text, {
    enableMasking: settings.autoMask,
    sensitivity: settings.sensitivity,
  });

  PS.log(`Firewall scan: score=${scanResult.riskScore}, findings=${scanResult.findings.length}, time=${scanResult.metadata.scanTime}ms`);

  // ── Step 2: Gemini AI Analysis (ONLY on submit, not while typing) ──
  let executionPlan = null;
  let executionDecision = null;

  if (settings.geminiApiKey && message.isSubmit) {
    try {
      PS.log('🚀 SUBMIT detected — calling Gemini AI for execution plan analysis...');
      const geminiResult = await PS.analyzeWithGemini(text, settings.geminiApiKey);

      if (geminiResult && geminiResult.plan) {
        // Parse the tool plan
        const parsed = PS.parseToolPlan(geminiResult);
        PS.log(`Gemini plan: ${parsed.stepCount} steps, risk=${geminiResult.riskAssessment}`);

        if (parsed.valid && parsed.steps.length > 0) {
          // Evaluate each step with Fallback Guard (or ArmorClaw if available)
          executionPlan = parsed;
          executionDecision = await PS.decidePlan(parsed.steps, settings);
          PS.log(`Execution decision: ${executionDecision.overallDecision} (${executionDecision.summary.allowed} allowed, ${executionDecision.summary.blocked} blocked)`);

          // Boost risk score if dangerous actions detected — ensure overlay shows
          if (executionDecision.overallDecision === 'BLOCK') {
            scanResult.riskScore = Math.max(scanResult.riskScore, 90);
            scanResult.riskLevel = PS.getRiskLevel(scanResult.riskScore);
          } else if (executionDecision.overallDecision === 'PARTIAL') {
            scanResult.riskScore = Math.max(scanResult.riskScore, 85);
            scanResult.riskLevel = PS.getRiskLevel(scanResult.riskScore);
          }

          // Log execution decisions to audit
          for (const result of executionDecision.results) {
            await PS.addAuditEntry({
              type: 'execution_decision',
              tool: result.step?.tool || 'unknown',
              decision: result.allowed ? 'ALLOW' : 'BLOCK',
              reason: result.reason,
              riskLevel: result.riskLevel,
              source: result.source || 'fallback_guard',
            });
          }
        }
      }
    } catch (err) {
      PS.warn('Gemini analysis failed (non-blocking):', err.message);
      // Firewall result still valid — Gemini is optional
    }
  } else if (!message.isSubmit) {
    PS.log('⌨️ Real-time typing scan — firewall only (Gemini skipped to save quota)');
  } else {
    PS.log('⚠️ Gemini SKIPPED: No API key configured. Set it in popup → Settings → API Keys.');
  }

  // ── Update badge ────────────────────────
  updateBadge(scanResult.riskScore);

  // ── Save to history ─────────────────────
  const historyEntry = {
    id: generateId(),
    timestamp: Date.now(),
    platform: platform || detectPlatform(sender.tab?.url),
    riskScore: scanResult.riskScore,
    riskLevel: scanResult.riskLevel.label,
    findingCount: scanResult.findings.length,
    categories: scanResult.categories,
    summary: scanResult.summary.text,
    scanTime: scanResult.metadata.scanTime,
    geminiUsed: !!settings.geminiApiKey,
    executionDecision: executionDecision?.overallDecision || null,
  };

  await saveToHistory(historyEntry);

  // ── Log to audit ────────────────────────
  await PS.addAuditEntry({
    type: 'prompt_scan',
    platform: historyEntry.platform,
    riskScore: scanResult.riskScore,
    findings: scanResult.findings.map(f => ({
      category: f.category,
      label: f.label,
      maskedValue: f.maskedValue,
      source: f.source,
    })),
    decision: scanResult.riskScore >= 81 ? 'CRITICAL' : scanResult.riskScore >= 61 ? 'HIGH' : 'SCANNED',
    geminiUsed: !!settings.geminiApiKey,
  });

  return {
    type: PS.MSG.SCAN_RESULT,
    ...scanResult,
    // Attach execution plan data for the content script overlay
    executionPlan: executionPlan ? {
      steps: executionPlan.steps,
      summary: executionPlan.summary,
      riskAssessment: executionPlan.riskAssessment,
    } : null,
    executionDecision: executionDecision ? {
      overallDecision: executionDecision.overallDecision,
      results: executionDecision.results.map(r => ({
        tool: r.step?.tool || 'unknown',
        args: r.step?.args || {},
        allowed: r.allowed,
        reason: r.reason,
        riskLevel: r.riskLevel,
        source: r.source,
      })),
      summary: executionDecision.summary,
    } : null,
  };
}

// ═══════════════════════════════════════════
// EXECUTE PLAN HANDLER
// ═══════════════════════════════════════════
async function handleExecutePlan(plan, settings) {
  if (!plan || !Array.isArray(plan) || plan.length === 0) {
    return { error: 'Invalid plan' };
  }

  // Decision engine (ArmorClaw → Fallback)
  const decision = await PS.decidePlan(plan, settings);

  // Log each step
  for (const result of decision.results) {
    await PS.addAuditEntry({
      type: 'execution_decision',
      tool: result.step.tool,
      decision: result.allowed ? 'ALLOW' : 'BLOCK',
      reason: result.reason,
      riskLevel: result.riskLevel,
      policyId: result.policyId || null,
    });
  }

  return {
    type: PS.MSG.PLAN_RESULT,
    ...decision,
  };
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return settings || PS.DEFAULT_SETTINGS;
}

async function handleUpdateSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  await chrome.storage.local.set({ settings: merged });
  PS.log('Settings updated:', Object.keys(newSettings));
  return { settings: merged };
}

// ═══════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════
async function saveToHistory(entry) {
  const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');
  scanHistory.unshift(entry);
  // Cap at maxAuditEntries
  const settings = await getSettings();
  if (scanHistory.length > settings.maxAuditEntries) {
    scanHistory.length = settings.maxAuditEntries;
  }
  await chrome.storage.local.set({ scanHistory });
}

async function handleGetHistory(limit = 50) {
  const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');
  return { history: scanHistory.slice(0, limit) };
}

async function handleClearHistory() {
  await chrome.storage.local.set({ scanHistory: [], auditLog: [] });
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  return { cleared: true };
}

// ═══════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════
async function handleExportAudit() {
  const { auditLog = [] } = await chrome.storage.local.get('auditLog');
  return { auditLog, exportedAt: new Date().toISOString(), count: auditLog.length };
}

// ═══════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════
async function handleGetStatus(settings) {
  const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');
  const last = scanHistory[0] || null;
  return {
    enabled: settings.enabled,
    lastScan: last,
    totalScans: scanHistory.length,
    armorClawAvailable: (settings.armoriqMode || 'mock') === 'mock' || !!settings.armorClawApiKey,
    geminiAvailable: !!settings.geminiApiKey,
  };
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function updateBadge(riskScore) {
  const level = PS.getRiskLevel(riskScore);
  chrome.action.setBadgeBackgroundColor({ color: level.color });
  chrome.action.setBadgeText({ text: riskScore > 0 ? String(riskScore) : '✓' });
}

function detectPlatform(url) {
  if (!url) return 'unknown';
  for (const [key, platform] of Object.entries(PS.PLATFORMS)) {
    if (platform.urls.some(u => url.includes(u))) return key;
  }
  return 'unknown';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

PS.log('Service worker loaded');

// Startup diagnostics — prints key config to service worker console
getSettings().then(s => {
  PS.log('─── PromptShield Startup Diagnostics ───');
  PS.log('  Shield enabled:', s.enabled);
  PS.log('  Gemini API key:', s.geminiApiKey ? '✅ SET (' + s.geminiApiKey.substring(0, 8) + '...)' : '❌ NOT SET');
  PS.log('  ArmorIQ mode:', s.armoriqMode || 'mock', '(local cryptographic verification)');
  PS.log('  ArmorIQ proxy:', s.armoriqProxyEndpoint || 'https://customer-proxy.armoriq.ai');
  PS.log('  ArmorIQ User ID:', s.armoriqUserId || '(default)');
  PS.log('  Block mode:', s.blockMode);
  PS.log('  Sensitivity:', s.sensitivity);
  PS.log('────────────────────────────────────────');
});
