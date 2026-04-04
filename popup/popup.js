/**
 * PromptShield — Popup Dashboard Logic
 * Gauge animation, history, audit log, settings management
 */

document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

const RISK_COLORS = {
  safe: '#10b981', low: '#22c55e', medium: '#f59e0b',
  high: '#f97316', critical: '#ef4444',
};

const SENSITIVITY_LABELS = {
  1: 'Minimal', 2: 'Low', 3: 'Standard', 4: 'High', 5: 'Paranoid',
};

// ═══════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════
async function initDashboard() {
  setupTabs();
  await loadSettings();
  await loadStatus();
  await loadHistory();
  await loadAuditLog();
  setupEventListeners();

  // Auto-refresh every 3 seconds
  setInterval(async () => {
    await loadStatus();
    await loadHistory();
  }, 3000);
}

// ═══════════════════════════════════════
// TABS
// ═══════════════════════════════════════
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ═══════════════════════════════════════
// GAUGE
// ═══════════════════════════════════════
function updateGauge(score, label, color) {
  const fill = document.getElementById('gauge-fill');
  const scoreEl = document.getElementById('gauge-score');
  const labelEl = document.getElementById('gauge-label');

  // Circumference = 2π × 50 = ~314
  const circumference = 314;
  const offset = circumference - (score / 100) * circumference;

  fill.style.strokeDashoffset = offset;
  fill.style.stroke = color;
  scoreEl.textContent = score;
  labelEl.textContent = label;
  labelEl.style.color = color;
}

function animateGauge(targetScore) {
  const level = getRiskLevel(targetScore);
  let current = 0;
  const duration = 800;
  const start = performance.now();

  function step(timestamp) {
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    current = Math.round(targetScore * eased);
    updateGauge(current, level.label, level.color);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function getRiskLevel(score) {
  if (score <= 0) return { label: 'Safe', color: RISK_COLORS.safe };
  if (score <= 30) return { label: 'Low', color: RISK_COLORS.low };
  if (score <= 60) return { label: 'Medium', color: RISK_COLORS.medium };
  if (score <= 80) return { label: 'High', color: RISK_COLORS.high };
  return { label: 'Critical', color: RISK_COLORS.critical };
}

// ═══════════════════════════════════════
// STATUS
// ═══════════════════════════════════════
async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (!response) return;

    document.getElementById('total-scans').textContent = response.totalScans || 0;
    document.getElementById('shield-enabled').checked = response.enabled;

    // API status
    const apis = [];
    if (response.geminiAvailable) apis.push('Gemini ✅');
    if (response.armorClawAvailable) apis.push('ArmorClaw ✅');
    const apiEl = document.getElementById('api-status');
    if (apis.length > 0) {
      apiEl.textContent = apis.length.toString();
      apiEl.title = apis.join(', ');
    } else {
      apiEl.textContent = 'None';
      apiEl.title = 'No API keys configured — using local firewall only';
    }

    // Update gauge with last scan
    if (response.lastScan) {
      animateGauge(response.lastScan.riskScore);
      document.getElementById('gauge-time').textContent = formatTime(response.lastScan.timestamp);
      document.getElementById('gauge-platform').textContent = response.lastScan.platform || '';
    } else {
      updateGauge(0, 'Safe', RISK_COLORS.safe);
    }
  } catch (e) {
    console.error('Failed to load status:', e);
  }
}

// ═══════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════
async function loadHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_HISTORY', limit: 20 });
    if (!response?.history) return;

    const list = document.getElementById('scan-list');

    if (response.history.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🔍</span>
          <p>No scans yet. Visit an AI platform to start.</p>
        </div>`;
      return;
    }

    // Count blocked
    const blocked = response.history.filter(h => h.riskScore >= 81).length;
    document.getElementById('total-blocked').textContent = blocked;

    list.innerHTML = response.history.map((scan, i) => {
      const level = getRiskLevel(scan.riskScore);
      return `
        <div class="scan-item" style="animation-delay: ${i * 0.05}s">
          <div class="scan-dot" style="background: ${level.color}; box-shadow: 0 0 6px ${level.color}40"></div>
          <div class="scan-info">
            <div class="scan-summary">${escapeHtml(scan.summary || 'Scan completed')}</div>
            <div class="scan-meta">
              <span>${scan.platform || 'unknown'}</span>
              <span>${formatTime(scan.timestamp)}</span>
              <span>${scan.scanTime || 0}ms</span>
            </div>
          </div>
          <div class="scan-score" style="color: ${level.color}">${scan.riskScore}</div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load history:', e);
  }
}

