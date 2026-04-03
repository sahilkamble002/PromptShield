# PromptShield — Browser Extension Implementation Plan (v2 — Final)

## All Decisions Resolved ✅

| Decision | Answer |
|----------|--------|
| ArmorClaw | Black box — clean interface, plug in later |
| Gemini API | Mock for now, API key coming in hours |
| Target platforms | ChatGPT (first) → Gemini → Copilot → Claude (4 total) |
| Blocking behavior | **Option C** — configurable (hard block OR warn+mask) |
| Masking (`***`) | **Optional** — user toggles in settings |
| VS Code future | Yes — shared `core/` module from day one |
| Live Risk Gauge | ✅ Yes |
| Sound Effects | ✅ Yes |
| Export Audit | ✅ Yes (JSON) |
| X-Ray Mode | ✅ Yes |
| Adversarial Bypass | ✅ Yes (base64, ROT13, split strings) |
| Policy Editor | ✅ Yes (in popup settings) |
| Context-Aware Scan | Deferred — discuss later |

---

## ⏱️ Realistic Time Estimates (With AI Coding Assist)

The 10-11h estimate was for **manual coding**. With me generating the code, here's the real timeline:

| Phase | What | Manual | With Me | Details |
|-------|------|--------|---------|---------|
| **1** | Extension skeleton + Prompt Firewall + Core | 2.5h | **45 min** | manifest, content script, firewall engine, patterns |
| **2** | Popup Dashboard UI | 2h | **30 min** | Dark theme, animated gauge, glassmorphism |
| **3** | ArmorClaw mock + Fallback Guard | 1.5h | **25 min** | Interface, rules engine, decision logic |
| **4** | Gemini mock + Tool Plan parser | 1h | **15 min** | Mock engine, JSON parser |
| **5** | Execution + Audit Logging + Export | 1h | **20 min** | Executor, logger, JSON export |
| **6** | X-Ray, Sound, Multi-platform, Overlays | 1.5h | **35 min** | Injector, 4 platform selectors, UX polish |
| **7** | Demo scenarios + Testing | 1h | **20 min** | Test prompts, unit tests |
| | **TOTAL** | **~10.5h** | **~3-3.5h** | |

> [!TIP]
> **Realistic wall-clock: ~3.5-4 hours** including review, loading/testing the extension, and minor fixes. That's very doable for a hackathon day.

---

## 🚀 Pipeline Latency Analysis (Real Demo)

This is what the user experiences when they type a prompt and hit send:

### Per-Stage Latency

| Stage | Operation | Latency | Type |
|-------|-----------|---------|------|
| **1** Content Script → Service Worker | Message passing | **~5ms** | Local |
| **2** Prompt Firewall scan | Regex + entropy + keywords | **~15-30ms** | Local CPU |
| **3** Adversarial bypass detection | Base64/ROT13 decode + rescan | **~5-10ms** | Local CPU |
| **4** Gemini API call | Network → LLM reasoning → response | **~800-2000ms** | Network ⚡ |
| **5** Tool Plan parsing | JSON parse + risk enrichment | **~3ms** | Local |
| **6A** ArmorClaw API | Token request + verification | **~200-500ms** | Network ⚡ |
| **6B** Fallback Guard | Deterministic rules check | **~2ms** | Local |
| **7** Decision Engine | Allow/block logic | **~1ms** | Local |
| **8** Audit Logging | Write to chrome.storage | **~5ms** | Local I/O |
| **9** UI Update | Badge + popup refresh | **~10ms** | Local DOM |

