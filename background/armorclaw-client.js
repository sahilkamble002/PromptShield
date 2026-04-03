/**
 * PromptShield — ArmorClaw Client (Black Box)
 * Clean interface — plug in API key when available
 */

class ArmorClawClient {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.armoriq.ai/v1';
    this.timeout = 3000;
  }

  isAvailable() {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async requestIntentToken(plan) {
    if (!this.isAvailable()) return null;
    // When API key is ready, implement real call:
    // POST /intent-tokens { plan, planHash: sha256(plan) }
    // Returns: { token, plan_hash, steps[], expires_at }
    return this._mockIntentToken(plan);
  }

  async verifyStep(token, step) {
    if (!this.isAvailable() || !token) return null;
    // When API key is ready, implement real call:
    // POST /verify { token, step }
    // Returns: { allowed, reason, proof }
    return this._mockVerifyStep(token, step);
  }

  _mockIntentToken(plan) {
    return {
      token: 'mock_token_' + Date.now(),
      plan_hash: 'mock_hash',
      steps: plan.map((s, i) => ({ id: `step_${i}`, tool: s.tool, proof: 'mock_proof' })),
      expires_at: new Date(Date.now() + 60000).toISOString(),
      issued_by: 'mock_armoriq',
    };
  }

  _mockVerifyStep(token, step) {
    return { allowed: true, reason: 'Mock verification passed', proof: 'mock_proof' };
  }
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.ArmorClawClient = ArmorClawClient;
