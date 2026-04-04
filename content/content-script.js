  /**
 * PromptShield — Content Script
 * Intercepts prompts on AI platforms, shows overlays, handles X-Ray mode
 */

(function () {
  'use strict';

  const PLATFORM = window.__PROMPTSHIELD_PLATFORM__;
  if (!PLATFORM) {
    console.warn('[PromptShield] No platform adapter loaded — retrying in 1s');
    // Retry once after a delay (platform script may not have loaded yet)
    setTimeout(() => {
      const retryPlatform = window.__PROMPTSHIELD_PLATFORM__;
      if (retryPlatform) {
        console.log('[PromptShield] Platform adapter found on retry');
        startPromptShield(retryPlatform);
      } else {
        console.error('[PromptShield] No platform adapter available');
      }
    }, 1000);
    return;
  }

  startPromptShield(PLATFORM);

  function startPromptShield(platform) {
    console.log(`[PromptShield] Content script loaded for ${platform.name}`);

    let isInitialized = false;
    let currentOverlay = null;
    let lastScanResult = null;
    let settings = null;
    let shieldBadge = null;
    let inputObserver = null;

    // ═══════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════
    async function init() {
      if (isInitialized) return;

      // Get settings
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        settings = response?.settings;
      } catch (e) {
        console.warn('[PromptShield] Could not get settings, using defaults');
      }

      if (!settings) {
        settings = { enabled: true, autoMask: false, blockMode: 'warn', sensitivity: 3, soundEnabled: true, xrayEnabled: true };
      }

      if (!settings.enabled) {
        console.log('[PromptShield] Shield is disabled');
        return;
      }

      // Wait for input field to appear
      waitForElement(() => platform.getInputField(), (inputEl) => {
        console.log(`[PromptShield] Input field found on ${platform.name}:`, inputEl.tagName, inputEl.id || inputEl.className);
        attachInterceptor(inputEl);
        injectShieldBadge(inputEl);
        isInitialized = true;
      });
    }

    // ═══════════════════════════════════════
    // ELEMENT WATCHER
    // ═══════════════════════════════════════
    function waitForElement(finder, callback, maxAttempts = 100) {
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
        } else {
          console.warn('[PromptShield] Input field not found after max attempts');
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
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    // ═══════════════════════════════════════
    // INTERCEPTOR
    // ═══════════════════════════════════════
    function attachInterceptor(inputEl) {
      let debounceTimer = null;

      function onTextChange() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const text = platform.getPromptText(inputEl);
          if (text && text.trim().length > 3) {
            scanAndUpdate(text, inputEl);
          } else {
            clearOverlay();
            updateShieldBadge('safe');
          }
        }, 400);
      }

      // Method 1: Listen for native input events
      inputEl.addEventListener('input', onTextChange);

      // Method 2: Listen for keyup (works on contenteditable)
      inputEl.addEventListener('keyup', onTextChange);

      // Method 3: Listen for paste
      inputEl.addEventListener('paste', () => setTimeout(onTextChange, 100));

      // Method 4: MutationObserver for contenteditable (React/Angular don't fire native input)
      if (inputEl.contentEditable === 'true' || inputEl.tagName !== 'TEXTAREA') {
        inputObserver = new MutationObserver(onTextChange);
        inputObserver.observe(inputEl, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }

      // Intercept form submission
      const form = inputEl.closest('form');
      if (form) {
        form.addEventListener('submit', (e) => {
          if (e.__ps_triggered) return;
          handleSubmit(e, inputEl);
        }, true);
      }

      // Intercept send button click
      const checkSendButton = () => {
        const sendBtn = platform.getSendButton();
        if (sendBtn && !sendBtn.__ps_attached) {
          sendBtn.__ps_attached = true;
          sendBtn.addEventListener('click', (e) => {
            if (e.__ps_triggered) return;
            handleSubmit(e, inputEl);
          }, true);
        }
      };
      checkSendButton();
      // Re-check periodically (button may be re-rendered by React)
      setInterval(checkSendButton, 2000);

      // Intercept Enter key
      inputEl.addEventListener('keydown', (e) => {
        if (e.__ps_triggered) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          handleSubmit(e, inputEl);
        }
      }, true);

      console.log('[PromptShield] Interceptor attached successfully');
    }

    // ═══════════════════════════════════════
    // SCAN & UPDATE
    // ═══════════════════════════════════════
    let extensionDead = false;

    function isExtensionAlive() {
      try {
        return !!chrome.runtime?.id;
      } catch (e) {
        return false;
      }
    }

    async function scanAndUpdate(text, inputEl) {
      if (extensionDead) return;

      try {
        if (!isExtensionAlive()) {
          extensionDead = true;
          console.warn('[PromptShield] Extension context invalidated — please refresh the page');
          if (shieldBadge) shieldBadge.remove();
          return;
        }

        const result = await chrome.runtime.sendMessage({
          type: 'SCAN_PROMPT',
          text,
          platform: platform.id,
          isSubmit: false, // Real-time scan — firewall only, NO Gemini
        });

        if (!result || result.skipped) return;

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
        } else {
          // Clear X-Ray if no findings
          document.querySelectorAll('.ps-xray-tooltip').forEach(el => el.remove());
        }
      } catch (e) {
        if (e.message?.includes('Extension context invalidated') || e.message?.includes('Receiving end does not exist')) {
          extensionDead = true;
          console.warn('[PromptShield] Extension was reloaded — please refresh the page');
          if (shieldBadge) shieldBadge.remove();
        } else {
          console.error('[PromptShield] Scan error:', e.message);
        }
      }
    }

    // ═══════════════════════════════════════
    // SUBMIT HANDLER
    // ═══════════════════════════════════════
    let isSubmitting = false;

    async function handleSubmit(e, inputEl) {
      if (extensionDead || isSubmitting) return;

      const text = platform.getPromptText(inputEl);
      if (!text || text.trim().length < 3) return;

      // Always block the initial default submission so we can do a final synchronous check
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      isSubmitting = true;
      updateShieldBadge('medium'); // Show processing state

      try {
        // Do one final scan — this one triggers Gemini AI analysis
        console.log('[PromptShield] Submit scan — calling Gemini...');
        const result = await chrome.runtime.sendMessage({
          type: 'SCAN_PROMPT',
          text,
          platform: platform.id,
          isSubmit: true, // Submit scan — triggers Gemini
        });

        if (!result || result.skipped) {
          allowSubmit(inputEl);
          return;
        }

        lastScanResult = result;
        const blockThreshold = settings.blockMode === 'block' ? 31 : 81;

        if (result.riskScore >= blockThreshold) {
          // Blocked!
          updateShieldBadge('critical');
          showWarningOverlay(inputEl, result);
          if (settings.soundEnabled) playShieldSound();
          isSubmitting = false;
        } else {
          // Allowed!
          updateShieldBadge('safe');
          allowSubmit(inputEl);
        }
      } catch (err) {
        console.error('[PromptShield] Submit scan failed:', err);
        allowSubmit(inputEl); // Fail open
      }
    }

    function allowSubmit(inputEl) {
      isSubmitting = false;
      const sendBtn = platform.getSendButton();
      
      if (sendBtn) {
        // Try button click with bypass flag
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        clickEvent.__ps_triggered = true;
        sendBtn.dispatchEvent(clickEvent);
      }

      // Try Enter key with bypass flag (React fallback)
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      enterEvent.__ps_triggered = true;
      inputEl.dispatchEvent(enterEvent);
      
      // Clear interval timer if it exists
      clearOverlay();
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

          ${scanResult.executionDecision ? `
          <div class="ps-execution-plan">
            <div class="ps-findings-title">⚡ Execution Plan (${scanResult.executionDecision.overallDecision})</div>
            ${scanResult.executionDecision.results.slice(0, 4).map(r => `
              <div class="ps-finding-item">
                <span class="ps-finding-dot" style="background: ${r.allowed ? '#22c55e' : '#ef4444'}"></span>
                <span class="ps-finding-label">${r.allowed ? '✅' : '🚫'} ${r.tool}</span>
                <span class="ps-finding-value">${truncate(r.reason, 35)}</span>
              </div>
            `).join('')}
            ${scanResult.executionDecision.intentTokenId ? `
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #334155; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;">
                <span title="Generated via Web Crypto SHA-256">🔐 Token: <code style="color:#60a5fa">${scanResult.executionDecision.intentTokenId}</code></span>
                <span style="color: ${scanResult.executionDecision.overallDecision === 'ALLOW' ? '#22c55e' : '#ef4444'}">${scanResult.executionDecision.overallDecision === 'ALLOW' ? 'Verified' : 'Rejected'}</span>
              </div>
            ` : ''}
          </div>
          ` : ''}

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
      overlay.style.left = `${Math.max(10, rect.left)}px`;
      overlay.style.bottom = `${window.innerHeight - rect.top + 10}px`;
      overlay.style.zIndex = '2147483647';
      overlay.style.maxWidth = `${Math.min(450, rect.width)}px`;

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
          platform.setPromptText(inputEl, scanResult.maskedText);
        } else {
          // Generate masked text on the fly
          const text = platform.getPromptText(inputEl);
          let masked = text;
          for (const f of scanResult.findings) {
            if (f.fullMatch && f.maskedValue) {
              masked = masked.replace(f.fullMatch, f.maskedValue);
            }
          }
          platform.setPromptText(inputEl, masked);
        }
        lastScanResult = null;
        clearOverlay();
      });
      overlay.querySelector('#ps-allow').addEventListener('click', () => {
        // Send explicit audit log for user override
        chrome.runtime.sendMessage({ 
          type: 'LOG_AUDIT', 
          entry: { type: 'manual_override', override: true, timestamp: Date.now(), platform: window.location.hostname } 
        });

        lastScanResult = null;
        clearOverlay();
        // Use allowSubmit which sets bypass flag — won't get intercepted again
        allowSubmit(inputEl);
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
        <div class="ps-xray-header">🔍 X-Ray Mode <span style="font-size:9px; opacity:0.8; margin-left:4px">(Click to mask)</span></div>
        ${findings.slice(0, 4).map((f, i) => `
          <div class="ps-xray-item" data-index="${i}" title="Click to instantly mask this secret" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
            <span class="ps-xray-dot" style="background: ${getCategoryColor(f.category)}"></span>
            <span>${f.label}: <code>${truncate(f.maskedValue, 20)}</code></span>
          </div>
        `).join('')}
        ${findings.length > 4 ? `<div class="ps-xray-more">+${findings.length - 4} more</div>` : ''}
      `;

      // Attach click handlers for instant masking
      requestAnimationFrame(() => {
        tooltip.querySelectorAll('.ps-xray-item').forEach(item => {
          item.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            const finding = findings[index];
            if (finding && finding.fullMatch && finding.maskedValue) {
              const currentText = platform.getPromptText(inputEl);
              const newText = currentText.replace(finding.fullMatch, finding.maskedValue);
              platform.setPromptText(inputEl, newText);
              // Tooltip will naturally vanish/update because the prompt change triggers a new scan
            }
          });
        });
      });

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

      document.body.appendChild(shieldBadge);

      // Reposition on scroll/resize
      function updatePosition() {
        const el = platform.getInputField() || inputEl;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return; // element is hidden
        shieldBadge.style.position = 'fixed';
        shieldBadge.style.zIndex = '2147483645';
        shieldBadge.style.right = `${window.innerWidth - r.right + 10}px`;
        shieldBadge.style.top = `${r.top - 35}px`;
      }
      updatePosition();
      window.addEventListener('scroll', updatePosition, { passive: true });
      window.addEventListener('resize', updatePosition, { passive: true });
      setInterval(updatePosition, 2000);

      console.log('[PromptShield] Shield badge injected');
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
        if (inputObserver) {
          inputObserver.disconnect();
          inputObserver = null;
        }
        if (shieldBadge) {
          shieldBadge.remove();
          shieldBadge = null;
        }
        init();
      }
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
})();
