/**
 * PromptShield — Copilot Platform Adapter
 */
window.__PROMPTSHIELD_PLATFORM__ = {
  id: 'copilot',
  name: 'Copilot',
  selectors: {
    inputField: [
      '#searchbox',
      'textarea.cib-serp-main',
      'textarea[aria-label]',
      '#userInput',
    ],
    sendButton: [
      'button[aria-label="Submit"]',
      'button.submit-button',
      'button[type="submit"]',
    ],
    chatContainer: ['main', '#app'],
  },
  getInputField() {
    for (const s of this.selectors.inputField) { const el = document.querySelector(s); if (el) return el; } return null;
  },
  getSendButton() {
    for (const s of this.selectors.sendButton) { const el = document.querySelector(s); if (el) return el; } return null;
  },
  getPromptText(el) {
    if (!el) return '';
    return el.innerText || el.textContent || el.value || '';
  },
  setPromptText(el, text) {
    if (!el) return;
    if (el.contentEditable === 'true') { el.innerText = text; el.dispatchEvent(new Event('input', { bubbles: true })); }
    else { el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); }
  },
};
