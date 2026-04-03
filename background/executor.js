/**
 * PromptShield — Executor
 * Simulates tool execution for demo (only allowed steps)
 */

function executeStep(step, decision) {
  const PS = globalThis.__PROMPTSHIELD__;
  if (!decision.allowed) {
    return { executed: false, reason: decision.reason, tool: step.tool };
  }

  // Simulated execution results
  const results = {
    read_file: () => ({ output: `[Simulated] Contents of ${step.args?.path || 'file'}`, success: true }),
    write_file: () => ({ output: `[Simulated] Written to ${step.args?.path || 'file'}`, success: true }),
    list_files: () => ({ output: '[Simulated] file1.txt, file2.js, config.json', success: true }),
    search_files: () => ({ output: '[Simulated] Found 3 matches', success: true }),
    send_email: () => ({ output: `[Simulated] Email sent to ${step.args?.to || 'unknown'}`, success: true }),
    http_request: () => ({ output: `[Simulated] GET ${step.args?.url || 'unknown'} → 200 OK`, success: true }),
    execute_command: () => ({ output: `[Simulated] $ ${step.args?.command || 'unknown'}`, success: true }),
  };

  const executor = results[step.tool] || (() => ({ output: `[Simulated] ${step.tool} executed`, success: true }));
  return { executed: true, ...executor(), tool: step.tool };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.executeStep = executeStep;