// ═══════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════
async function loadAuditLog() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_AUDIT' });
    if (!response?.auditLog) return;

    const list = document.getElementById('audit-list');

    if (response.auditLog.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>No audit entries yet.</p>
        </div>`;
      return;
    }

    list.innerHTML = response.auditLog.slice(0, 30).map(entry => `
      <div class="audit-item">
        <div class="audit-type">${entry.type || 'unknown'}</div>
        <div class="audit-detail">${formatAuditDetail(entry)}</div>
        <div class="audit-time">${entry.timestamp || ''}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to load audit:', e);
  }
}

function formatAuditDetail(entry) {
  if (entry.type === 'prompt_scan') {
    return `Score: ${entry.riskScore} | ${entry.findings?.length || 0} findings | ${entry.platform || 'unknown'}`;
  }
  if (entry.type === 'execution_decision') {
    return `${entry.tool} → ${entry.decision} (${entry.reason || ''})`;
  }
  return JSON.stringify(entry).substring(0, 80);
}

// ═══════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (!response?.settings) return;
    const s = response.settings;

    document.getElementById('shield-enabled').checked = s.enabled;
    document.getElementById('setting-automask').checked = s.autoMask;
    document.getElementById('setting-blockmode').value = s.blockMode;
    document.getElementById('setting-sensitivity').value = s.sensitivity;
    document.getElementById('setting-sound').checked = s.soundEnabled;
    document.getElementById('setting-xray').checked = s.xrayEnabled;
    document.getElementById('setting-gemini-key').value = s.geminiApiKey || '';
    document.getElementById('setting-armorclaw-key').value = s.armorClawApiKey || '';
    document.getElementById('setting-armoriq-userid').value = s.armoriqUserId || '';
    document.getElementById('setting-armoriq-agentid').value = s.armoriqAgentId || '';
    document.getElementById('setting-armoriq-proxy').value = s.armoriqProxyEndpoint || 'https://customer-proxy.armoriq.ai';
    document.getElementById('setting-armoriq-mode').value = s.armoriqMode || 'mock';
    document.getElementById('sensitivity-label').textContent = SENSITIVITY_LABELS[s.sensitivity] || 'Standard';
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

