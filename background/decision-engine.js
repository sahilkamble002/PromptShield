/**
 * PromptShield — Decision Engine
 * Routes decisions through ArmorClaw (primary) → Fallback Guard (backup)
 */

async function decidePlan(plan, settings) {
  const PS = globalThis.__PROMPTSHIELD__;
  const armorClaw = new PS.ArmorClawClient(settings?.armorClawApiKey);
  const results = [];
  let usedArmorClaw = false;

  // Try ArmorClaw first
  let intentToken = null;
  if (armorClaw.isAvailable()) {
    try {
      intentToken = await armorClaw.requestIntentToken(plan);
      usedArmorClaw = true;
      PS.log('ArmorClaw intent token received');
    } catch (err) {
      PS.warn('ArmorClaw token request failed, falling back:', err.message);
    }
  }

  // Evaluate each step
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    let result = null;

    // Try ArmorClaw verification
    if (usedArmorClaw && intentToken) {
      try {
        const acResult = await armorClaw.verifyStep(intentToken, step);
        if (acResult) {
          result = { ...acResult, source: 'armorclaw', stepIndex: i, step };
        }
      } catch (err) {
        PS.warn(`ArmorClaw verify failed for step ${i}, falling back:`, err.message);
      }
    }

    // Fallback guard (always available)
    if (!result) {
      result = { ...PS.evaluateStep(step), source: 'fallback_guard', stepIndex: i, step };
    }

    results.push(result);
  }

  const blocked = results.filter(r => !r.allowed);
  const allowed = results.filter(r => r.allowed);
  let overallDecision = blocked.length === 0 ? 'ALLOW' : allowed.length === 0 ? 'BLOCK' : 'PARTIAL';

  return {
    overallDecision,
    overallAllowed: blocked.length === 0,
    results,
    verificationMethod: usedArmorClaw ? 'armorclaw' : 'fallback_guard',
    summary: { total: plan.length, allowed: allowed.length, blocked: blocked.length },
  };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.decidePlan = decidePlan;
