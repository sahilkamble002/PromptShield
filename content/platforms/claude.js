/**
 * PromptShield — Claude Platform Adapter
 */
window.__PROMPTSHIELD_PLATFORM__ = {
  id: 'claude',
  name: 'Claude',
  selectors: {
    inputField: [
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"].is-editor-empty',
      'div[contenteditable="true"]',
      'fieldset div[contenteditable="true"]',
    ],
    sendButton: [
      'button[aria-label="Send Message"]',
      'button[aria-label="Send message"]',
      'button[type="button"]:has(svg)',
      'fieldset button:last-child',
    ],
    chatContainer: ['main', '.conversation-container'],
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
