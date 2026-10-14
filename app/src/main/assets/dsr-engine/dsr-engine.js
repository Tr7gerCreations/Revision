/**
 * Dynamic DSR v3.0 — Cognitive Revision Engine
 * Exact Continuous-State Mathematical Engine Specification
 */

const DSREngine = (function () {
  const clamp = (min, max, val) => Math.max(min, Math.min(max, val));

  // 1. Personal Calibration Factor
  function getTheta(chapter, settings) {
    const d0 = Number(chapter.D0) || 5.0;
    const thetaLogic = Number(settings.thetaLogic) || 1.0;
    const thetaRote = Number(settings.thetaRote) || 1.0;
    return d0 <= 5.0 ? thetaLogic : thetaRote;
  }

  // 2. Dynamic Decay Exponent (w_d) & Self-Normalizing Factor (F_d)
  function getDecayParams(D) {
    const validD = clamp(1.0, 10.0, Number(D) || 5.0);
    const wd = 0.25 + 0.045 * validD;
    const Fd = Math.pow(0.90, -1 / wd) - 1;
    return { wd, Fd };
  }

  // 3. Real-Time Retrievability R(t) at elapsed fractional days t
  function getRetrievability(chapter, settings, nowMs = Date.now()) {
    const lastTs = Number(chapter.lastReviewTimestamp) || Number(chapter.createdAt) || nowMs;
    const elapsedDays = Math.max(0, (nowMs - lastTs) / (1000 * 60 * 60 * 24));
    const { wd, Fd } = getDecayParams(chapter.D);
    const S = Number(chapter.S) || 1.0;
    const effectiveS = Math.max(0.1, S * getTheta(chapter, settings));
    const R = Math.pow(1 + Fd * (elapsedDays / effectiveS), -wd);
    return { R: clamp(0.01, 1.0, R), elapsedDays };
  }

  // 4. Dynamic Target Retention (R_req) with Exam Countdown Ramp
  function getEffectiveTargetRetention(settings, nowMs = Date.now()) {
    const examMs = new Date(settings.examDate).getTime();
    const startMs = new Date(settings.prepStartDate || "2026-01-01").getTime();
    const daysToExam = (examMs - nowMs) / (1000 * 60 * 60 * 24);
    if (daysToExam <= 0) return 0.95;
    const totalPrepDays = Math.max(30, (examMs - startMs) / (1000 * 60 * 60 * 24));
    const progress = clamp(0, 1, 1 - (daysToExam / totalPrepDays));
    const base = Number(settings.targetRetentionBase) || 0.90;
    // Ramps smoothly up to +0.05 (max 0.95) as exam approaches
    return clamp(0.75, 0.95, base + 0.05 * progress);
  }

  // 5. Next Interval Calculation I(S, D) with Exam Horizon Compression
  function calculateNextIntervalDays(chapter, settings, nowMs = Date.now()) {
    const { wd, Fd } = getDecayParams(chapter.D);
    const R_req = getEffectiveTargetRetention(settings, nowMs);
    const S = Number(chapter.S) || 1.0;
    const effectiveS = S * getTheta(chapter, settings);
    let rawInterval = (effectiveS / Fd) * (Math.pow(R_req, -1 / wd) - 1);

    // Horizon Compression if interval exceeds exam date
    const examMs = new Date(settings.examDate).getTime();
    const daysToExam = (examMs - nowMs) / (1000 * 60 * 60 * 24);
    if (daysToExam > 2 && rawInterval > daysToExam) {
      rawInterval = Math.max(1, daysToExam * 0.78);
    }
    return Math.max(1, Math.round(rawInterval * 10) / 10);
  }

  // 6. Adaptive Session Tier & Prescribed Protocol
  function getSessionTier(S) {
    const valS = Number(S) || 1.0;
    if (valS < 14) {
      return {
        tier: 1,
        name: "Tier 1 · Full Rebuild",
        durationMins: 50,
        taskSummary: "10m Blank-Page + 2m Audit + 20 Core Problems",
        recommendedProblems: 20,
        blankPageMins: 10
      };
    } else if (valS < 40) {
      return {
        tier: 2,
        name: "Tier 2 · Focused Drill",
        durationMins: 30,
        taskSummary: "6m Fault-Line Map + 1m Audit + 10 Hard Problems",
        recommendedProblems: 10,
        blankPageMins: 6
      };
    } else {
      return {
        tier: 3,
        name: "Tier 3 · Lightning Audit",
        durationMins: 15,
        taskSummary: "4m Formula Sprint + 5 Elite Multi-Concept Problems",
        recommendedProblems: 5,
        blankPageMins: 4
      };
    }
  }

  // 7. Day-0 New Chapter Initialization
  function calculateInitialStability(D0, initialQ = 4.0) {
    const sBaseMap = { 1: 0.5, 2: 1.0, 3: 1.5, 4: 3.2, 5: 4.5 };
    const sBase = sBaseMap[Math.round(initialQ)] || 3.2;
    const d0Val = clamp(1.0, 10.0, Number(D0) || 5.0);
    const S1 = sBase * Math.exp(-0.12 * (d0Val - 1));
    return Math.max(0.5, Math.round(S1 * 100) / 100);
  }

  // 8. Priority Triage Score P_i for Morning Queue Sorting
  function calculatePriorityScore(chapter, settings, nowMs = Date.now()) {
    const { R, elapsedDays } = getRetrievability(chapter, settings, nowMs);
    const R_req = getEffectiveTargetRetention(settings, nowMs);
    const overdueRatio = (1 - R) / Math.max(0.01, 1 - R_req);
    const excessDecay = Math.max(0, R_req - R - 0.12);
    const rescueWindowAttenuator = Math.exp(-2.5 * Math.pow(excessDecay, 2));
    const weightage = Number(chapter.weightage) || 1.0;
    const priority = weightage * overdueRatio * rescueWindowAttenuator;

    let statusCategory = "HEALTHY";
    if (R < 0.65) statusCategory = "LAPSED_REBUILD";
    else if (R <= 0.82) statusCategory = "CRITICAL_RESCUE";
    else if (R <= R_req + 0.01) statusCategory = "DUE_TODAY";

    return {
      priority: Math.round(priority * 1000) / 1000,
      R: Math.round(R * 1000) / 1000,
      R_req: Math.round(R_req * 1000) / 1000,
      statusCategory,
      elapsedDays: Math.round(elapsedDays * 10) / 10
    };
  }

  // Problem Rigor Tier Configuration
  const RIGOR_CONFIG = {
    1: { label: "Foundation / Direct", beta: 1.45, tauMult: 0.75, stabilityBonus: 0.85 },
    2: { label: "Standard / JEE Main", beta: 1.15, tauMult: 1.00, stabilityBonus: 1.00 },
    3: { label: "JEE Advanced / Multi-Concept", beta: 0.75, tauMult: 1.75, stabilityBonus: 1.20 },
    4: { label: "Elite / Olympiad / Irodov", beta: 0.55, tauMult: 2.50, stabilityBonus: 1.35 }
  };

  // 9. Post-Study Session Evaluation & State Transition with Rigor Calibration
  function evaluateStudySession(chapter, inputs, settings, nowMs = Date.now()) {
    const { R: R_last } = getRetrievability(chapter, settings, nowMs);
    const rigor = RIGOR_CONFIG[inputs.rigorTier || 2] || RIGOR_CONFIG[2];
    const B = clamp(1, 5, Number(inputs.blankPageScore) || 3);
    const rawTotalProblems = Number(inputs.totalProblems) || 0;

    let P_true = 1.0;
    let P_adj = 1.0;
    let Q = B;
    let V_n = 1.0;
    let effectiveRigorBonus = 0.85; // Default if 0 problems solved (Blank-Page only session)
    let M_exec = 0;
    let M_mem = 0;
    let N_correct = 0;

    if (rawTotalProblems > 0) {
      const N_total = rawTotalProblems;
      N_correct = clamp(0, N_total, Number(inputs.correctProblems) || 0);
      const wrongTotal = N_total - N_correct;
      M_exec = clamp(0, wrongTotal, Number(inputs.sillySlips) || 0);
      M_mem = wrongTotal - M_exec;

      P_true = (N_correct + 0.75 * M_exec) / N_total;
      P_adj = Math.pow(clamp(0, 1, P_true), rigor.beta);

      const alpha = (Number(chapter.D0) || 5.0) <= 5.0 ? 0.35 : 0.65;
      Q = Math.round((alpha * B + (1 - alpha) * (1 + 4 * P_adj)) * 100) / 100;

      // Minimum Competence Gate: If true problem accuracy < 25%, cap Q at 2.85 (forces Lapse)
      if (P_true < 0.25) {
        Q = Math.min(2.85, Q);
      }

      // Velocity Factor V_n
      const tierInfo = getSessionTier(chapter.S);
      const durationMins = Number(inputs.durationMins) || tierInfo.durationMins;
      const problemSolvingMins = Math.max(2, durationMins - tierInfo.blankPageMins);
      const tauActual = problemSolvingMins / N_total;
      const baseTau = (Number(chapter.D0) || 5.0) <= 6.0 ? 2.0 : 1.2;
      const tauTarget = baseTau * rigor.tauMult;
      V_n = clamp(0.75, 1.15, Math.pow(tauTarget / tauActual, 0.35));

      // Only grant >1.0x Rigor Bonus if P_true >= 35%
      effectiveRigorBonus = (rigor.stabilityBonus > 1.0 && P_true < 0.35) ? 1.0 : rigor.stabilityBonus;
    }

    // Execution Hazard Index EWMA Update
    const currentHazard = Number(chapter.hazardIndex) || 0;
    const newHazardIndex = rawTotalProblems > 0
      ? Math.round((0.7 * currentHazard + 0.3 * (M_exec / rawTotalProblems)) * 1000) / 1000
      : currentHazard;

    // Stability Update (Pass vs Lapse) with Dynamic R_req Strain & Tier 3 Soft Step-Down
    const R_req = getEffectiveTargetRetention(settings, nowMs);
    const targetDrop = Math.max(0.04, 1 - R_req);
    const tierInfo = getSessionTier(chapter.S);
    const wrongTotal = rawTotalProblems > 0 ? (rawTotalProblems - Number(inputs.correctProblems || 0)) : 0;
    const tier3Failed = (tierInfo.tier === 3) && (B <= (inputs.rigorTier >= 3 ? 2 : 3) || (rawTotalProblems > 0 && wrongTotal >= (inputs.rigorTier >= 3 ? 3 : 2)));

    let passed = (Q >= 3.0) && !tier3Failed;
    let S_new = Number(chapter.S) || 1.0;
    let newLapses = Number(chapter.lapses) || 0;

    if (passed) {
      const w_Q = 0.45 * Q - 0.80;
      const strainFactor = clamp(0.20, 2.20, Math.pow((1 - R_last) / targetDrop, 0.65));
      const baseGrowth = 2.25 * Math.pow(Number(chapter.D) || 5.0, -0.28) * Math.pow(Math.max(1, Number(chapter.S) || 1.0), -0.16);
      const synthesisBonus = inputs.isSynthesisBattle ? 1.25 : 1.0;
      const growth = baseGrowth * strainFactor * w_Q * V_n * synthesisBonus * effectiveRigorBonus;
      S_new = (Number(chapter.S) || 1.0) * (1 + Math.max(0.10, growth));
      chapter.lastDirectS = Math.round(S_new * 100) / 100;
    } else {
      newLapses += 1;
      const w_fail = Q >= 2.0 ? 1.0 : 0.60;
      const S_fail = 0.85 * Math.pow(Number(chapter.D) || 5.0, -0.40) * Math.pow(Math.max(1, Number(chapter.S) || 1.0), 0.35) * Math.exp(-0.30 * (1 - R_last)) * w_fail;
      // Tier 3 Soft Step-Down
      if (tierInfo.tier === 3 && Q >= 2.75) {
        S_new = clamp(16.0, (Number(chapter.S) || 1.0) * 0.85, Number(chapter.S) || 1.0);
      } else {
        S_new = clamp(0.50, (Number(chapter.S) || 1.0) * 0.75, S_fail);
      }
    }
    S_new = Math.round(S_new * 100) / 100;

    // Mean-Reverting Difficulty Update
    const curD = Number(chapter.D) || 5.0;
    const d0Val = Number(chapter.D0) || 5.0;
    const D_new = Math.round(clamp(1.0, 10.0, 0.85 * (curD - 0.45 * (Q - 4.0)) + 0.15 * d0Val) * 100) / 100;

    // Personal Calibration Vector Update (Online Gradient Descent)
    const Y = passed ? 1.0 : 0.0;
    const eta = 0.03;
    let newThetaLogic = Number(settings.thetaLogic) || 1.0;
    let newThetaRote = Number(settings.thetaRote) || 1.0;
    if (d0Val <= 5.0) {
      newThetaLogic = Math.round(clamp(0.65, 1.45, newThetaLogic + eta * (Y - R_last)) * 1000) / 1000;
    } else {
      newThetaRote = Math.round(clamp(0.65, 1.45, newThetaRote + eta * (Y - R_last)) * 1000) / 1000;
    }

    return {
      Q,
      passed,
      tier3Failed,
      P_adj: Math.round(P_adj * 100),
      P_true: Math.round(P_true * 100),
      rawAccuracy: rawTotalProblems > 0 ? Math.round((N_correct / rawTotalProblems) * 100) : 100,
      rigorTier: Number(inputs.rigorTier) || 2,
      rigorLabel: rigor.label,
      rigorMult: effectiveRigorBonus,
      M_mem,
      M_exec,
      V_n: Math.round(V_n * 100) / 100,
      R_last: Math.round(R_last * 100),
      S_old: Number(chapter.S),
      S_new,
      D_old: Number(chapter.D),
      D_new,
      newHazardIndex,
      newLapses,
      newTierInfo: getSessionTier(S_new),
      newThetaLogic,
      newThetaRote
    };
  }

  // 10. Parent-Child Graph Propagation
  function calculateParentBoost(parentChapter, childChapter, couplingWeight, settings, nowMs = Date.now()) {
    const { R: R_P } = getRetrievability(parentChapter, settings, nowMs);
    // Anti-Spam Gate: Only apply boost if R_P <= 0.96
    if (R_P > 0.96) {
      return { boosted: false, reason: "Anti-spam gate (R_P > 0.96)", deltaS: 0, newS: parentChapter.S };
    }

    const curD = Number(parentChapter.D) || 5.0;
    const curS = Number(parentChapter.S) || 1.0;
    const w_Q = 0.35 * 4.0 - 0.40; // evaluated at Q = 4.0
    const strainBoost = Math.exp(1.1 * (1 - R_P)) - 1;
    const deltaS_P = curS * 2.1 * Math.pow(curD, -0.25) * Math.pow(curS, -0.14) * strainBoost * w_Q;
    const boost = deltaS_P * couplingWeight * (1 - R_P);

    // Ghost Decay Ceiling: Cap parent's updated stability so it never exceeds 1.25 * P.lastDirectS
    const lastDirect = Number(parentChapter.lastDirectS) || curS;
    const ceiling = 1.25 * lastDirect;
    const targetS = Math.min(ceiling, curS + boost);
    const actualDelta = Math.max(0, targetS - curS);

    return {
      boosted: actualDelta > 0.05,
      deltaS: Math.round(actualDelta * 100) / 100,
      newS: Math.round(targetS * 100) / 100,
      ceilingReached: targetS >= ceiling,
      R_P: Math.round(R_P * 100)
    };
  }

  return {
    clamp,
    getTheta,
    getDecayParams,
    getRetrievability,
    getEffectiveTargetRetention,
    calculateNextIntervalDays,
    getSessionTier,
    calculateInitialStability,
    calculatePriorityScore,
    RIGOR_CONFIG,
    evaluateStudySession,
    calculateParentBoost
  };
})();

// Export for browser or node tests if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = DSREngine;
}
