/**
 * PromptShield — ChatGPT Platform Adapter
 * DOM selectors and interaction logic for chat.openai.com / chatgpt.com
 */

window.__PROMPTSHIELD_PLATFORM__ = {
  id: 'chatgpt',
  name: 'ChatGPT',

  // Multiple fallback selectors (platform updates frequently)
  selectors: {
    inputField: [
      '#prompt-textarea',
      'div[contenteditable="true"][data-placeholder]',
      'div.ProseMirror[contenteditable="true"]',
      'textarea[data-id="root"]',
      'div[id="prompt-textarea"]',
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'form button[type="submit"]',
    ],
    chatContainer: [
      'main',
      'div[role="presentation"]',
    ],
  },

  getInputField() {
    for (const selector of this.selectors.inputField) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  },

  getSendButton() {
    for (const selector of this.selectors.sendButton) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  },

  getPromptText(inputEl) {
    if (!inputEl) return '';
    // ContentEditable divs
    if (inputEl.contentEditable === 'true') {
      return inputEl.innerText || inputEl.textContent || '';
    }
    // Textarea
    return inputEl.value || '';
  },

  setPromptText(inputEl, text) {
    if (!inputEl) return;
    if (inputEl.contentEditable === 'true') {
      inputEl.innerText = text;
      // Trigger React's synthetic events
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },
};
