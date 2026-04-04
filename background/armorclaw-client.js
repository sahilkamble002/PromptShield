/**
 * PromptShield — ArmorIQ Client (Local Mock)
 * Simulates the full ArmorIQ intent-verification pipeline locally:
 *   capture_plan → get_intent_token → invoke/verify
 *
 * All cryptographic operations (SHA-256 hashing, Merkle trees) run
 * in-browser via Web Crypto API — zero network calls.
 *
 * For production: replace with real @armoriq/sdk integration
 * pointing at https://customer-proxy.armoriq.ai
 */

class ArmorClawClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.userId = config.userId || 'promptshield-user';
    this.agentId = config.agentId || 'promptshield-agent';
    this.proxyEndpoint = config.proxyEndpoint || 'https://customer-proxy.armoriq.ai';
    this.mode = 'mock'; // 'mock' | 'live' — always mock for now
    this.currentToken = null;
    this.runId = null;
    this.capturedPlan = null;
    this._auditTrail = [];
  }

  /**
   * Mock is always available — simulates a fully configured ArmorIQ client
   */
  isAvailable() {
    return true;
  }

  // ═══════════════════════════════════════════
  // CRYPTO HELPERS (real SHA-256, simulated Merkle)
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

  /**
   * Build a Merkle tree from leaf data, returning root hash + per-leaf proofs
   */
  async _buildMerkleTree(leaves) {
    if (leaves.length === 0) return { root: '0'.repeat(64), proofs: [] };

    // Hash all leaves
    const leafHashes = await Promise.all(
      leaves.map(leaf => this._sha256(typeof leaf === 'string' ? leaf : JSON.stringify(leaf)))
    );

    // Generate per-step proofs (siblings along the path to root)
    const proofs = leafHashes.map((hash, i) => {
      const siblings = leafHashes.filter((_, j) => j !== i);
      return {
        index: i,
        leaf: hash,
        path: siblings.slice(0, 3), // simplified proof path
      };
    });

    // Compute root by pairwise hashing up the tree
    let level = [...leafHashes];
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || left; // duplicate if odd count
        next.push(await this._sha256(left + right));
      }
      level = next;
    }

    return { root: level[0], proofs };
  }

  // ═══════════════════════════════════════════
  // STEP 1: capture_plan()  — local validation only
  // ═══════════════════════════════════════════

  capturePlan(llm, prompt, plan) {
    const PS = globalThis.__PROMPTSHIELD__;

    if (!plan || !Array.isArray(plan) || plan.length === 0) {
      throw new Error('Invalid plan: must be a non-empty array of steps');
    }

    // Normalize PromptShield plan into ArmorIQ format
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
        source: 'promptshield-mock',
      },
    };

    PS.log(`🔐 [ArmorIQ·Mock] Plan captured: ${normalizedPlan.steps.length} steps`);
    return this.capturedPlan;
  }

  // ═══════════════════════════════════════════
  // STEP 2: get_intent_token()  — cryptographic proof (local)
  // ═══════════════════════════════════════════

  async getIntentToken(planCapture) {
    const PS = globalThis.__PROMPTSHIELD__;
    planCapture = planCapture || this.capturedPlan;

    if (!planCapture || !planCapture.plan) {
      throw new Error('No captured plan — call capturePlan() first');
    }

    this.runId = this._generateRunId();
    const now = Math.floor(Date.now() / 1000);

    // Compute plan hash (real SHA-256)
    const planHash = await this._sha256(planCapture.plan);

    // Build Merkle tree from step action data
    const stepLeaves = planCapture.plan.steps.map(s =>
      JSON.stringify({ action: s.action, mcp: s.mcp, params: s.params })
    );
    const merkle = await this._buildMerkleTree(stepLeaves);

    // Simulate Ed25519 signature (hash of token payload)
    const tokenPayload = {
      planHash,
      merkleRoot: merkle.root,
      userId: this.userId,
      agentId: this.agentId,
      issuedAt: now,
      expiresAt: now + 60,
    };
    const signature = await this._sha256(tokenPayload);

    // Construct token (mirrors IntentToken from ArmorIQ SDK docs)
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
    };

    this.currentToken = token;

    // Simulate slight latency (30-80ms)
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
      tokenId,
      planHash: planHash.slice(0, 16),
      stepCount: planCapture.plan.steps.length,
      timestamp: Date.now(),
    });

    return token;
  }

  // ═══════════════════════════════════════════
  // STEP 3: verifyStep()  — CSRG proof check + policy
  // ═══════════════════════════════════════════

  async verifyStep(token, step, stepIndex = 0) {
    const PS = globalThis.__PROMPTSHIELD__;
    token = token || this.currentToken;
    if (!token) return null;

    // ── Check token expiration ──
    const now = Math.floor(Date.now() / 1000);
    if (now > token.expiresAt) {
      PS.warn(`🔐 [ArmorIQ·Mock] Token EXPIRED (${now - token.expiresAt}s ago)`);
      return {
        allowed: false,
        reason: '[ArmorIQ] Intent token expired — re-capture plan required',
        riskLevel: 'critical',
        source: 'armoriq_mock',
        tokenId: token.id,
        verified: false,
      };
    }

    // ── Verify Merkle proof exists for this step ──
    const proof = token.stepProofs?.[stepIndex];
    const proofValid = !!proof;

    // ── Compute CSRG headers (simulated) ──
    const csrgPath = `/steps/[${stepIndex}]/action`;
    const actionValue = step.tool || step.action || 'unknown';
    const valueDigest = await this._sha256(actionValue);

    // ── Use Fallback Guard for actual risk assessment ──
    const fbResult = PS.evaluateStep(step);

    // Combine: proof must exist AND policy must allow
    const allowed = proofValid && fbResult.allowed;
    const reason = !proofValid
      ? `Step [${stepIndex}] not in verified plan (no Merkle proof)`
      : fbResult.reason;

    // Simulate slight latency (15-45ms)
    await new Promise(r => setTimeout(r, 15 + Math.random() * 30));

    const result = {
      allowed,
      reason: `[ArmorIQ] ${reason}`,
      proof: proof ? proof.leaf : null,
      proofPath: csrgPath,
      riskLevel: fbResult.riskLevel || (allowed ? 'low' : 'high'),
      source: 'armoriq_mock',
      tokenId: token.id,
      verified: proofValid,
      csrg: {
        path: csrgPath,
        valueDigest: valueDigest.slice(0, 16),
        proofValid,
      },
    };

    PS.log(
      `🔐 [ArmorIQ·Mock] Step [${stepIndex}] ${actionValue} → ` +
      `${allowed ? '✅ VERIFIED' : '🚫 BLOCKED'} ` +
      `| proof: ${proofValid ? '✓' : '✗'} ` +
      `| policy: ${fbResult.allowed ? 'allow' : 'deny'} ` +
      `| risk: ${result.riskLevel}`
    );

    this._auditTrail.push({
      type: 'step_verified',
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
  // Combines capturePlan + getIntentToken in one call
  // ═══════════════════════════════════════════

  async requestIntentToken(plan) {
    const PS = globalThis.__PROMPTSHIELD__;

    try {
      this.capturePlan('gemini', '', plan);
      const token = await this.getIntentToken();
      return token;
    } catch (err) {
      PS.warn('🔐 [ArmorIQ·Mock] Intent token request failed:', err.message);
      throw err;
    }
  }

  // ═══════════════════════════════════════════
  // HEALTH CHECK (always healthy in mock mode)
  // ═══════════════════════════════════════════

  async healthCheck() {
    return {
      healthy: true,
      message: 'ArmorIQ Mock — local cryptographic verification active',
      mode: 'mock',
      version: '1.0.0-mock',
      proxyEndpoint: this.proxyEndpoint,
    };
  }

  // ═══════════════════════════════════════════
  // AUDIT TRAIL (local, in-memory)
  // ═══════════════════════════════════════════

  async getAuditTrail() {
    return this._auditTrail;
  }
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.ArmorClawClient = ArmorClawClient;
