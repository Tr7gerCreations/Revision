/**
 * Dynamic DSR v3.0 — Master Data Store & Telemetry Ledger
 */

const DSRStore = (function () {
  const STORAGE_KEY = "dsr_v3_master_state";

  function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getDemoState() {
    const now = Date.now();
    const dayMs = 86400000;

    return {
      settings: {
        examName: "JEE ADVANCED 2027",
        examDate: "2027-05-24",
        prepStartDate: "2026-01-01",
        targetRetentionBase: 0.90,
        dailyTimeBudgetMins: 90,
        thetaLogic: 1.00,
        thetaRote: 1.00,
        totalReviewsLogged: 2
      },
      chapters: [
        {
          id: "chap_es_01",
          name: "Electrostatics",
          subject: "Physics",
          D0: 4.0,
          D: 4.0,
          S: 22.0,
          lastDirectS: 22.0,
          lastReviewTimestamp: now - 3.2 * dayMs,
          createdAt: now - 35 * dayMs,
          weightage: 1.6,
          lapses: 0,
          hazardIndex: 0.05,
          parents: [],
          faultLineVault: [
            { id: "fl_1", note: "Gauss law cylindrical boundary conditions", missCount: 1, lastMissed: "2026-10-10" }
          ]
        },
        {
          id: "chap_cap_02",
          name: "Capacitance",
          subject: "Physics",
          D0: 4.5,
          D: 4.5,
          S: 12.0,
          lastDirectS: 12.0,
          lastReviewTimestamp: now - 2.1 * dayMs,
          createdAt: now - 18 * dayMs,
          weightage: 1.0,
          lapses: 0,
          hazardIndex: 0.08,
          parents: [
            { parentId: "chap_es_01", couplingWeight: 0.45 }
          ],
          faultLineVault: [
            { id: "fl_2", note: "Dielectric slab insertion work done formula", missCount: 2, lastMissed: "2026-10-12" }
          ]
        },
        {
          id: "chap_rd_03",
          name: "Rotational Dynamics",
          subject: "Physics",
          D0: 6.0,
          D: 6.2,
          S: 8.5,
          lastDirectS: 8.5,
          lastReviewTimestamp: now - 8.4 * dayMs,
          createdAt: now - 28 * dayMs,
          weightage: 1.6,
          lapses: 1,
          hazardIndex: 0.18, // Triggers "High Trap Risk" warning banner (>= 0.15)
          parents: [],
          faultLineVault: [
            { id: "fl_3", note: "Perpendicular axis theorem 3D planar constraint", missCount: 3, lastMissed: "2026-10-06" },
            { id: "fl_4", note: "Pure rolling friction direction on inclined plane", missCount: 2, lastMissed: "2026-10-08" }
          ]
        },
        {
          id: "chap_ck_04",
          name: "Chemical Kinetics",
          subject: "Chemistry",
          D0: 5.0,
          D: 4.8,
          S: 42.0,
          lastDirectS: 42.0,
          lastReviewTimestamp: now - 39.5 * dayMs,
          createdAt: now - 75 * dayMs,
          weightage: 1.0,
          lapses: 0,
          hazardIndex: 0.04,
          parents: [],
          faultLineVault: []
        }
      ],
      mockTests: [],
      auditLogs: [
        {
          id: "log_seed_01",
          timestampISO: new Date(now - 3.2 * dayMs).toISOString(),
          displayDate: new Date(now - 3.2 * dayMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          displayTime: new Date(now - 3.2 * dayMs).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          inputType: "POST_STUDY_REVIEW",
          entryMethod: "To-Do Dashboard Card Tap -> Post-Study Modal",
          rawInputs: {
            chapterName: "Electrostatics",
            blankPageScore: 4,
            totalProblems: 20,
            correctProblems: 18,
            sillySlips: 1,
            conceptBlanks: 1,
            durationMins: 48,
            faultLineNote: "Gauss law cylindrical boundary conditions"
          },
          computedOutputs: {
            Q: 4.12,
            passed: true,
            S_old: 14.5,
            S_new: 22.0,
            D_old: 4.2,
            D_new: 4.0,
            nextDueDays: 21.5,
            hazardIndex: 0.05
          }
        },
        {
          id: "log_seed_02",
          timestampISO: new Date(now - 2.1 * dayMs).toISOString(),
          displayDate: new Date(now - 2.1 * dayMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          displayTime: new Date(now - 2.1 * dayMs).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          inputType: "POST_STUDY_REVIEW",
          entryMethod: "To-Do Dashboard Card Tap -> Post-Study Modal",
          rawInputs: {
            chapterName: "Capacitance",
            blankPageScore: 3,
            totalProblems: 15,
            correctProblems: 13,
            sillySlips: 1,
            conceptBlanks: 1,
            durationMins: 32,
            faultLineNote: "Dielectric slab insertion work done formula"
          },
          computedOutputs: {
            Q: 3.45,
            passed: true,
            S_old: 8.2,
            S_new: 12.0,
            D_old: 4.6,
            D_new: 4.5,
            nextDueDays: 11.8,
            parentBoosts: [
              { parentName: "Electrostatics", boostDays: 1.1 }
            ]
          }
        }
      ]
    };
  }

  // Sanitizer: Strips out redundant spam entries from the audit log
  function sanitizeAuditLogs(logs) {
    if (!Array.isArray(logs)) return [];
    const sanitized = [];
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.inputType === "EXAM_SETTINGS_UPDATE") {
        const raw = log.rawInputs || {};
        const comp = log.computedOutputs || {};
        const oldS = raw.oldSettings;
        const newS = comp.newSettings;
        // Strip out no-op settings updates where nothing changed
        if (oldS && newS) {
          const isIdentical =
            oldS.examName === newS.examName &&
            oldS.examDate === newS.examDate &&
            oldS.prepStartDate === newS.prepStartDate &&
            oldS.targetRetentionBase === newS.targetRetentionBase &&
            oldS.dailyTimeBudgetMins === newS.dailyTimeBudgetMins &&
            oldS.thetaLogic === newS.thetaLogic &&
            oldS.thetaRote === newS.thetaRote;
          if (isIdentical) {
            continue;
          }
        }
        // If consecutive identical settings updates exist, skip the duplicate
        const prev = sanitized[sanitized.length - 1];
        if (prev && prev.inputType === "EXAM_SETTINGS_UPDATE") {
          const prevStr = JSON.stringify(prev.computedOutputs);
          const curStr = JSON.stringify(comp);
          if (prevStr === curStr) {
            continue;
          }
        }
      }
      sanitized.push(log);
    }
    return sanitized;
  }

  let state = null;
  const listeners = [];

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error("Store listener error:", e);
      }
    });
  }

  function loadState() {
    try {
      const serialized = localStorage.getItem(STORAGE_KEY);
      if (serialized) {
        const parsed = JSON.parse(serialized);
        if (parsed && parsed.settings && Array.isArray(parsed.chapters)) {
          // Clean up past spam logs from stored state
          parsed.auditLogs = sanitizeAuditLogs(parsed.auditLogs || []);
          state = parsed;
          saveState();
          return state;
        }
      }
    } catch (e) {
      console.warn("Failed to parse stored DSR state, using default demo state:", e);
    }
    state = getDemoState();
    saveState();
    return state;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state to localStorage:", e);
    }
    notify();
  }

  function getState() {
    if (!state) loadState();
    return state;
  }

  function logUserAction(inputType, entryMethod, rawInputs, computedOutputs) {
    const now = new Date();
    const logEntry = {
      id: generateUUID(),
      timestampISO: now.toISOString(),
      displayDate: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      displayTime: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      inputType,
      entryMethod,
      rawInputs,
      computedOutputs
    };
    state.auditLogs.unshift(logEntry);
    saveState();
    return logEntry;
  }

  function addChapter(chapterData, entryMethod = "Bottom-Right FAB (+) -> Add New Chapter Modal") {
    const id = generateUUID();
    const now = Date.now();
    const initialS = DSREngine.calculateInitialStability(chapterData.D0, 4.0);
    const newChapter = {
      id,
      name: chapterData.name.trim(),
      subject: chapterData.subject || "Physics",
      D0: Number(chapterData.D0) || 5.0,
      D: Number(chapterData.D0) || 5.0,
      S: initialS,
      lastDirectS: initialS,
      lastReviewTimestamp: now,
      createdAt: now,
      weightage: Number(chapterData.weightage) || 1.0,
      lapses: 0,
      hazardIndex: 0.0,
      parents: Array.isArray(chapterData.parents) ? chapterData.parents : [],
      faultLineVault: []
    };

    state.chapters.push(newChapter);

    const nextDays = DSREngine.calculateNextIntervalDays(newChapter, state.settings, now);
    const nextDueDate = new Date(now + nextDays * 86400000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    logUserAction(
      "NEW_CHAPTER",
      entryMethod,
      {
        name: newChapter.name,
        subject: newChapter.subject,
        D0: newChapter.D0,
        weightage: newChapter.weightage,
        parentsCount: newChapter.parents.length
      },
      {
        initialS,
        startingTier: DSREngine.getSessionTier(initialS).name,
        nextIntervalDays: nextDays,
        firstReviewDue: nextDueDate
      }
    );

    saveState();
    return newChapter;
  }

  function deleteChapter(chapterId) {
    const idx = state.chapters.findIndex((c) => c.id === chapterId);
    if (idx >= 0) {
      const removed = state.chapters.splice(idx, 1)[0];
      // Clean up parent references in other chapters
      state.chapters.forEach((c) => {
        if (c.parents) {
          c.parents = c.parents.filter((p) => p.parentId !== chapterId);
        }
      });
      logUserAction(
        "DELETE_CHAPTER",
        "Syllabus Browser -> Delete Action",
        { chapterId, chapterName: removed.name },
        { remainingChapters: state.chapters.length }
      );
      saveState();
      return true;
    }
    return false;
  }

  function updateChapter(chapterId, updates) {
    const ch = state.chapters.find((c) => c.id === chapterId);
    if (!ch) return null;
    Object.assign(ch, updates);
    saveState();
    return ch;
  }

  // Adjust daily time budget without spamming immutable audit records
  function setDailyTimeBudget(mins) {
    const val = Math.max(15, Math.min(360, Number(mins) || 90));
    if (state.settings.dailyTimeBudgetMins !== val) {
      state.settings.dailyTimeBudgetMins = val;
      saveState();
    }
  }

  function updateSettings(newSettings, entryMethod = "Top Countdown Banner -> Exam Settings Modal") {
    const diffs = {};
    const oldVals = {};

    for (const key of Object.keys(newSettings)) {
      if (state.settings[key] !== newSettings[key]) {
        oldVals[key] = state.settings[key];
        diffs[key] = newSettings[key];
      }
    }

    // Guard: If nothing actually changed, exit cleanly without logging
    if (Object.keys(diffs).length === 0) {
      return false;
    }

    Object.assign(state.settings, newSettings);

    // If only daily budget was adjusted, do not treat as full exam re-calibration
    if (Object.keys(diffs).length === 1 && diffs.dailyTimeBudgetMins !== undefined) {
      saveState();
      return true;
    }

    logUserAction("EXAM_SETTINGS_UPDATE", entryMethod, { changes: oldVals }, { updated: diffs });
    saveState();
    return true;
  }

  function deleteAuditLog(logId) {
    const idx = state.auditLogs.findIndex((l) => l.id === logId);
    if (idx >= 0) {
      state.auditLogs.splice(idx, 1);
      saveState();
      return true;
    }
    return false;
  }

  function clearAllAuditLogs() {
    state.auditLogs = [];
    saveState();
  }

  function clearSettingsSpam() {
    state.auditLogs = state.auditLogs.filter((l) => l.inputType !== "EXAM_SETTINGS_UPDATE");
    saveState();
  }

  function resetDemoData() {
    state = getDemoState();
    saveState();
  }

  function exportStateJSON() {
    return JSON.stringify(state, null, 2);
  }

  function exportAuditCSV() {
    const headers = ["Timestamp", "Display Date", "Display Time", "Action Type", "Entry Method", "Summary"];
    const rows = state.auditLogs.map((log) => {
      const summary = typeof log.rawInputs === "object" ? JSON.stringify(log.rawInputs).replace(/"/g, '""') : "";
      return [
        `"${log.timestampISO}"`,
        `"${log.displayDate}"`,
        `"${log.displayTime}"`,
        `"${log.inputType}"`,
        `"${log.entryMethod}"`,
        `"${summary}"`
      ].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  }

  function importStateJSON(jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed && parsed.settings && Array.isArray(parsed.chapters)) {
        state = {
          settings: { ...getDemoState().settings, ...parsed.settings },
          chapters: parsed.chapters,
          mockTests: Array.isArray(parsed.mockTests) ? parsed.mockTests : [],
          auditLogs: sanitizeAuditLogs(Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [])
        };
        logUserAction(
          "RESTORE_BACKUP",
          "Settings Modal -> Import JSON File",
          { totalChapters: state.chapters.length, totalLogs: state.auditLogs.length },
          { restoredSuccessfully: true }
        );
        saveState();
        return { success: true };
      }
      return { success: false, error: "Invalid backup schema: Missing settings or chapters array." };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    getState,
    loadState,
    saveState,
    subscribe,
    logUserAction,
    addChapter,
    deleteChapter,
    updateChapter,
    setDailyTimeBudget,
    updateSettings,
    deleteAuditLog,
    clearAllAuditLogs,
    clearSettingsSpam,
    resetDemoData,
    exportStateJSON,
    exportAuditCSV,
    importStateJSON
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DSRStore;
}
