/**
 * PromptShield — Prompt Firewall Engine
 * Main scan engine: regex + entropy + keywords + adversarial detection
 * Zero browser dependencies — portable to VS Code / npm
 */

// ═══════════════════════════════════════════
// MAIN SCAN FUNCTION
// ═══════════════════════════════════════════

/**
 * Scan a prompt for sensitive data
 * @param {string} text - User's prompt text
 * @param {object} options - Scan options
 * @param {boolean} options.enableMasking - Generate masked version
 * @param {number} options.sensitivity - 1-5 sensitivity level
 * @returns {object} Scan result
 */
function scanPrompt(text, options = {}) {
  const PS = globalThis.__PROMPTSHIELD__;
  const sensitivity = PS.SENSITIVITY[options.sensitivity || 3];
  const startTime = performance.now();

  if (!text || text.trim().length === 0) {
    return createEmptyResult();
  }

  const findings = [];

  // ── Phase 1: Direct pattern matching ──────
  const patternFindings = scanPatterns(text, sensitivity);
  findings.push(...patternFindings);

  // ── Phase 2: Entropy scoring ──────────────
  const entropyFindings = scanEntropy(text, sensitivity.entropyThreshold);
  // Don't double-count if already found by patterns
  for (const ef of entropyFindings) {
    if (!isOverlapping(ef, findings)) {
      findings.push(ef);
    }
  }

  // ── Phase 3: Adversarial bypass detection ─
  const adversarialFindings = scanAdversarial(text, sensitivity);
  for (const af of adversarialFindings) {
    if (!isOverlapping(af, findings)) {
      findings.push(af);
    }
  }

  // ── Phase 4: Keyword context boost ────────
  boostKeywordContext(text, findings);

  // ── Phase 5: Calculate aggregate risk ─────
  const riskScore = calculateAggregateRisk(findings);

  // ── Phase 6: Generate masked text ─────────
  let maskedText = null;
  if (options.enableMasking && findings.length > 0) {
    maskedText = generateMaskedText(text, findings);
  }

  const scanTime = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    riskScore,
    riskLevel: PS.getRiskLevel(riskScore),
    findings: findings.sort((a, b) => b.weight - a.weight),
    maskedText,
    categories: [...new Set(findings.map(f => f.category))],
    summary: generateSummary(findings, riskScore),
    metadata: {
      scanTime,
      textLength: text.length,
      findingCount: findings.length,
      patternsChecked: PS.PATTERNS.length,
      timestamp: Date.now(),
    },
  };
}

// ═══════════════════════════════════════════
// PATTERN SCANNING
// ═══════════════════════════════════════════
function scanPatterns(text, sensitivity) {
  const PS = globalThis.__PROMPTSHIELD__;
  const findings = [];

  for (const pattern of PS.PATTERNS) {
    // Skip patterns below sensitivity threshold
    if (pattern.weight < sensitivity.minPatternWeight) continue;

    // Reset regex state
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const value = pattern.captureGroup
        ? match[pattern.captureGroup] || match[0]
        : match[0];

      // Check exclusion patterns
      if (pattern.exclude && pattern.exclude.test(value)) continue;

      // Context-dependent patterns
      if (pattern.requiresContext) {
        const surroundingText = text.substring(
          Math.max(0, match.index - 50),
          Math.min(text.length, match.index + match[0].length + 50)
        ).toLowerCase();
        const hasContext = pattern.contextKeywords.some(kw =>
          surroundingText.includes(kw)
        );
        if (!hasContext) continue;
      }

      findings.push({
        id: pattern.id,
        category: pattern.category,
        label: pattern.label,
        description: pattern.description || pattern.label,
        value: value,
        maskedValue: PS.maskValue(value, pattern.maskPrefix || 0),
        weight: pattern.weight,
        start: match.index,
        end: match.index + match[0].length,
        fullMatch: match[0],
        source: 'pattern',
      });
    }
  }

  return deduplicateFindings(findings);
}

// ═══════════════════════════════════════════
// ENTROPY SCANNING
// ═══════════════════════════════════════════
function scanEntropy(text, threshold) {
  const PS = globalThis.__PROMPTSHIELD__;
  const highEntropy = PS.findHighEntropyStrings(text, threshold);
  const findings = [];

  for (const he of highEntropy) {
    findings.push({
      id: 'high_entropy_' + he.start,
      category: 'high_entropy',
      label: 'High Entropy String',
      description: `Suspicious random string (entropy: ${he.entropy})`,
      value: he.value,
      maskedValue: PS.maskValue(he.value, 4),
      weight: Math.min(75, Math.round(he.entropy * 12)),
      start: he.start,
      end: he.end,
      fullMatch: he.value,
      source: 'entropy',
      entropy: he.entropy,
    });
  }

  return findings;
}

