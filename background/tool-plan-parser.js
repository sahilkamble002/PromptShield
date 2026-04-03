/**
 * PromptShield — Tool Plan Parser
 * Validates and enriches structured action plans
 */

function parseToolPlan(rawPlan) {
  const PS = globalThis.__PROMPTSHIELD__;
  if (!rawPlan || !rawPlan.plan || !Array.isArray(rawPlan.plan)) {
    return { valid: false, error: 'Invalid plan format', steps: [] };
  }

  const steps = rawPlan.plan.map((step, i) => {
    const toolRisk = PS.TOOL_RISK[step.tool] || 'unknown';
    return {
      index: i,
      tool: step.tool || 'unknown',
      args: step.args || {},
      reasoning: step.reasoning || '',
      riskLevel: toolRisk,
      valid: !!step.tool,
    };
  });

  return {
    valid: steps.every(s => s.valid),
    steps,
    summary: rawPlan.summary || '',
    riskAssessment: rawPlan.riskAssessment || 'unknown',
    stepCount: steps.length,
  };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.parseToolPlan = parseToolPlan;