async function saveSettings(partial) {
  try {
    await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: partial });
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// ═══════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════
function setupEventListeners() {
  // Shield toggle
  document.getElementById('shield-enabled').addEventListener('change', (e) => {
    saveSettings({ enabled: e.target.checked });
  });

  // Auto-mask
  document.getElementById('setting-automask').addEventListener('change', (e) => {
    saveSettings({ autoMask: e.target.checked });
  });

  // Block mode
  document.getElementById('setting-blockmode').addEventListener('change', (e) => {
    saveSettings({ blockMode: e.target.value });
  });

  // Sensitivity
  document.getElementById('setting-sensitivity').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('sensitivity-label').textContent = SENSITIVITY_LABELS[val] || 'Standard';
    saveSettings({ sensitivity: val });
  });

  // Sound
  document.getElementById('setting-sound').addEventListener('change', (e) => {
    saveSettings({ soundEnabled: e.target.checked });
  });

  // X-Ray
  document.getElementById('setting-xray').addEventListener('change', (e) => {
    saveSettings({ xrayEnabled: e.target.checked });
  });

  // Save API keys
  document.getElementById('save-keys').addEventListener('click', () => {
    const geminiKey = document.getElementById('setting-gemini-key').value.trim();
    const armorClawKey = document.getElementById('setting-armorclaw-key').value.trim();
    const armoriqUserId = document.getElementById('setting-armoriq-userid').value.trim();
    const armoriqAgentId = document.getElementById('setting-armoriq-agentid').value.trim();
    const armoriqProxyEndpoint = document.getElementById('setting-armoriq-proxy').value.trim() || 'https://customer-proxy.armoriq.ai';
    const armoriqMode = document.getElementById('setting-armoriq-mode').value || 'mock';
    
    saveSettings({
      geminiApiKey: geminiKey,
      armorClawApiKey: armorClawKey,
      armoriqUserId: armoriqUserId,
      armoriqAgentId: armoriqAgentId,
      armoriqProxyEndpoint: armoriqProxyEndpoint,
      armoriqMode: armoriqMode,
    });

    const btn = document.getElementById('save-keys');
    btn.textContent = '✓ Saved!';
    btn.style.background = 'linear-gradient(135deg, #10b981, #22c55e)';
    setTimeout(() => {
      btn.textContent = 'Save All Keys';
      btn.style.background = '';
    }, 2000);
  });

  // Test ArmorIQ connection
  document.getElementById('test-armoriq').addEventListener('click', async () => {
    const statusEl = document.getElementById('armoriq-status');
    const mode = document.getElementById('setting-armoriq-mode').value || 'mock';
    const apiKey = document.getElementById('setting-armorclaw-key').value.trim();

    // Warn if live mode without API key
    if (mode === 'live' && !apiKey) {
      statusEl.innerHTML = '<span style="color:#f59e0b">⚠️ Live mode requires an ArmorIQ API key (ak_live_...). Enter it above and save first.</span>';
      return;
    }

    const modeIcon = mode === 'live' ? '🌐' : '🔬';
    statusEl.innerHTML = `<span style="color:#f59e0b">⏳ Running ArmorIQ pipeline test (${mode} mode)...</span>`;

    try {
      // Send a mock plan to the service worker to exercise the full pipeline
      const testPlan = [
        { tool: 'read_file', args: { path: '/test/data.txt' }, reasoning: 'Read test data' },
        { tool: 'write_file', args: { path: '/output.txt', content: 'result' }, reasoning: 'Write results' },
      ];

      const result = await chrome.runtime.sendMessage({ type: 'EXECUTE_PLAN', plan: testPlan });

      if (result && !result.error) {
        const method = result.verificationMethod || 'unknown';
        const allowed = result.summary?.allowed || 0;
        const blocked = result.summary?.blocked || 0;
        const tokenId = result.intentTokenId || 'none';
        const isLiveToken = tokenId.startsWith('it_live_');
        const fellBack = mode === 'live' && !isLiveToken;

        let sourceInfo = '';
        if (fellBack) {
          sourceInfo = '<div style="color:#f59e0b">⚠️ Live API failed — used mock fallback</div>';
        } else if (mode === 'live') {
          sourceInfo = '<div style="color:#10b981">🌐 Token from ArmorIQ cloud</div>';
        } else {
          sourceInfo = '<div style="color:#60a5fa">🔬 Token generated locally (mock)</div>';
        }

        statusEl.innerHTML = `
          <span style="color:#10b981">✅ ArmorIQ pipeline working ${modeIcon}</span>
          <div style="font-size:11px; margin-top:4px; color:#9ca3af; line-height:1.5;">
            ${sourceInfo}
            <div>🔐 Method: <strong>${method}</strong></div>
            <div>🎫 Token: <code style="font-size:10px">${tokenId}</code></div>
            <div>✅ Allowed: ${allowed} | 🚫 Blocked: ${blocked}</div>
            <div>📊 Decision: <strong>${result.overallDecision}</strong></div>
          </div>`;
      } else {
        statusEl.innerHTML = `<span style="color:#ef4444">❌ Pipeline error: ${result?.error || 'Unknown'}</span>`;
      }
    } catch (err) {
      statusEl.innerHTML = `<span style="color:#ef4444">❌ Test failed: ${err.message}</span>`;
    }
  });

  // Clear history
  document.getElementById('clear-history').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    await loadHistory();
    await loadAuditLog();
    updateGauge(0, 'Safe', RISK_COLORS.safe);
    document.getElementById('total-scans').textContent = '0';
    document.getElementById('total-blocked').textContent = '0';
  });

  // Export audit
  document.getElementById('export-audit').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_AUDIT' });
    if (!response?.auditLog) return;

    const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptshield-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════
function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