// ═══════════════════════════════════════════
// ADVERSARIAL SCANNING
// ═══════════════════════════════════════════
function scanAdversarial(text, sensitivity) {
  const PS = globalThis.__PROMPTSHIELD__;
  const bypasses = PS.detectAdversarialBypasses(text);
  const findings = [];

  for (const bypass of bypasses) {
    // Re-scan the decoded content for patterns
    const decodedFindings = scanPatterns(bypass.decoded, sensitivity);

    if (decodedFindings.length > 0) {
      for (const df of decodedFindings) {
        findings.push({
          ...df,
          id: `adversarial_${bypass.type}_${bypass.start}`,
          label: `${df.label} (${bypass.type} encoded)`,
          description: `${df.description} — hidden via ${bypass.type} encoding`,
          start: bypass.start,
          end: bypass.end,
          fullMatch: bypass.encoded,
          weight: Math.min(100, df.weight + 5), // slight boost for evasion attempt
          source: 'adversarial',
          encoding: bypass.type,
          decodedValue: bypass.decoded,
        });
      }
    } else {
      // Even if no pattern matched, the decoded content is suspicious
      findings.push({
        id: `adversarial_${bypass.type}_${bypass.start}`,
        category: 'high_entropy',
        label: `Encoded Content (${bypass.type})`,
        description: `Suspicious ${bypass.type}-encoded content detected`,
        value: bypass.decoded.substring(0, 50),
        maskedValue: PS.maskValue(bypass.decoded, 4),
        weight: 65,
        start: bypass.start,
        end: bypass.end,
        fullMatch: bypass.encoded,
        source: 'adversarial',
        encoding: bypass.type,
        decodedValue: bypass.decoded,
      });
    }
  }

  return findings;
}

// ═══════════════════════════════════════════
// KEYWORD CONTEXT BOOST
// ═══════════════════════════════════════════
function boostKeywordContext(text, findings) {
  const PS = globalThis.__PROMPTSHIELD__;
  const lowerText = text.toLowerCase();

  // Count how many sensitive keywords appear in the text
  let keywordCount = 0;
  for (const keyword of PS.SENSITIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      keywordCount++;
    }
  }

  // Boost finding weights if many keywords present
  if (keywordCount >= 3) {
    for (const finding of findings) {
      finding.weight = Math.min(100, finding.weight + keywordCount * 2);
    }
  }
}

// ═══════════════════════════════════════════
// RISK SCORE CALCULATION
// ═══════════════════════════════════════════
function calculateAggregateRisk(findings) {
  if (findings.length === 0) return 0;

  // Dominant finding model:
  // Score = max(weights) + logarithmic boost for multiple findings
  const maxWeight = Math.max(...findings.map(f => f.weight));
  const countBoost = Math.round(10 * Math.log2(findings.length + 1));

  return Math.min(100, maxWeight + countBoost);
}

// ═══════════════════════════════════════════
// TEXT MASKING
// ═══════════════════════════════════════════
function generateMaskedText(text, findings) {
  // Sort findings by start position (descending) to replace from end to start
  const sorted = [...findings]
    .filter(f => f.start !== undefined && f.end !== undefined)
    .sort((a, b) => b.start - a.start);

  let masked = text;
  const applied = new Set();

  for (const finding of sorted) {
    const key = `${finding.start}-${finding.end}`;
    if (applied.has(key)) continue;
    applied.add(key);

    const before = masked.substring(0, finding.start);
    const after = masked.substring(finding.end);
    masked = before + finding.maskedValue + after;
  }

  return masked;
}

// ═══════════════════════════════════════════
// SUMMARY GENERATION
// ═══════════════════════════════════════════
function generateSummary(findings, riskScore) {
  const PS = globalThis.__PROMPTSHIELD__;

  if (findings.length === 0) {
    return { text: 'No sensitive data detected', safe: true };
  }

  const level = PS.getRiskLevel(riskScore);
  const categories = [...new Set(findings.map(f => f.category))];
  const catLabels = categories.map(c => PS.CATEGORY_META[c]?.label || c);

  return {
    text: `${findings.length} issue${findings.length > 1 ? 's' : ''} found: ${catLabels.join(', ')}`,
    safe: false,
    level: level.label,
    icon: level.icon,
    count: findings.length,
    topCategory: catLabels[0],
  };
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function isOverlapping(finding, existingFindings) {
  return existingFindings.some(
    ef => finding.start < ef.end && finding.end > ef.start
  );
}

function deduplicateFindings(findings) {
  const seen = new Map();
  for (const f of findings) {
    const key = `${f.start}-${f.end}`;
    if (!seen.has(key) || f.weight > seen.get(key).weight) {
      seen.set(key, f);
    }
  }
  return [...seen.values()];
}

function createEmptyResult() {
  const PS = globalThis.__PROMPTSHIELD__;
  return {
    riskScore: 0,
    riskLevel: PS.RISK_LEVELS.NONE,
    findings: [],
    maskedText: null,
    categories: [],
    summary: { text: 'No input to scan', safe: true },
    metadata: {
      scanTime: 0,
      textLength: 0,
      findingCount: 0,
      patternsChecked: 0,
      timestamp: Date.now(),
    },
  };
}

// ═══════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════
if (typeof globalThis.__PROMPTSHIELD__ === 'undefined') {
  globalThis.__PROMPTSHIELD__ = {};
}

Object.assign(globalThis.__PROMPTSHIELD__, {
  scanPrompt,
  scanPatterns,
  scanEntropy,
  scanAdversarial,
  calculateAggregateRisk,
  generateMaskedText,
  generateSummary,
});
