# Implementation Plan: Continuous Problem Rigor Tier (Material Difficulty Calibration)

Safely upgrade the Revision application to calibrate memory stability and procedural mastery based on the intrinsic rigor of attempted practice material (Foundation, Standard JEE Main, Advanced Multi-Concept, or Elite Olympiad) without affecting existing user data.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Zero-Data-Loss Migration**: The master state in `localStorage` (`dsr_v3_master_state`) will remain untouched. All mathematical routines, audit logs, and previews will implicitly default to `rigorTier = 2` (Standard / JEE Main) for any historical data or sessions missing this field.
> - **Rigor Calibration Matrix (`RIGOR_CONFIG`)**:
>   - **Tier 1 (Foundation / Direct)**: $\beta = 1.35$ (strict penalty for basic errors), $\tau_{\text{mult}} = 0.75$, $S_{\text{mult}} = 0.85\times$.
>   - **Tier 2 (Standard / JEE Main)**: $\beta = 1.00$ (baseline linear curve), $\tau_{\text{mult}} = 1.00$, $S_{\text{mult}} = 1.00\times$. (Default for Tier 1 sessions).
>   - **Tier 3 (Advanced / Multi-Concept)**: $\beta = 0.65$ (forgiving curve for complex synthesis), $\tau_{\text{mult}} = 1.75$, $S_{\text{mult}} = 1.20\times$. (Default for Tier 2 & 3 sessions).
>   - **Tier 4 (Elite / Olympiad / Irodov)**: $\beta = 0.45$ (high-strain challenge curve), $\tau_{\text{mult}} = 2.50$, $S_{\text{mult}} = 1.35\times$.
> - **Tier 3 Fail-Safe Relaxation**: For Tier 3 sessions attempting Advanced or Elite material ($\text{rigorTier} \ge 3$), the fail-safe threshold relaxes to $B \le 2$ (instead of $\le 3$) or $\text{wrongTotal} \ge 3$ (instead of $\ge 2$).

---

## 1. Planned Changes

### A. Mathematical Engine (`dsr-engine.js`)
- Expose `RIGOR_CONFIG` mapping.
- Update `evaluateStudySession`:
  - Calculate raw procedural accuracy $P_{\text{true}} = (N_{\text{correct}} + 0.75 \cdot M_{\text{exec}}) / N_{\text{total}}$.
  - Compute rigor-adjusted mastery $P_{\text{adj}} = P_{\text{true}}^{\beta}$.
  - Compute continuous quality grade $Q$ using $P_{\text{adj}}$.
  - Scale target velocity allowance $\tau_{\text{target}} = \text{baseTau} \cdot \tau_{\text{mult}}$.
  - Apply stability expansion bonus: $\text{growth} \propto \dots \times \text{rigor.stabilityBonus}$.
  - Apply relaxed Tier 3 fail-safe escalator.
  - Return `P_adj`, `P_true`, `rigorLabel`, and `rigorMult`.

### B. UI Injection in Modal B (`index.html`)
- Insert **Step 1.5: Problem Material Rigor** between Step 1 (Blank-Page Recall) and Step 2 (Problem Chunk):
  - 4 selectable pills: Tier 1 (Foundation), Tier 2 (Standard), Tier 3 (Advanced), Tier 4 (Elite).
  - Helper sublabel describing grading curve & stability multiplier.
- In Session Outcome Preview Box:
  - Display: `Mastery: [P_adj]% (Raw: [P_true]%) | Rigor Mult: [stabilityBonus]x`.

### C. UI Injection in Modal C (`index.html`)
- Add **Mock Test Toughness** selector below Test Date:
  - Standard (JEE Main), Tough (JEE Advanced), Elite (AITS / Olympiad).

### D. Audit Ledger Integration (`app.js`)
- In `createHumanReadableAuditCard(log)`:
  - Display the selected Rigor Tier badge (e.g. `🎯 Rigor: Advanced (1.20x)`) and adjusted mastery score in the card summary and chips row.
  - Include `rigorTier` and `rigorLabel` in the raw parameters table.

### E. Controller & Auto-Selection Logic (`app.js`)
- In `populatePostStudyDefaults(chapterId)`:
  - Read chapter session tier. If Tier 1, default rigor to Tier 2. If Tier 2 or 3, default rigor to Tier 3.
  - Update live preview on rigor tier selection.

---

## 2. Verification Plan
- Build applet via `compile_applet`.
- Execute Robolectric/unit test suite via `gradle :app:testDebugUnitTest`.
- Confirm offline persistence and fallback stability calculations.
