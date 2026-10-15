/**
 * Dynamic DSR v3.0 — Cognitive Revision Engine
 * Exact Continuous-State Mathematical Engine Specification
 * Includes Set D5 + Set D6 Calibrations, Subtopic Chains, and Cryo-Freeze Mechanics
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

  // 6. Adaptive Session Tier & Prescribed Protocol (Subtopic Aware)
  function getSessionTier(S, R = 1.0, isSubtopic = false) {
    const valS = Number(S) || 1.0;
    const valR = (Number(R) !== undefined && !isNaN(Number(R))) ? Number(R) : 1.0;
    const t1Limit = isSubtopic ? 10 : 14;
    const t2Limit = isSubtopic ? 28 : 40;

    if (valS < t1Limit || valR < 0.72) {
      return {
        tier: 1,
        name: isSubtopic ? "Tier 1 · Subtopic Rebuild" : "Tier 1 · Full Rebuild",
        durationMins: isSubtopic ? 30 : 50,
        taskSummary: isSubtopic ? "6m Blank-Page + 1m Audit + 12 Core Problems" : "10m Blank-Page + 2m Audit + 20 Core Problems",
        recommendedProblems: isSubtopic ? 12 : 20,
        blankPageMins: isSubtopic ? 6 : 10
      };
    } else if (valS < t2Limit || valR < 0.82) {
      return {
        tier: 2,
        name: isSubtopic ? "Tier 2 · Subtopic Drill" : "Tier 2 · Focused Drill",
        durationMins: isSubtopic ? 20 : 30,
        taskSummary: isSubtopic ? "4m Fault-Line Map + 1m Audit + 8 Hard Problems" : "6m Fault-Line Map + 1m Audit + 10 Hard Problems",
        recommendedProblems: isSubtopic ? 8 : 10,
        blankPageMins: isSubtopic ? 4 : 6
      };
    } else {
      return {
        tier: 3,
        name: isSubtopic ? "Tier 3 · Subtopic Audit" : "Tier 3 · Lightning Audit",
        durationMins: isSubtopic ? 10 : 15,
        taskSummary: isSubtopic ? "2m Formula Sprint + 4 Elite Multi-Concept Problems" : "4m Formula Sprint + 5 Elite Multi-Concept Problems",
        recommendedProblems: isSubtopic ? 4 : 5,
        blankPageMins: isSubtopic ? 2 : 4
      };
    }
  }

  // 7. Day-0 New Chapter Initialization (with 1.35x Subtopic multiplier)
  function calculateInitialStability(D0, initialQ = 4.0, isSubtopic = false) {
    const sBaseMap = { 1: 0.5, 2: 1.0, 3: 1.5, 4: 3.2, 5: 4.5 };
    const sBase = sBaseMap[Math.round(initialQ)] || 3.2;
    const d0Val = clamp(1.0, 10.0, Number(D0) || 5.0);
    let S1 = sBase * Math.exp(-0.12 * (d0Val - 1));
    if (isSubtopic) {
      S1 *= 1.35;
    }
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

  // 9. Post-Study Session Evaluation & State Transition with Rigor Calibration & Cryo-Freeze
  function evaluateStudySession(chapter, inputs, settings, nowMs = Date.now()) {
    const { R: R_last } = getRetrievability(chapter, settings, nowMs);
    const rigor = RIGOR_CONFIG[inputs.rigorTier || 2] || RIGOR_CONFIG[2];
    const B = clamp(1, 5, Number(inputs.blankPageScore) || 3);
    const rawTotalProblems = Number(inputs.totalProblems) || 0;
    const d0Val = Number(chapter.D0) || 5.0;
    const isSubtopic = !!chapter.isSubtopic;
    const tierInfo = getSessionTier(chapter.S, R_last, isSubtopic);

    let P_true = 1.0;
    let P_adj = 1.0;
    let Q = B;
    let V_n = 1.0;
    let effectiveRigorBonus = 0.85;
    let M_exec = 0;
    let M_mem = 0;
    let N_correct = 0;
    let isCryoFreeze = false;
    let cryoShiftDays = 0;

    if (rawTotalProblems === 0) {
      if (d0Val >= 7.5) {
        // Case A: Pure rote / declarative chapter -> normal Blank-Page grading
        Q = B;
        effectiveRigorBonus = 0.85;
        isCryoFreeze = false;
      } else {
        // Case B: Analytical / problem chapter -> 10-Min Cryo-Freeze Refresher
        isCryoFreeze = true;
        Q = B;
        effectiveRigorBonus = 0.85;
        cryoShiftDays = B >= 3 ? clamp(2.0, 5.0, (Number(chapter.S) || 1.0) * 0.25 * (B / 4)) : 0;
      }
    } else {
      const N_total = rawTotalProblems;
      N_correct = clamp(0, N_total, Number(inputs.correctProblems) || 0);
      const wrongTotal = N_total - N_correct;
      M_exec = clamp(0, wrongTotal, Number(inputs.sillySlips) || 0);
      M_mem = wrongTotal - M_exec;

      P_true = (N_correct + 0.75 * M_exec) / N_total;
      P_adj = Math.pow(clamp(0, 1, P_true), rigor.beta);

      const alpha = d0Val <= 5.0 ? 0.35 : 0.65;
      Q = Math.round((alpha * B + (1 - alpha) * (1 + 4 * P_adj)) * 100) / 100;

      // Minimum Competence Gate: If true problem accuracy < 25%, cap Q at 2.85 (forces Lapse)
      if (P_true < 0.25) {
        Q = Math.min(2.85, Q);
      }

      // Velocity Factor V_n
      const durationMins = Number(inputs.durationMins) || tierInfo.durationMins;
      const problemSolvingMins = Math.max(2, durationMins - tierInfo.blankPageMins);
      const tauActual = problemSolvingMins / N_total;
      const baseTau = d0Val <= 6.0 ? 2.0 : 1.2;
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

    // Stability Update
    const R_req = getEffectiveTargetRetention(settings, nowMs);
    const targetDrop = Math.max(0.04, 1 - R_req);
    const wrongTotal = rawTotalProblems > 0 ? (rawTotalProblems - (Number(inputs.correctProblems) || 0)) : 0;
    const tier3Failed = (tierInfo.tier === 3) && (B <= (inputs.rigorTier >= 3 ? 2 : 3) || (rawTotalProblems > 0 && wrongTotal >= (inputs.rigorTier >= 3 ? 3 : 2)));

    let passed = (Q >= 3.0) && !tier3Failed;
    let S_new = Number(chapter.S) || 1.0;
    let newLapses = Number(chapter.lapses) || 0;

    if (isCryoFreeze) {
      // Cryo-Freeze keeps S and D unchanged and shifts clock
      passed = B >= 3;
      S_new = Number(chapter.S) || 1.0;
      newLapses = Number(chapter.lapses) || 0;
    } else if (chapter.forcedUrgent === true) {
      // Prevent Double-Crush on forcedUrgent Rescue Reviews
      let strainFactor = Math.pow((1 - R_last) / targetDrop, 0.65);
      strainFactor = Math.max(1.0, clamp(0.20, 2.20, strainFactor));
      const w_Q = 0.45 * Q - 0.80;
      const baseGrowth = 2.25 * Math.pow(Number(chapter.D) || 5.0, -0.28) * Math.pow(Math.max(1, Number(chapter.S) || 1.0), -0.16);
      const synthesisBonus = inputs.isSynthesisBattle ? 1.25 : 1.0;
      let growth = baseGrowth * strainFactor * w_Q * V_n * synthesisBonus * effectiveRigorBonus;

      if (Q >= 3.5 && !tier3Failed) {
        // Clean Pass: validate repair with conservative 0.35x dampener
        passed = true;
        growth *= 0.35;
        S_new = (Number(chapter.S) || 1.0) * (1 + Math.max(0.05, growth));
        chapter.lastDirectS = Math.round(S_new * 100) / 100;
      } else if (Q >= 3.0 && !tier3Failed) {
        // Borderline Pass (3.0 <= Q < 3.5): contract S_new to re-verify sooner
        passed = true;
        S_new = Math.max(2.0, (Number(chapter.S) || 1.0) * 0.80);
        chapter.lastDirectS = Math.round(S_new * 100) / 100;
      } else {
        // Fail: run standard S_fail equation once (no double crush)
        passed = false;
        newLapses += 1;
        const w_fail = Q >= 2.0 ? 1.0 : 0.60;
        const S_fail = 0.85 * Math.pow(Number(chapter.D) || 5.0, -0.40) * Math.pow(Math.max(1, Number(chapter.S) || 1.0), 0.35) * Math.exp(-0.30 * (1 - R_last)) * w_fail;
        S_new = clamp(0.50, (Number(chapter.S) || 1.0) * 0.75, S_fail);
      }
    } else if (passed) {
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
      if (tierInfo.tier === 3 && Q >= 2.75) {
        S_new = clamp(16.0, (Number(chapter.S) || 1.0) * 0.85, Number(chapter.S) || 1.0);
      } else {
        S_new = clamp(0.50, (Number(chapter.S) || 1.0) * 0.75, S_fail);
      }
    }
    S_new = Math.round(S_new * 100) / 100;

    // Difficulty Update (unchanged if CryoFreeze)
    let D_new = Number(chapter.D) || 5.0;
    if (!isCryoFreeze) {
      const curD = Number(chapter.D) || 5.0;
      const rigorDiffMod = (inputs.rigorTier >= 3 && passed) ? 1.25 : (inputs.rigorTier === 1 ? 0.50 : 1.0);
      let rawD = 0.85 * (curD - 0.45 * rigorDiffMod * (Q - 4.0)) + 0.15 * d0Val;
      if (inputs.rigorTier === 1) {
        rawD = Math.max(d0Val, rawD);
      }
      D_new = Math.round(clamp(1.0, 10.0, rawD) * 100) / 100;
    }

    // Personal Calibration Vector Update (Online Gradient Descent)
    const Y = passed ? 1.0 : 0.0;
    const eta = 0.03;
    let newThetaLogic = Number(settings.thetaLogic) || 1.0;
    let newThetaRote = Number(settings.thetaRote) || 1.0;
    if (!isCryoFreeze && R_last <= 0.93) {
      if (d0Val <= 5.0) {
        newThetaLogic = Math.round(clamp(0.65, 1.45, newThetaLogic + eta * (Y - R_last)) * 1000) / 1000;
      } else {
        newThetaRote = Math.round(clamp(0.65, 1.45, newThetaRote + eta * (Y - R_last)) * 1000) / 1000;
      }
    }

    return {
      Q,
      passed,
      tier3Failed,
      isCryoFreeze,
      cryoShiftDays: isCryoFreeze ? Math.round(cryoShiftDays * 10) / 10 : 0,
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
      newTierInfo: getSessionTier(S_new, 1.0, isSubtopic),
      newThetaLogic,
      newThetaRote
    };
  }

  // 10. Parent-Child Graph Propagation
  function calculateParentBoost(parentChapter, childChapter, couplingWeight, settings, nowMs = Date.now()) {
    const { R: R_P } = getRetrievability(parentChapter, settings, nowMs);
    if (R_P > 0.96) {
      return { boosted: false, reason: "Anti-spam gate (R_P > 0.96)", deltaS: 0, newS: parentChapter.S };
    }

    const curD = Number(parentChapter.D) || 5.0;
    const curS = Number(parentChapter.S) || 1.0;
    const w_Q = 0.35 * 4.0 - 0.40;
    const strainBoost = Math.exp(1.1 * (1 - R_P)) - 1;
    const deltaS_P = curS * 2.1 * Math.pow(curD, -0.25) * Math.pow(curS, -0.14) * strainBoost * w_Q;
    const boost = deltaS_P * couplingWeight * (1 - R_P);

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

  // 11. Synthesis Boss Battle Window Detector
  // Both have S >= 18, at least one due (R <= R_req), partner within 4% (R <= R_req + 0.04)
  function findSynthesisPair(chapters, settings, nowMs = Date.now()) {
    if (!Array.isArray(chapters)) return null;
    const active = chapters.filter((c) => !c.isLocked && !c.isDropped);
    const R_req = getEffectiveTargetRetention(settings, nowMs);

    for (let i = 0; i < active.length; i++) {
      const child = active[i];
      if ((Number(child.S) || 0) < 18 || !Array.isArray(child.parents)) continue;
      const childRet = getRetrievability(child, settings, nowMs);

      for (let j = 0; j < child.parents.length; j++) {
        const link = child.parents[j];
        const parent = active.find((c) => c.id === link.parentId);
        if (!parent || (Number(parent.S) || 0) < 18) continue;

        const parentRet = getRetrievability(parent, settings, nowMs);
        const childDue = childRet.R <= R_req;
        const parentDue = parentRet.R <= R_req;
        const childPartnerOk = childRet.R <= R_req + 0.04;
        const parentPartnerOk = parentRet.R <= R_req + 0.04;

        if ((childDue && parentPartnerOk) || (parentDue && childPartnerOk)) {
          return { child, parent, childR: childRet.R, parentR: parentRet.R };
        }
      }
    }
    return null;
  }

  // 12. Manual Next-Interval Stability Inversion
  function calculateStabilityForInterval(desiredIntervalDays, chapter, settings, nowMs = Date.now()) {
    const interval = Math.max(1, Number(desiredIntervalDays) || 1);
    const { wd, Fd } = getDecayParams(chapter.D || 5.0);
    const R_req = getEffectiveTargetRetention(settings, nowMs);
    const theta = getTheta(chapter, settings);
    const factor = (theta / Fd) * (Math.pow(R_req, -1 / wd) - 1);
    if (factor <= 0) return Math.max(0.5, Math.round(interval * 100) / 100);
    const requiredS = interval / factor;
    return Math.max(0.5, Math.round(requiredS * 100) / 100);
  }

  return {
    clamp,
    getTheta,
    getDecayParams,
    getRetrievability,
    getEffectiveTargetRetention,
    calculateNextIntervalDays,
    calculateStabilityForInterval,
    getSessionTier,
    calculateInitialStability,
    calculatePriorityScore,
    RIGOR_CONFIG,
    evaluateStudySession,
    calculateParentBoost,
    findSynthesisPair
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DSREngine;
}
