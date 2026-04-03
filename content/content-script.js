/**
 * PromptShield — Content Script
 * Intercepts prompts on AI platforms, shows overlays, handles X-Ray mode
 */

(function () {
  'use strict';

  const PLATFORM = window.__PROMPTSHIELD_PLATFORM__;
  if (!PLATFORM) {
    console.error('[PromptShield] No platform adapter loaded');
    return;
  }

  console.log(`[PromptShield] Content script loaded for ${PLATFORM.name}`);

  let isInitialized = false;
  let currentOverlay = null;
  let lastScanResult = null;
  let settings = null;
  let shieldBadge = null;

  // ═══════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════
  async function init() {
    if (isInitialized) return;

    // Get settings
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      settings = response.settings;
    } catch (e) {
      settings = { enabled: true, autoMask: false, blockMode: 'warn', sensitivity: 3, soundEnabled: true, xrayEnabled: true };
    }

    if (!settings.enabled) {
      console.log('[PromptShield] Shield is disabled');
      return;
    }

    // Wait for input field to appear
    waitForElement(() => PLATFORM.getInputField(), (inputEl) => {
      console.log(`[PromptShield] Input field found on ${PLATFORM.name}`);
      attachInterceptor(inputEl);
      injectShieldBadge(inputEl);
      isInitialized = true;
    });
  }

  // ═══════════════════════════════════════
  // ELEMENT WATCHER
  // ═══════════════════════════════════════
  function waitForElement(finder, callback, maxAttempts = 50) {
    let attempts = 0;
    const check = () => {
      const el = finder();
      if (el) {
        callback(el);
        return;
      }
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(check, 500);
      }
    };
    check();

    // Also watch for DOM changes (SPA navigation)
    const observer = new MutationObserver(() => {
      const el = finder();
      if (el && !isInitialized) {
        callback(el);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ═══════════════════════════════════════
  // INTERCEPTOR
  // ═══════════════════════════════════════
  function attachInterceptor(inputEl) {
    // Listen for input changes (real-time scanning)
    let debounceTimer = null;
    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const text = PLATFORM.getPromptText(inputEl);
        if (text.length > 5) {
          scanAndUpdate(text, inputEl);
        } else {
          clearOverlay();
          updateShieldBadge('safe');
        }
      }, 300);
    });

    // Intercept form submission
    const form = inputEl.closest('form');
    if (form) {
      form.addEventListener('submit', (e) => handleSubmit(e, inputEl), true);
    }

    // Intercept send button click
    const checkSendButton = () => {
      const sendBtn = PLATFORM.getSendButton();
      if (sendBtn) {
        sendBtn.addEventListener('click', (e) => handleSubmit(e, inputEl), true);
      }
    };
    checkSendButton();
    // Re-check periodically (button may be re-rendered)
    setInterval(checkSendButton, 2000);

    // Intercept Enter key
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        handleSubmit(e, inputEl);
      }
    }, true);
  }

  // ═══════════════════════════════════════
  // SCAN & UPDATE
  // ═══════════════════════════════════════
  async function scanAndUpdate(text, inputEl) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SCAN_PROMPT',
        text,
        platform: PLATFORM.id,
      });

      if (result.skipped) return;

      lastScanResult = result;

      // Update shield badge color
      if (result.riskScore >= 81) updateShieldBadge('critical');
      else if (result.riskScore >= 61) updateShieldBadge('high');
      else if (result.riskScore >= 31) updateShieldBadge('medium');
      else if (result.riskScore > 0) updateShieldBadge('low');
      else updateShieldBadge('safe');

      // Show X-Ray highlights if enabled and findings exist
      if (settings.xrayEnabled && result.findings && result.findings.length > 0) {
        showXRayHighlights(inputEl, result.findings);
      }
    } catch (e) {
      console.error('[PromptShield] Scan error:', e);
    }
  }

  // ═══════════════════════════════════════
  // SUBMIT HANDLER
  // ═══════════════════════════════════════
  function handleSubmit(e, inputEl) {
    if (!lastScanResult || lastScanResult.riskScore < 31) return; // Allow safe prompts

    const blockThreshold = settings.blockMode === 'block' ? 31 : 81;

    if (lastScanResult.riskScore >= blockThreshold) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      showWarningOverlay(inputEl, lastScanResult);

      // Play sound
      if (settings.soundEnabled) {
        playShieldSound();
      }
    }
  }

  // ═══════════════════════════════════════
  // WARNING OVERLAY
  // ═══════════════════════════════════════
  function showWarningOverlay(inputEl, scanResult) {
    clearOverlay();

    const overlay = document.createElement('div');
    overlay.className = 'ps-overlay';
    overlay.innerHTML = `
      <div class="ps-overlay-inner">
        <div class="ps-overlay-header">
          <div class="ps-overlay-icon">🛡️</div>
          <div class="ps-overlay-title">PromptShield Alert</div>
          <button class="ps-overlay-close" id="ps-close">✕</button>
        </div>

        <div class="ps-risk-bar">
          <div class="ps-risk-fill" style="width: ${scanResult.riskScore}%; background: ${scanResult.riskLevel.color}"></div>
          <span class="ps-risk-text">${scanResult.riskScore}/100 — ${scanResult.riskLevel.label}</span>
        </div>

        <div class="ps-findings">
          <div class="ps-findings-title">${scanResult.findings.length} issue${scanResult.findings.length > 1 ? 's' : ''} found:</div>
          ${scanResult.findings.slice(0, 5).map(f => `
            <div class="ps-finding-item">
              <span class="ps-finding-dot" style="background: ${getCategoryColor(f.category)}"></span>
              <span class="ps-finding-label">${f.label}</span>
              <span class="ps-finding-value">${truncate(f.maskedValue, 30)}</span>
            </div>
          `).join('')}
          ${scanResult.findings.length > 5 ? `<div class="ps-finding-more">+${scanResult.findings.length - 5} more</div>` : ''}
        </div>

        <div class="ps-actions">
          <button class="ps-btn ps-btn-block" id="ps-block">Block</button>
          <button class="ps-btn ps-btn-mask" id="ps-mask">Mask & Send</button>
          <button class="ps-btn ps-btn-allow" id="ps-allow">Send Anyway</button>
        </div>
      </div>
    `;

    // Position near the input field
    const rect = inputEl.getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left}px`;
    overlay.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    overlay.style.zIndex = '2147483647';

    document.body.appendChild(overlay);
    currentOverlay = overlay;

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('ps-overlay-visible'));

    // Button handlers
    overlay.querySelector('#ps-close').addEventListener('click', clearOverlay);
    overlay.querySelector('#ps-block').addEventListener('click', () => {
      clearOverlay();
    });
    overlay.querySelector('#ps-mask').addEventListener('click', () => {
      if (scanResult.maskedText) {
        PLATFORM.setPromptText(inputEl, scanResult.maskedText);
      } else {
        // Generate masked text on the fly
        const text = PLATFORM.getPromptText(inputEl);
        let masked = text;
        for (const f of scanResult.findings) {
          if (f.fullMatch && f.maskedValue) {
            masked = masked.replace(f.fullMatch, f.maskedValue);
          }
        }
        PLATFORM.setPromptText(inputEl, masked);
      }
      lastScanResult = null;
      clearOverlay();
    });
    overlay.querySelector('#ps-allow').addEventListener('click', () => {
      lastScanResult = null;
      clearOverlay();
      // Re-trigger send
      const sendBtn = PLATFORM.getSendButton();
      if (sendBtn) setTimeout(() => sendBtn.click(), 100);
    });
  }

  // ═══════════════════════════════════════
  // X-RAY HIGHLIGHTS
  // ═══════════════════════════════════════
  function showXRayHighlights(inputEl, findings) {
    // Remove existing highlights
    document.querySelectorAll('.ps-xray-tooltip').forEach(el => el.remove());

    if (!findings || findings.length === 0) return;

    // Create a floating tooltip showing detected items
    const tooltip = document.createElement('div');
    tooltip.className = 'ps-xray-tooltip';
    tooltip.innerHTML = `
      <div class="ps-xray-header">🔍 X-Ray Mode</div>
      ${findings.slice(0, 4).map(f => `
        <div class="ps-xray-item">
          <span class="ps-xray-dot" style="background: ${getCategoryColor(f.category)}"></span>
          <span>${f.label}: <code>${truncate(f.maskedValue, 20)}</code></span>
        </div>
      `).join('')}
    `;

    const rect = inputEl.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.right = `${window.innerWidth - rect.right}px`;
    tooltip.style.bottom = `${window.innerHeight - rect.top + 5}px`;
    tooltip.style.zIndex = '2147483646';

    document.body.appendChild(tooltip);
    requestAnimationFrame(() => tooltip.classList.add('ps-xray-visible'));
  }

  // ═══════════════════════════════════════
  // SHIELD BADGE
  // ═══════════════════════════════════════
  function injectShieldBadge(inputEl) {
    if (shieldBadge) return;

    shieldBadge = document.createElement('div');
    shieldBadge.className = 'ps-shield-badge ps-shield-safe';
    shieldBadge.innerHTML = '🛡️';
    shieldBadge.title = 'PromptShield Active';

    const rect = inputEl.getBoundingClientRect();
    shieldBadge.style.position = 'fixed';
    shieldBadge.style.zIndex = '2147483645';

    document.body.appendChild(shieldBadge);

    // Reposition on scroll/resize
    function updatePosition() {
      const r = inputEl.getBoundingClientRect();
      shieldBadge.style.right = `${window.innerWidth - r.right + 10}px`;
      shieldBadge.style.top = `${r.top - 30}px`;
    }
    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    setInterval(updatePosition, 1000);
  }

  function updateShieldBadge(state) {
    if (!shieldBadge) return;
    shieldBadge.className = `ps-shield-badge ps-shield-${state}`;
  }

  // ═══════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════
  function clearOverlay() {
    if (currentOverlay) {
      currentOverlay.classList.remove('ps-overlay-visible');
      setTimeout(() => currentOverlay?.remove(), 300);
      currentOverlay = null;
    }
    document.querySelectorAll('.ps-xray-tooltip').forEach(el => el.remove());
  }

  function getCategoryColor(category) {
    const colors = {
      api_key: '#ef4444', password: '#ef4444', private_key: '#ef4444',
      connection_string: '#ef4444', env_variable: '#f97316', jwt_token: '#f97316',
      credit_card: '#ef4444', ssn: '#ef4444', high_entropy: '#f59e0b',
      ip_address: '#22c55e', email_leak: '#22c55e', phone_number: '#f59e0b',
    };
    return colors[category] || '#94a3b8';
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  function playShieldSound() {
    try {
      const audio = new Audio(chrome.runtime.getURL('assets/sounds/shield-activate.mp3'));
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore autoplay errors
    } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════
  // START
  // ═══════════════════════════════════════
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-init on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      isInitialized = false;
      init();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
