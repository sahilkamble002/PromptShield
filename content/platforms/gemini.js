/**
 * PromptShield — Gemini Platform Adapter
 */
window.__PROMPTSHIELD_PLATFORM__ = {
  id: 'gemini',
  name: 'Gemini',
  selectors: {
    inputField: [
      '.ql-editor[contenteditable="true"]',
      'rich-textarea div[contenteditable="true"]',
      'div.textarea[contenteditable="true"]',
      '.input-area [contenteditable="true"]',
    ],
    sendButton: [
      'button[aria-label="Send message"]',
      'button.send-button',
      '.input-area button[mattooltip="Send"]',
      'button[aria-label="Submit"]',
    ],
    chatContainer: ['main', '.chat-container'],
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
