/**
 * PromptShield — Gemini Engine (Mock)
 * Converts sanitized prompts into structured tool plans
 * Mock for now — swap to real Gemini API when key arrives
 */

async function analyzeWithGemini(text, apiKey) {
  const PS = globalThis.__PROMPTSHIELD__;

  if (!apiKey) {
    PS.log('Gemini API key not set, using mock analysis');
    return mockAnalysis(text);
  }

  // Real Gemini API call (enable when key arrives)
  try {
    PS.log('Sending request to Gemini API...');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildSystemPrompt(text) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    });

    const data = await response.json();
    PS.log('Gemini raw response:', JSON.stringify(data).substring(0, 500) + '...');
    
    if (data.error) {
      throw new Error(data.error.message || 'Gemini API returned an error');
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (content) return JSON.parse(content);
    
    throw new Error('Empty response from Gemini');
  } catch (err) {
    PS.warn('Gemini API error, using mock:', err.message);
    return mockAnalysis(text);
  }
}

function buildSystemPrompt(userText) {
  return `You are a security-aware AI planner. Analyze this user request and output a structured JSON tool plan.

User request: "${userText}"

Output format:
{
  "plan": [
    { "tool": "tool_name", "args": { ... }, "reasoning": "why this step" }
  ],
  "summary": "brief summary",
  "riskAssessment": "low|medium|high|critical"
}

Available tools: read_file, write_file, delete_file, send_email, http_request, execute_command, list_files, search_files, install_package, modify_config, access_database, upload_file.
Only include tools the user actually needs. Be conservative.`;
}

function mockAnalysis(text) {
  const lower = text.toLowerCase();
  const plan = [];

  if (lower.includes('read') || lower.includes('open') || lower.includes('show') || lower.includes('cat')) {
    const pathMatch = text.match(/(?:read|open|show|cat)\s+(.+?)(?:\s+and|\s*$)/i);
    plan.push({ tool: 'read_file', args: { path: pathMatch?.[1]?.trim() || 'file.txt' }, reasoning: 'User wants to read a file' });
  }
  if (lower.includes('write') || lower.includes('save') || lower.includes('create file')) {
    plan.push({ tool: 'write_file', args: { path: 'output.txt' }, reasoning: 'User wants to write a file' });
  }
  if (lower.includes('delete') || lower.includes('remove')) {
    const pathMatch = text.match(/(?:delete|remove)\s+(.+?)(?:\s+and|\s*$)/i);
    plan.push({ tool: 'delete_file', args: { path: pathMatch?.[1]?.trim() || 'file.txt' }, reasoning: 'User wants to delete a file' });
  }
  if (lower.includes('email') || lower.includes('send') || lower.includes('mail')) {
    const toMatch = text.match(/(?:to|email)\s+(\S+@\S+)/i);
    plan.push({ tool: 'send_email', args: { to: toMatch?.[1] || 'unknown@email.com' }, reasoning: 'User wants to send email' });
  }
  if (lower.includes('run') || lower.includes('execute') || lower.includes('command')) {
    plan.push({ tool: 'execute_command', args: { command: 'echo "hello"' }, reasoning: 'User wants to run a command' });
  }

  if (plan.length === 0) {
    plan.push({ tool: 'read_file', args: { path: 'unknown' }, reasoning: 'Default action' });
  }

  return { plan, summary: 'Mock analysis', riskAssessment: 'medium' };
}

if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') globalThis.__PROMPTSHIELD__ = {};
globalThis.__PROMPTSHIELD__.analyzeWithGemini = analyzeWithGemini;
