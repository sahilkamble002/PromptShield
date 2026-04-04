/**
 * PromptShield — ArmorIQ Client (Mock + Live)
 *
 * Dual-mode intent verification:
 *   • mock  — all crypto runs locally via Web Crypto API (zero network calls)
 *   • live  — real API calls to https://customer-proxy.armoriq.ai
 *             with automatic fallback to mock on failure
 *
 * Flow: capture_plan → get_intent_token → verify_step
 */

class ArmorClawClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.userId = config.userId || 'promptshield-user';
    this.agentId = config.agentId || 'promptshield-agent';
    this.proxyEndpoint = (config.proxyEndpoint || 'https://customer-proxy.armoriq.ai').replace(/\/+$/, '');
    this.mode = config.mode || 'mock'; // 'mock' | 'live'
    this.timeout = 8000; // 8s for live API calls
    this.currentToken = null;
    this.runId = null;
    this.capturedPlan = null;
    this._auditTrail = [];
  }

  /**
   * Check if client is ready to operate
   * Mock: always available | Live: needs API key
   */
  isAvailable() {
    if (this.mode === 'live') return !!this.apiKey && this.apiKey.length > 0;
    return true;
  }

  // ═══════════════════════════════════════════
  // CRYPTO HELPERS (shared by mock + live)
  // ═══════════════════════════════════════════

  _generateRunId() {
    return crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }

  async _sha256(data) {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(typeof data === 'string' ? data : JSON.stringify(data));
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async _buildMerkleTree(leaves) {
    if (leaves.length === 0) return { root: '0'.repeat(64), proofs: [] };

    const leafHashes = await Promise.all(
      leaves.map(leaf => this._sha256(typeof leaf === 'string' ? leaf : JSON.stringify(leaf)))
    );

    const proofs = leafHashes.map((hash, i) => {
      const siblings = leafHashes.filter((_, j) => j !== i);
      return { index: i, leaf: hash, path: siblings.slice(0, 3) };
    });

    let level = [...leafHashes];
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || left;
        next.push(await this._sha256(left + right));
      }
      level = next;
    }

    return { root: level[0], proofs };
  }

  // ═══════════════════════════════════════════
  // LIVE API HELPER — authenticated fetch to ArmorIQ proxy
  // ═══════════════════════════════════════════

  async _liveRequest(path, body, method = 'POST') {
    const PS = globalThis.__PROMPTSHIELD__;
    const url = `${this.proxyEndpoint}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      PS.log(`🌐 [ArmorIQ·Live] ${method} ${path}`);

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        signal: controller.signal,
      };

      if (body && method === 'POST') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      // Try to parse JSON response
      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        const errMsg = data?.error?.message || data?.message || data?.detail || `HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`ArmorIQ proxy timed out (${this.timeout / 1000}s)`);
      }
      throw err;
    }
  }

  // ═══════════════════════════════════════════
  // STEP 1: capture_plan()  — always local (both modes)
  // ═══════════════════════════════════════════

  capturePlan(llm, prompt, plan) {
    const PS = globalThis.__PROMPTSHIELD__;
    const modeLabel = this.mode === 'live' ? 'Live' : 'Mock';

    if (!plan || !Array.isArray(plan) || plan.length === 0) {
      throw new Error('Invalid plan: must be a non-empty array of steps');
    }

    // Normalize PromptShield plan into ArmorIQ SDK format
    const normalizedPlan = {
      goal: `PromptShield security verification for ${plan.length} action(s)`,
      steps: plan.map((step, i) => ({
        action: step.tool || step.action || `step_${i}`,
        mcp: 'promptshield-mcp',
        params: step.args || step.params || {},
        description: step.reasoning || step.description || '',
      })),
    };

    this.capturedPlan = {
      plan: normalizedPlan,
      llm: llm || 'gemini',
      prompt: prompt || '',
      metadata: {
        capturedAt: Date.now(),
        agentId: this.agentId,
        userId: this.userId,
        source: `promptshield-${this.mode}`,
      },
    };

    PS.log(`🔐 [ArmorIQ·${modeLabel}] Plan captured: ${normalizedPlan.steps.length} steps`);
    return this.capturedPlan;
  }

  // ═══════════════════════════════════════════
  // STEP 2: get_intent_token()  — routes to mock or live
  // Live auto-falls back to mock on failure
  // ═══════════════════════════════════════════

  async getIntentToken(planCapture) {
    const PS = globalThis.__PROMPTSHIELD__;

    if (this.mode === 'live') {
      try {
        return await this._getIntentTokenLive(planCapture);
      } catch (err) {
        PS.warn(`🌐 [ArmorIQ·Live] Token request failed: ${err.message} — falling back to mock`);
        return await this._getIntentTokenMock(planCapture);
      }
    }

    return await this._getIntentTokenMock(planCapture);
  }

  // ── Live: POST /token/issue to ArmorIQ proxy ──

  async _getIntentTokenLive(planCapture) {
    const PS = globalThis.__PROMPTSHIELD__;
    planCapture = planCapture || this.capturedPlan;

    if (!planCapture || !planCapture.plan) {
      throw new Error('No captured plan — call capturePlan() first');
    }

    this.runId = this._generateRunId();

    const requestBody = {
      plan: planCapture.plan,
      llm: planCapture.llm,
      prompt: planCapture.prompt,
      userId: this.userId,
      agentId: this.agentId,
      metadata: {
        ...planCapture.metadata,
        runId: this.runId,
      },
    };

    PS.log('🌐 [ArmorIQ·Live] Requesting intent token from proxy...');
    const result = await this._liveRequest('/token/issue', requestBody);

    // Normalize response — handle both Python (snake_case) and JS (camelCase) field names
    const token = {
      id: result.tokenId || result.token_id || result.id || `it_live_${this.runId.slice(0, 8)}`,
      tokenId: result.tokenId || result.token_id || result.id,
      token: result.token,
      planHash: result.planHash || result.plan_hash,
      merkleRoot: result.merkleRoot || result.merkle_root,
      signature: result.signature,
      issuedAt: result.issuedAt || result.issued_at,
      expiresAt: result.expiresAt || result.expires_at,
      stepProofs: result.stepProofs || result.step_proofs || [],
      policy: result.policy || { allow: ['*'], deny: [] },
      rawToken: result,
      success: true,
      _source: 'live',
    };

    this.currentToken = token;

    const ttl = token.expiresAt ? token.expiresAt - Math.floor(Date.now() / 1000) : '?';
    PS.log(
      `🌐 [ArmorIQ·Live] Intent token received: ${token.id} ` +
      `| hash: ${(token.planHash || '').slice(0, 12)}… ` +
      `| root: ${(token.merkleRoot || '').slice(0, 12)}… ` +
      `| ${token.stepProofs.length} proofs ` +
      `| expires: ${ttl}s`
    );

    this._auditTrail.push({
      type: 'token_issued',
      mode: 'live',
      tokenId: token.id,
      planHash: (token.planHash || '').slice(0, 16),
      stepCount: planCapture.plan.steps.length,
      timestamp: Date.now(),
    });

    return token;
  }

  // ── Mock: generate token locally (all crypto in-browser) ──

  async _getIntentTokenMock(planCapture) {
    const PS = globalThis.__PROMPTSHIELD__;
    planCapture = planCapture || this.capturedPlan;

    if (!planCapture || !planCapture.plan) {
      throw new Error('No captured plan — call capturePlan() first');
    }

    this.runId = this.runId || this._generateRunId();
    const now = Math.floor(Date.now() / 1000);

    const planHash = await this._sha256(planCapture.plan);

    const stepLeaves = planCapture.plan.steps.map(s =>
      JSON.stringify({ action: s.action, mcp: s.mcp, params: s.params })
    );
    const merkle = await this._buildMerkleTree(stepLeaves);

    const tokenPayload = {
      planHash,
      merkleRoot: merkle.root,
      userId: this.userId,
      agentId: this.agentId,
      issuedAt: now,
      expiresAt: now + 60,
    };
    const signature = await this._sha256(tokenPayload);

    const tokenId = `it_mock_${this.runId.slice(0, 8)}`;
    const token = {
      id: tokenId,
      tokenId,
      token: `mock.${btoa(JSON.stringify(tokenPayload)).replace(/=/g, '')}.${signature.slice(0, 32)}`,
      planHash,
      merkleRoot: merkle.root,
      signature,
      issuedAt: now,
      expiresAt: now + 60,
      stepProofs: merkle.proofs,
      policy: { allow: ['*'], deny: [] },
      rawToken: tokenPayload,
      success: true,
      _source: 'mock',
    };

    this.currentToken = token;

    await new Promise(r => setTimeout(r, 30 + Math.random() * 50));

    PS.log(
      `🔐 [ArmorIQ·Mock] Intent token issued: ${tokenId} ` +
      `| hash: ${planHash.slice(0, 12)}… ` +
      `| root: ${merkle.root.slice(0, 12)}… ` +
      `| ${merkle.proofs.length} proofs ` +
      `| expires: 60s`
    );

    this._auditTrail.push({
      type: 'token_issued',
      mode: 'mock',
      tokenId,
      planHash: planHash.slice(0, 16),
      stepCount: planCapture.plan.steps.length,
      timestamp: Date.now(),
    });

    return token;
  }

  // ═══════════════════════════════════════════
  // STEP 3: verifyStep()  — CSRG proof check + policy
  // Same logic for both modes (token already obtained)
  // ═══════════════════════════════════════════

  async verifyStep(token, step, stepIndex = 0) {
    const PS = globalThis.__PROMPTSHIELD__;
    token = token || this.currentToken;
    if (!token) return null;

    const source = token._source || this.mode;
    const modeLabel = source === 'live' ? 'Live' : 'Mock';

    // ── Check token expiration ──
    const now = Math.floor(Date.now() / 1000);
    if (token.expiresAt && now > token.expiresAt) {
      PS.warn(`🔐 [ArmorIQ·${modeLabel}] Token EXPIRED (${now - token.expiresAt}s ago)`);
      return {
        allowed: false,
        reason: '[ArmorIQ] Intent token expired — re-capture plan required',
        riskLevel: 'critical',
        source: `armoriq_${source}`,
        tokenId: token.id,
        verified: false,
      };
    }

    // ── Verify Merkle proof exists for this step ──
    const proof = token.stepProofs?.[stepIndex];
    const proofValid = !!proof;

    // ── Compute CSRG headers ──
    const csrgPath = `/steps/[${stepIndex}]/action`;
    const actionValue = step.tool || step.action || 'unknown';
    const valueDigest = await this._sha256(actionValue);

    // ── Use Fallback Guard for risk assessment ──
    const fbResult = PS.evaluateStep(step);

    // Combine: proof must exist AND policy must allow
    const allowed = proofValid && fbResult.allowed;
    const reason = !proofValid
      ? `Step [${stepIndex}] not in verified plan (no Merkle proof)`
      : fbResult.reason;

    if (source === 'mock') {
      await new Promise(r => setTimeout(r, 15 + Math.random() * 30));
    }

    const result = {
      allowed,
      reason: `[ArmorIQ] ${reason}`,
      proof: proof ? proof.leaf : null,
      proofPath: csrgPath,
      riskLevel: fbResult.riskLevel || (allowed ? 'low' : 'high'),
      source: `armoriq_${source}`,
      tokenId: token.id,
      verified: proofValid,
      csrg: {
        path: csrgPath,
        valueDigest: valueDigest.slice(0, 16),
        proofValid,
      },
    };

    const icon = source === 'live' ? '🌐' : '🔐';
    PS.log(
      `${icon} [ArmorIQ·${modeLabel}] Step [${stepIndex}] ${actionValue} → ` +
      `${allowed ? '✅ VERIFIED' : '🚫 BLOCKED'} ` +
      `| proof: ${proofValid ? '✓' : '✗'} ` +
      `| policy: ${fbResult.allowed ? 'allow' : 'deny'} ` +
      `| risk: ${result.riskLevel}`
    );

    this._auditTrail.push({
      type: 'step_verified',
      mode: source,
      tokenId: token.id,
      stepIndex,
      tool: actionValue,
      allowed,
      proofValid,
      riskLevel: result.riskLevel,
      timestamp: Date.now(),
    });

    return result;
  }

  // ═══════════════════════════════════════════
  // CONVENIENCE: requestIntentToken (backward compat)
  // ═══════════════════════════════════════════

  async requestIntentToken(plan) {
    const PS = globalThis.__PROMPTSHIELD__;
    const modeLabel = this.mode === 'live' ? 'Live' : 'Mock';

    try {
      this.capturePlan('gemini', '', plan);
      const token = await this.getIntentToken();
      return token;
    } catch (err) {
      PS.warn(`🔐 [ArmorIQ·${modeLabel}] Intent token request failed:`, err.message);
      throw err;
    }
  }

  // ═══════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════

  async healthCheck() {
    if (this.mode === 'mock') {
      return {
        healthy: true,
        message: 'ArmorIQ Mock — local cryptographic verification active',
        mode: 'mock',
        proxyEndpoint: this.proxyEndpoint,
      };
    }

    // Live: actually ping the proxy
    if (!this.apiKey) {
      return { healthy: false, message: 'No API key configured', mode: 'live' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.proxyEndpoint}/health`, {
        headers: { 'X-API-Key': this.apiKey },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data = {};
      try { data = await response.json(); } catch { /* ignore */ }

      if (response.ok) {
        return {
          healthy: true,
          message: 'Connected to ArmorIQ proxy',
          mode: 'live',
          proxyEndpoint: this.proxyEndpoint,
          serverInfo: data,
        };
      }

      return {
        healthy: false,
        message: `ArmorIQ proxy returned HTTP ${response.status}`,
        mode: 'live',
        detail: data?.message || data?.error || '',
      };
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'ArmorIQ proxy timed out (5s)'
        : err.message;
      return { healthy: false, message: msg, mode: 'live' };
    }
  }

  // ═══════════════════════════════════════════
  // AUDIT TRAIL
  // ═══════════════════════════════════════════

  async getAuditTrail() {
    return this._auditTrail;
  }
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.ArmorClawClient = ArmorClawClient;
