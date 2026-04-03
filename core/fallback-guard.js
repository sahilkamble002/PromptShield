/**
 * PromptShield — Fallback Guard
 * Deterministic rule engine — no AI, no network
 * Zero browser dependencies
 */

function evaluateStep(step, policies) {
  const PS = globalThis.__PROMPTSHIELD__;
  if (!step || !step.tool) {
    return { allowed: false, reason: 'Invalid step: missing tool', riskLevel: 'critical' };
  }

  // 1. Check tool risk classification
  const toolRisk = PS.TOOL_RISK[step.tool] || 'unknown';
  if (toolRisk === 'unknown') {
    return { allowed: false, reason: `Unknown tool: ${step.tool}`, riskLevel: 'high' };
  }

  // 2. Match against policies
  const activePolicies = policies || PS.DEFAULT_POLICIES;
  const match = PS.matchPolicy(step, activePolicies);

  if (match) {
    if (match.action === 'deny') {
      return { allowed: false, reason: match.reason, riskLevel: match.severity || 'high', policyId: match.id };
    }
    if (match.action === 'allow') {
      return { allowed: true, reason: match.reason, riskLevel: 'info', policyId: match.id };
    }
  }

  // 3. Default rules (no policy matched)
  // Critical tools need explicit allow policy
  if (toolRisk === 'critical') {
    return { allowed: false, reason: `Critical tool "${step.tool}" requires explicit policy`, riskLevel: 'critical' };
  }

  // High risk tools — warn but allow
  if (toolRisk === 'high') {
    return { allowed: true, reason: `High-risk tool "${step.tool}" — no blocking policy found`, riskLevel: 'high', warning: true };
  }

  // Medium / low risk — allow
  return { allowed: true, reason: `Tool "${step.tool}" allowed (risk: ${toolRisk})`, riskLevel: toolRisk };
}

function evaluatePlan(plan, policies) {
  const PS = globalThis.__PROMPTSHIELD__;
  const results = [];
  let overallAllowed = true;

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const result = evaluateStep(step, policies);
    results.push({ stepIndex: i, step, ...result });
    if (!result.allowed) overallAllowed = false;
  }

  const blocked = results.filter(r => !r.allowed);
  const allowed = results.filter(r => r.allowed);

  let overallDecision;
  if (blocked.length === 0) overallDecision = 'ALLOW';
  else if (allowed.length === 0) overallDecision = 'BLOCK';
  else overallDecision = 'PARTIAL';

  return {
    overallDecision,
    overallAllowed,
    results,
    summary: {
      total: plan.length,
      allowed: allowed.length,
      blocked: blocked.length,
      blockedReasons: blocked.map(b => b.reason),
    },
  };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
Object.assign(globalThis.__PROMPTSHIELD__, { evaluateStep, evaluatePlan });