### Total Latency by Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  MODE 1: Firewall Only (Current — no APIs)                      │
│  ═══════════════════════════════                                │
│  Content Script → Firewall → Decision → UI                     │
│  Total: ~30-50ms ✅ INSTANT (user won't notice)                │
│                                                                 │
│  MODE 2: Firewall + Gemini (after API key)                      │
│  ═════════════════════════════════════════                      │
│  Content Script → Firewall → Gemini → Plan → Fallback → UI    │
│  Total: ~850-2100ms ⚡ 1-2 seconds                             │
│                                                                 │
│  MODE 3: Full Pipeline (Firewall + Gemini + ArmorClaw)          │
│  ═══════════════════════════════════════════════════            │
│  Content Script → Firewall → Gemini → Plan → ArmorClaw → UI   │
│  Total: ~1050-2600ms ⚡ 1-2.5 seconds                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Latency Optimization Strategies

> [!TIP]
> **For the hackathon demo, Mode 1 is the star.** The firewall scans at ~30ms — effectively instant. This is impressive because it means zero delay for the user.

| Strategy | Impact | How |
|----------|--------|-----|
| **Parallel scanning** | -30% on firewall | Run regex, entropy, keyword checks concurrently |
| **Streaming Gemini** | -40% perceived | Show "analyzing..." while Gemini responds |
| **Cache policies** | -50% on ArmorClaw | Cache policy decisions for repeated tool types |
| **Two-phase UX** | Best UX | Phase 1: instant firewall result → Phase 2: background execution check |

### Recommended UX Flow for Demo

```
User types: "My DB_PASSWORD=abc123, read /etc/passwd"
    │
    ├─ [INSTANT ~30ms] Shield turns RED
    │   └─ X-Ray underlines: DB_PASSWORD=abc123 (red), /etc/passwd (orange)
    │   └─ Risk Score: 92 ← gauge animates
    │   └─ 🔊 Shield sound plays
    │
    ├─ [User sees warning overlay]
    │   └─ "2 security issues found"
    │   └─ [Mask & Send] [Block] [Send Anyway]
    │
    ├─ If user clicks "Mask & Send":
    │   └─ Prompt becomes: "My DB_PASSWORD=***, read [BLOCKED_PATH]"
    │   └─ [~1-2s background] Gemini + ArmorClaw verify execution
    │
    └─ Audit log entry created
```

> [!IMPORTANT]
> **Key insight for judges:** The firewall is LOCAL and INSTANT. It doesn't call any API. This means it works offline, has zero latency, and never sends your secrets to any server. That's a major security advantage over cloud-based prompt scanners.

---

## Architecture (Updated)

```
d:\ext\HackByte\
├── manifest.json
│
├── core/                          # 🔥 SHARED — portable to VS Code
│   ├── prompt-firewall.js         # Scan engine (regex, entropy, keywords)
│   ├── risk-patterns.js           # Detection patterns + adversarial bypass
│   ├── fallback-guard.js          # Deterministic rule engine
│   ├── policies.js                # Security policies + matcher
│   └── constants.js               # Thresholds, categories, tool lists
│
├── background/                    # Chrome service worker layer
│   ├── service-worker.js          # Main orchestrator
│   ├── gemini-engine.js           # Gemini API (mocked for now)
│   ├── tool-plan-parser.js        # JSON action plan parser
│   ├── armorclaw-client.js        # ArmorClaw API (black box interface)
│   ├── decision-engine.js         # ArmorClaw → Fallback routing
│   ├── executor.js                # Safe execution
│   └── audit-logger.js            # Full audit trail
│
├── content/                       # Injected into AI sites
│   ├── content-script.js          # Prompt interception
│   ├── injector.js                # Shield overlay + X-Ray mode
│   └── platforms/                 # Per-platform selectors
│       ├── chatgpt.js
│       ├── gemini.js
│       ├── copilot.js
│       └── claude.js
│
├── popup/                         # Extension popup dashboard
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
│
├── assets/
│   ├── icons/
│   ├── sounds/
│   │   └── shield-activate.mp3
│   └── fonts/
│
└── tests/
    ├── firewall.test.js
    ├── fallback.test.js
    └── test-prompts.json
```

---

## Platform-Specific Selectors

Each AI platform has different DOM structure. We isolate selectors per platform:

| Platform | Input Selector | Send Button | Notes |
|----------|---------------|-------------|-------|
| **ChatGPT** | `#prompt-textarea` / `textarea[data-id]` | `button[data-testid="send-button"]` | ContentEditable div |
| **Gemini** | `.ql-editor` / `rich-textarea` | `.send-button` | Uses Quill-like editor |
| **Copilot** | `#searchbox` / `textarea` | Submit button | Bing-based |
| **Claude** | `div[contenteditable]` / `.ProseMirror` | `button[aria-label="Send"]` | ProseMirror editor |

> [!NOTE]
> These selectors can break when platforms update. We use multiple fallback selectors per platform and MutationObserver for dynamic DOM changes.

---

## Verification Plan

### Automated
```bash
node tests/firewall.test.js      # Prompt firewall accuracy
node tests/fallback.test.js      # Fallback guard decisions
```

### Browser Testing (via browser tool)
1. Load unpacked extension in Chrome
2. Navigate to ChatGPT
3. Run through all 6 demo scenarios
4. Verify popup gauge, X-Ray, overlays, audit log
5. Test settings toggles (mask on/off, block behavior)

### Demo Readiness Checklist
- [ ] Extension loads without errors
- [ ] Shield icon appears on all 4 platforms
- [ ] Firewall detects API keys, passwords, .env values
- [ ] X-Ray mode highlights secrets with colors
- [ ] Risk gauge animates correctly
- [ ] Sound plays on block
- [ ] Audit log shows all decisions
- [ ] Export to JSON works
- [ ] Settings persist across sessions
- [ ] Fallback guard blocks dangerous paths
- [ ] ArmorClaw mock returns expected responses

---

## Build Priority Order

```
Start ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ [DEMO-READY MVP]
                                       │
                                       ├──→ Phase 4 (when Gemini key arrives)
                                       ├──→ Phase 5
                                       └──→ Phase 6 + 7 ──→ [FULL PRODUCT]
```

> [!IMPORTANT]
> **After Phase 3, you have a fully demo-able product.** Phases 4-7 add depth but the core story is already there: "We catch secrets instantly and block dangerous actions."
