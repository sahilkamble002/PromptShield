/**
 * PromptShield — Root Service Worker
 * Loads all modules then starts the orchestrator
 */

// Load core modules (order matters — all paths relative to extension root)
importScripts(
  'core/constants.js',
  'core/risk-patterns.js',
  'core/prompt-firewall.js',
  'core/policies.js',
  'core/fallback-guard.js',
  'background/armorclaw-client.js',
  'background/decision-engine.js',
  'background/gemini-engine.js',
  'background/tool-plan-parser.js',
  'background/executor.js',
  'background/audit-logger.js',
  'background/service-worker.js'
);
