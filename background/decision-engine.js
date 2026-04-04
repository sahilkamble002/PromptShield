/**
 * PromptShield — Decision Engine
 * Routes decisions: ArmorIQ (primary) → Fallback Guard (backup)
 * Fail-closed: if BOTH fail, block execution
 */

async function decidePlan(plan, settings) {
  const PS = globalThis.__PROMPTSHIELD__;
  const results = [];
  let usedArmorIQ = false;
  let intentToken = null;

  // Build ArmorIQ config from settings
  const armorConfig = {
    apiKey: settings?.armorClawApiKey || '',
    userId: settings?.armoriqUserId || 'promptshield-user',
    agentId: settings?.armoriqAgentId || 'promptshield-agent',
    proxyEndpoint: settings?.armoriqProxyEndpoint || 'https://customer-proxy.armoriq.ai',
  };

  const armorIQ = new PS.ArmorClawClient(armorConfig);

  // ── Step 1: Try ArmorIQ intent token ──────────────
  if (armorIQ.isAvailable()) {
    try {
      PS.log('🔐 ArmorIQ available — requesting intent token...');
      intentToken = await armorIQ.requestIntentToken(plan);
      usedArmorIQ = true;
      PS.log('🔐 ArmorIQ intent token received:', intentToken?.id || 'ok');
    } catch (err) {
      PS.warn('🔐 ArmorIQ token failed, falling back to local guard:', err.message);
      usedArmorIQ = false;
    }
  } else {
    PS.log('🔐 ArmorIQ not configured — using local Fallback Guard');
  }

  // ── Step 2: Evaluate each step ────────────────────
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    let result = null;

    // Try ArmorIQ verification first
    if (usedArmorIQ && intentToken) {
      try {
        const acResult = await armorIQ.verifyStep(intentToken, step, i);
        if (acResult) {
          result = {
            ...acResult,
            source: 'armoriq',
            stepIndex: i,
            step,
          };
        }
      } catch (err) {
        PS.warn(`🔐 ArmorIQ verify failed for step ${i} (${step.tool}), falling back:`, err.message);
        // result stays null → falls through to fallback guard
      }
    }

    // Fallback Guard (always available, zero dependencies)
    if (!result) {
      const fbResult = PS.evaluateStep(step);
      result = {
        ...fbResult,
        source: 'fallback_guard',
        stepIndex: i,
        step,
      };
      if (usedArmorIQ) {
        PS.log(`⚡ Fallback Guard used for step ${i} (${step.tool}): ${fbResult.allowed ? 'ALLOW' : 'BLOCK'}`);
      }
    }

    results.push(result);
  }

  // ── Step 3: Compute overall decision ──────────────
  const blocked = results.filter(r => !r.allowed);
  const allowed = results.filter(r => r.allowed);

  let overallDecision;
  if (blocked.length === 0) {
    overallDecision = 'ALLOW';
  } else if (allowed.length === 0) {
    overallDecision = 'BLOCK';
  } else {
    overallDecision = 'PARTIAL';
  }

  // Log summary
  const verificationMethod = usedArmorIQ ? 'armoriq' : 'fallback_guard';
  PS.log(`🔐 Decision: ${overallDecision} | Method: ${verificationMethod} | ${allowed.length} allowed, ${blocked.length} blocked`);

  return {
    overallDecision,
    overallAllowed: blocked.length === 0,
    results,
    verificationMethod,
    intentTokenId: intentToken?.id || null,
    runId: armorIQ.runId || null,
    summary: {
      total: plan.length,
      allowed: allowed.length,
      blocked: blocked.length,
    },
  };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.decidePlan = decidePlan;
