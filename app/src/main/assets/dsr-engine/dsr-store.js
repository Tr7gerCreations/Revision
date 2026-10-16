/**
 * Dynamic DSR v3.0 — Master Data Store & Telemetry Ledger
 * Includes Master Schema Extensions, Subtopic Chain Engine, and Zero-Bloat Undo
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

  function clamp(min, max, val) {
    return Math.min(Math.max(val, min), max);
  }

  function migrateVaultItem(item) {
    if (!item || typeof item !== "object") return null;
    return {
      id: item.id || ("fl_" + Math.random().toString(36).substr(2, 9)),
      note: item.note || "",
      requiredStreak: [1, 2, 3].includes(Number(item.requiredStreak)) ? Number(item.requiredStreak) : 2,
      missCount: Number(item.missCount) || 1,
      cleanStreak: Number(item.cleanStreak) || 0,
      graduated: !!item.graduated,
      lastUpdated: item.lastUpdated || item.lastMissed || new Date().toISOString().split("T")[0]
    };
  }

  function migrateNotepadItem(item) {
    if (!item || typeof item !== "object") return null;
    const code = (item.code || "").trim();
    if (!code) return null;
    return {
      id: item.id || ("ref_" + Math.random().toString(36).substr(2, 9)),
      code,
      location: (item.location || "").trim() || "Physical Notepad",
      summary: (item.summary || item.note || "").trim(),
      createdAt: item.createdAt || new Date().toISOString().split("T")[0]
    };
  }

  function normalizeChapter(c) {
    if (!c || typeof c !== "object") return c;
    const now = Date.now();
    const lastRev = Number(c.lastReviewTimestamp) || now;
    const defaultTau = (Number(c.D0) || 5.0) <= 6.0 ? 2.0 : 1.2;
    const tauBase = clamp(0.4, 10.0, Number(c.tauBaseline) || Number(c.tauEWMA) || defaultTau);
    const tauEwma = clamp(0.4, 10.0, Number(c.tauEWMA) || tauBase);

    return {
      id: c.id || generateUUID(),
      name: c.name || "Untitled Chapter",
      subject: c.subject || "Physics",
      groupId: c.groupId || null,
      groupTitle: c.groupTitle || null,
      sequenceIndex: Number(c.sequenceIndex) || 1,
      isSubtopic: !!c.isSubtopic,
      isLocked: !!c.isLocked,
      isDropped: !!c.isDropped,
      D0: Number(c.D0) || 5.0,
      D: Number(c.D) || Number(c.D0) || 5.0,
      S: Number(c.S) || 1.0,
      lastDirectS: Number(c.lastDirectS) || Number(c.S) || 1.0,
      lastReviewTimestamp: lastRev,
      lastDirectReviewTimestamp: Number(c.lastDirectReviewTimestamp) || lastRev,
      createdAt: Number(c.createdAt) || now,
      weightage: Number(c.weightage) || 1.0,
      lapses: Number(c.lapses) || 0,
      hazardIndex: Number(c.hazardIndex) || 0.0,
      forcedUrgent: !!c.forcedUrgent,
      tauBaseline: tauBase,
      tauEWMA: tauEwma,
      parents: Array.isArray(c.parents) ? c.parents : [],
      faultLineVault: Array.isArray(c.faultLineVault) ? c.faultLineVault.map(migrateVaultItem).filter(Boolean) : [],
      notepadIds: Array.isArray(c.notepadIds) ? c.notepadIds.map(migrateNotepadItem).filter(Boolean) : []
    };
  }

  function getActiveChapters(chapters) {
    if (!Array.isArray(chapters)) return [];
    return chapters.filter((c) => !c.isLocked && !c.isDropped);
  }

  function getDemoState() {
    const now = Date.now();
    const dayMs = 86400000;
    const rotGroupId = "grp_demo_rot_01";

    return {
      settings: {
        examName: "JEE ADVANCED 2027",
        examDate: "2027-05-24",
        prepStartDate: "2026-01-01",
        targetRetentionBase: 0.90,
        dailyTimeBudgetMins: 90,
        thetaLogic: 1.00,
        thetaRote: 1.00,
        totalClockShiftDays: 0,
        totalReviewsLogged: 2
      },
      lastUndoSnapshot: null,
      chapters: [
        {
          id: "chap_es_01",
          name: "Electrostatics",
          subject: "Physics",
          groupId: null,
          groupTitle: null,
          sequenceIndex: 1,
          isSubtopic: false,
          isLocked: false,
          isDropped: false,
          D0: 4.0,
          D: 4.0,
          S: 22.0,
          lastDirectS: 22.0,
          lastReviewTimestamp: now - 3.2 * dayMs,
          lastDirectReviewTimestamp: now - 3.2 * dayMs,
          createdAt: now - 35 * dayMs,
          weightage: 1.6,
          lapses: 0,
          hazardIndex: 0.05,
          forcedUrgent: false,
          tauBaseline: 2.0,
          tauEWMA: 2.0,
          parents: [],
          faultLineVault: [
            {
              id: "fl_1",
              note: "Gauss law cylindrical boundary conditions",
              requiredStreak: 2,
              missCount: 1,
              cleanStreak: 1,
              graduated: false,
              lastUpdated: "2026-10-10"
            }
          ],
          notepadIds: [
            {
              id: "ref_es_01",
              code: "PHY-ES-01",
              location: "Notepad 2 · Page 5",
              summary: "Gauss cylindrical surface flux derivation & symmetry constraints",
              createdAt: "2026-10-10"
            }
          ]
        },
        {
          id: "chap_cap_02",
          name: "Capacitance",
          subject: "Physics",
          groupId: null,
          groupTitle: null,
          sequenceIndex: 1,
          isSubtopic: false,
          isLocked: false,
          isDropped: false,
          D0: 4.5,
          D: 4.5,
          S: 12.0,
          lastDirectS: 12.0,
          lastReviewTimestamp: now - 2.1 * dayMs,
          lastDirectReviewTimestamp: now - 2.1 * dayMs,
          createdAt: now - 18 * dayMs,
          weightage: 1.0,
          lapses: 0,
          hazardIndex: 0.08,
          forcedUrgent: false,
          tauBaseline: 2.0,
          tauEWMA: 2.0,
          parents: [
            { parentId: "chap_es_01", couplingWeight: 0.45 }
          ],
          faultLineVault: [
            {
              id: "fl_2",
              note: "Dielectric slab insertion work done formula",
              requiredStreak: 2,
              missCount: 2,
              cleanStreak: 0,
              graduated: false,
              lastUpdated: "2026-10-12"
            }
          ],
          notepadIds: [
            {
              id: "ref_cap_01",
              code: "PHY-CAP-02",
              location: "Notepad 2 · Page 18",
              summary: "Dielectric slab insertion work done: battery connected vs disconnected",
              createdAt: "2026-10-12"
            }
          ]
        },
        {
          id: "chap_rd_sub_01",
          name: "Rotational Dynamics · Part 1: Moment of Inertia & Theorems",
          subject: "Physics",
          groupId: rotGroupId,
          groupTitle: "Rotational Dynamics",
          sequenceIndex: 1,
          isSubtopic: true,
          isLocked: false,
          isDropped: false,
          D0: 4.5,
          D: 4.5,
          S: 14.5,
          lastDirectS: 14.5,
          lastReviewTimestamp: now - 6.2 * dayMs,
          lastDirectReviewTimestamp: now - 6.2 * dayMs,
          createdAt: now - 28 * dayMs,
          weightage: 1.6,
          lapses: 0,
          hazardIndex: 0.06,
          forcedUrgent: false,
          tauBaseline: 2.0,
          tauEWMA: 2.0,
          parents: [],
          faultLineVault: [
            {
              id: "fl_3",
              note: "Perpendicular axis theorem 3D planar constraint",
              requiredStreak: 3,
              missCount: 2,
              cleanStreak: 1,
              graduated: false,
              lastUpdated: "2026-10-06"
            }
          ],
          notepadIds: [
            {
              id: "ref_rd_01",
              code: "ROT-01",
              location: "Notepad 1 · Page 12",
              summary: "Perpendicular axis theorem 2D planar lamina limitation",
              createdAt: "2026-10-06"
            }
          ]
        },
        {
          id: "chap_rd_sub_02",
          name: "Rotational Dynamics · Part 2: Pure Rolling & Instantaneous Axis",
          subject: "Physics",
          groupId: rotGroupId,
          groupTitle: "Rotational Dynamics",
          sequenceIndex: 2,
          isSubtopic: true,
          isLocked: false,
          isDropped: false,
          D0: 6.5,
          D: 6.5,
          S: 8.5,
          lastDirectS: 8.5,
          lastReviewTimestamp: now - 7.8 * dayMs,
          lastDirectReviewTimestamp: now - 7.8 * dayMs,
          createdAt: now - 28 * dayMs,
          weightage: 1.6,
          lapses: 1,
          hazardIndex: 0.18,
          forcedUrgent: false,
          tauBaseline: 2.0,
          tauEWMA: 2.0,
          parents: [
            { parentId: "chap_rd_sub_01", couplingWeight: 0.45 }
          ],
          faultLineVault: [
            {
              id: "fl_4",
              note: "Pure rolling friction direction on inclined plane",
              requiredStreak: 2,
              missCount: 2,
              cleanStreak: 0,
              graduated: false,
              lastUpdated: "2026-10-08"
            }
          ],
          notepadIds: [
            {
              id: "ref_rd_02",
              code: "ROT-02",
              location: "Notepad 1 · Page 15",
              summary: "Pure rolling friction sign on moving incline & instantaneous center",
              createdAt: "2026-10-08"
            }
          ]
        },
        {
          id: "chap_ck_04",
          name: "Chemical Kinetics",
          subject: "Chemistry",
          groupId: null,
          groupTitle: null,
          sequenceIndex: 1,
          isSubtopic: false,
          isLocked: false,
          isDropped: false,
          D0: 5.0,
          D: 4.8,
          S: 42.0,
          lastDirectS: 42.0,
          lastReviewTimestamp: now - 39.5 * dayMs,
          lastDirectReviewTimestamp: now - 39.5 * dayMs,
          createdAt: now - 75 * dayMs,
          weightage: 1.0,
          lapses: 0,
          hazardIndex: 0.04,
          forcedUrgent: false,
          tauBaseline: 1.2,
          tauEWMA: 1.2,
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

  function captureUndoSnapshot(actionLabel, logId = null) {
    if (!state) return;
    state.lastUndoSnapshot = {
      timestamp: Date.now(),
      actionLabel: actionLabel || "Action",
      logId,
      chapters: JSON.parse(JSON.stringify(state.chapters)),
      settings: JSON.parse(JSON.stringify(state.settings))
    };
  }

  function undoLastAction() {
    if (!state || !state.lastUndoSnapshot) {
      return { success: false, message: "No action available to undo." };
    }
    const snapshot = state.lastUndoSnapshot;
    state.chapters = snapshot.chapters.map(normalizeChapter);
    state.settings = snapshot.settings;
    if (snapshot.logId) {
      state.auditLogs = state.auditLogs.filter((l) => l.id !== snapshot.logId);
    }
    const label = snapshot.actionLabel || "Last action";
    state.lastUndoSnapshot = null;
    saveState();
    return { success: true, actionLabel: label };
  }

  function loadState() {
    try {
      const serialized = localStorage.getItem(STORAGE_KEY);
      if (serialized) {
        const parsed = JSON.parse(serialized);
        if (parsed && parsed.settings && Array.isArray(parsed.chapters)) {
          parsed.settings.totalClockShiftDays = Number(parsed.settings.totalClockShiftDays) || 0;
          parsed.auditLogs = sanitizeAuditLogs(parsed.auditLogs || []);
          parsed.chapters = parsed.chapters.map(normalizeChapter);
          parsed.lastUndoSnapshot = parsed.lastUndoSnapshot || null;
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
    captureUndoSnapshot(`Add Chapter: ${chapterData.name || "Untitled"}`);
    const id = generateUUID();
    const now = Date.now();
    const isSubtopic = !!chapterData.isSubtopic;
    const initialS = (typeof DSREngine !== "undefined" && DSREngine.calculateInitialStability)
      ? DSREngine.calculateInitialStability(chapterData.D0, 4.0, isSubtopic)
      : 3.2;

    const d0Val = Number(chapterData.D0) || 5.0;
    const defaultTau = d0Val <= 6.0 ? 2.0 : 1.2;
    const tau = Number(chapterData.tauBaseline) || Number(chapterData.tauEWMA) || Number(chapterData.predictedMinsPerProblem) || defaultTau;

    const newChapter = normalizeChapter({
      id,
      name: chapterData.name.trim(),
      subject: chapterData.subject || "Physics",
      groupId: chapterData.groupId || null,
      groupTitle: chapterData.groupTitle || null,
      sequenceIndex: Number(chapterData.sequenceIndex) || 1,
      isSubtopic,
      isLocked: !!chapterData.isLocked,
      isDropped: !!chapterData.isDropped,
      D0: d0Val,
      D: d0Val,
      S: initialS,
      lastDirectS: initialS,
      lastReviewTimestamp: now,
      lastDirectReviewTimestamp: now,
      createdAt: now,
      weightage: Number(chapterData.weightage) || 1.0,
      lapses: 0,
      hazardIndex: 0.0,
      forcedUrgent: false,
      tauBaseline: tau,
      tauEWMA: tau,
      parents: Array.isArray(chapterData.parents) ? chapterData.parents : [],
      faultLineVault: []
    });

    state.chapters.push(newChapter);

    const nextDays = (typeof DSREngine !== "undefined" && DSREngine.calculateNextIntervalDays)
      ? DSREngine.calculateNextIntervalDays(newChapter, state.settings, now)
      : 3.0;

    const nextDueDate = new Date(now + nextDays * 86400000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    const tierInfo = (typeof DSREngine !== "undefined" && DSREngine.getSessionTier)
      ? DSREngine.getSessionTier(initialS, 1.0, isSubtopic, newChapter.tauEWMA, newChapter.D0)
      : { name: "Tier 1", durationMins: 50 };

    const logEntry = logUserAction(
      "NEW_CHAPTER",
      entryMethod,
      {
        name: newChapter.name,
        subject: newChapter.subject,
        D0: newChapter.D0,
        weightage: newChapter.weightage,
        isSubtopic,
        groupId: newChapter.groupId,
        parentsCount: newChapter.parents.length
      },
      {
        initialS,
        startingTier: tierInfo.name,
        nextIntervalDays: nextDays,
        firstReviewDue: nextDueDate
      }
    );

    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }

    saveState();
    return newChapter;
  }

  function createDividedChapter(macroData, entryMethod = "Bottom-Right FAB (+) -> Add Divided Chapter") {
    captureUndoSnapshot(`Create Divided Chapter: ${macroData.macroName}`);
    const groupId = "grp_" + generateUUID().slice(0, 8);
    const now = Date.now();
    const createdSubtopics = [];
    const subtopicIds = [];

    // Pre-generate IDs
    macroData.subtopics.forEach(() => {
      subtopicIds.push(generateUUID());
    });

    macroData.subtopics.forEach((sub, idx) => {
      const k = idx + 1;
      const subId = subtopicIds[idx];
      const d0 = Number(sub.d0) || 5.0;
      const initialS = (typeof DSREngine !== "undefined" && DSREngine.calculateInitialStability)
        ? DSREngine.calculateInitialStability(d0, 4.0, true)
        : 4.3;

      // Determine parents wiring
      const parents = [];
      if (k === 1 && macroData.externalPrereqId) {
        parents.push({ parentId: macroData.externalPrereqId, couplingWeight: 0.40 });
      }
      if (k > 1) {
        if (macroData.topology === "hub") {
          parents.push({ parentId: subtopicIds[0], couplingWeight: 0.50 });
        } else {
          // Sequential Flow: k-1 (0.45), k-2 (0.20), earlier (0.10)
          parents.push({ parentId: subtopicIds[k - 2], couplingWeight: 0.45 });
          if (k >= 3) {
            parents.push({ parentId: subtopicIds[k - 3], couplingWeight: 0.20 });
          }
          if (k >= 4) {
            for (let m = 0; m <= k - 4; m++) {
              parents.push({ parentId: subtopicIds[m], couplingWeight: 0.10 });
            }
          }
        }
      }

      const isLocked = sub.status === "unlock_later";
      const subTau = Number(sub.tau) || 2.0;
      const chapterObj = normalizeChapter({
        id: subId,
        name: `${macroData.macroName} · Part ${k}: ${sub.name.trim()}`,
        subject: macroData.subject,
        groupId,
        groupTitle: macroData.macroName.trim(),
        sequenceIndex: k,
        isSubtopic: true,
        isLocked,
        isDropped: false,
        D0: d0,
        D: d0,
        S: initialS,
        lastDirectS: initialS,
        lastReviewTimestamp: now,
        lastDirectReviewTimestamp: now,
        createdAt: now,
        weightage: Number(macroData.weightage) || 1.0,
        lapses: 0,
        hazardIndex: 0.0,
        forcedUrgent: false,
        tauBaseline: subTau,
        tauEWMA: subTau,
        parents,
        faultLineVault: []
      });

      state.chapters.push(chapterObj);
      createdSubtopics.push(chapterObj);
    });

    const logEntry = logUserAction(
      "DIVIDED_CHAPTER_CREATED",
      entryMethod,
      {
        macroName: macroData.macroName,
        subject: macroData.subject,
        subtopicsCount: macroData.subtopics.length,
        topology: macroData.topology,
        externalPrereqId: macroData.externalPrereqId || null
      },
      {
        groupId,
        createdSubtopics: createdSubtopics.map((s) => ({ name: s.name, locked: s.isLocked, S: s.S }))
      }
    );

    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }

    saveState();
    return { groupId, subtopics: createdSubtopics };
  }

  function activateSubtopic(chapterId) {
    const ch = state.chapters.find((c) => c.id === chapterId);
    if (!ch) return null;
    captureUndoSnapshot(`Activate Subtopic: ${ch.name}`);
    const now = Date.now();
    ch.isLocked = false;
    ch.lastReviewTimestamp = now;
    ch.lastDirectReviewTimestamp = now;
    const initialS = (typeof DSREngine !== "undefined" && DSREngine.calculateInitialStability)
      ? DSREngine.calculateInitialStability(ch.D0, 4.0, true)
      : 4.3;
    ch.S = initialS;
    ch.lastDirectS = initialS;

    const logEntry = logUserAction(
      "SUBTOPIC_ACTIVATED",
      "Syllabus Browser -> Activate Subtopic",
      { name: ch.name, groupTitle: ch.groupTitle },
      { initialS: ch.S }
    );
    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }

    saveState();
    return ch;
  }

  function appendSubtopicToGroup(groupId, subtopicData) {
    const groupChapters = state.chapters.filter((c) => c.groupId === groupId);
    if (groupChapters.length === 0) return null;
    captureUndoSnapshot(`Append Subtopic to ${groupChapters[0].groupTitle || "Macro Group"}`);

    const nextSeq = groupChapters.reduce((max, c) => Math.max(max, c.sequenceIndex || 1), 0) + 1;
    const sortedGroup = groupChapters.slice().sort((a, b) => (a.sequenceIndex || 1) - (b.sequenceIndex || 1));
    const parents = [];
    const prev1 = sortedGroup.find((c) => c.sequenceIndex === nextSeq - 1);
    const prev2 = sortedGroup.find((c) => c.sequenceIndex === nextSeq - 2);
    if (prev1) parents.push({ parentId: prev1.id, couplingWeight: 0.45 });
    if (prev2) parents.push({ parentId: prev2.id, couplingWeight: 0.20 });
    sortedGroup.forEach((c) => {
      if (c.sequenceIndex < nextSeq - 2) {
        parents.push({ parentId: c.id, couplingWeight: 0.10 });
      }
    });

    const now = Date.now();
    const d0 = Number(subtopicData.d0) || 5.0;
    const initialS = (typeof DSREngine !== "undefined" && DSREngine.calculateInitialStability)
      ? DSREngine.calculateInitialStability(d0, 4.0, true)
      : 4.3;

    const subTau = Number(subtopicData.tau) || 2.0;
    const newSubtopic = normalizeChapter({
      id: generateUUID(),
      name: `${groupChapters[0].groupTitle} · Part ${nextSeq}: ${subtopicData.name.trim()}`,
      subject: groupChapters[0].subject,
      groupId,
      groupTitle: groupChapters[0].groupTitle,
      sequenceIndex: nextSeq,
      isSubtopic: true,
      isLocked: !!subtopicData.isLocked,
      isDropped: false,
      D0: d0,
      D: d0,
      S: initialS,
      lastDirectS: initialS,
      lastReviewTimestamp: now,
      lastDirectReviewTimestamp: now,
      createdAt: now,
      weightage: groupChapters[0].weightage,
      lapses: 0,
      hazardIndex: 0.0,
      forcedUrgent: false,
      tauBaseline: subTau,
      tauEWMA: subTau,
      parents,
      faultLineVault: []
    });

    state.chapters.push(newSubtopic);

    const logEntry = logUserAction(
      "SUBTOPIC_APPENDED",
      "Syllabus Browser -> Append Subtopic",
      { name: newSubtopic.name, groupTitle: newSubtopic.groupTitle, sequenceIndex: nextSeq },
      { initialS: newSubtopic.S }
    );
    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }

    saveState();
    return newSubtopic;
  }

  function splitLeechChapter(chapterId, newSubtopicName, newD0) {
    const parentCh = state.chapters.find((c) => c.id === chapterId);
    if (!parentCh) return null;
    captureUndoSnapshot(`Split Leech Chapter: ${parentCh.name}`);

    // If parent is not part of a group, make it macro part 1
    if (!parentCh.groupId) {
      parentCh.groupId = "grp_" + generateUUID().slice(0, 8);
      parentCh.groupTitle = parentCh.name;
      parentCh.isSubtopic = true;
      parentCh.sequenceIndex = 1;
      parentCh.name = `${parentCh.groupTitle} · Part 1: Core Fundamentals`;
    }
    // Reset lapses to 1 per requirement
    parentCh.lapses = 1;

    const groupChapters = state.chapters.filter((c) => c.groupId === parentCh.groupId);
    const nextSeq = groupChapters.reduce((max, c) => Math.max(max, c.sequenceIndex || 1), 0) + 1;
    const now = Date.now();
    const d0 = Number(newD0) || parentCh.D0;
    const initialS = (typeof DSREngine !== "undefined" && DSREngine.calculateInitialStability)
      ? DSREngine.calculateInitialStability(d0, 4.0, true)
      : 4.3;

    const subTau = Number(parentCh.tauEWMA) || 2.0;
    const childSubtopic = normalizeChapter({
      id: generateUUID(),
      name: `${parentCh.groupTitle} · Part ${nextSeq}: ${newSubtopicName.trim()}`,
      subject: parentCh.subject,
      groupId: parentCh.groupId,
      groupTitle: parentCh.groupTitle,
      sequenceIndex: nextSeq,
      isSubtopic: true,
      isLocked: false,
      isDropped: false,
      D0: d0,
      D: d0,
      S: initialS,
      lastDirectS: initialS,
      lastReviewTimestamp: now,
      lastDirectReviewTimestamp: now,
      createdAt: now,
      weightage: parentCh.weightage,
      lapses: 0,
      hazardIndex: 0.0,
      forcedUrgent: false,
      tauBaseline: subTau,
      tauEWMA: subTau,
      parents: [{ parentId: parentCh.id, couplingWeight: 0.50 }],
      faultLineVault: []
    });

    state.chapters.push(childSubtopic);

    const logEntry = logUserAction(
      "SUBTOPIC_APPENDED",
      "Syllabus Browser -> Leech Split",
      { name: childSubtopic.name, groupTitle: parentCh.groupTitle, sequenceIndex: nextSeq },
      { initialS: childSubtopic.S }
    );
    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }

    saveState();
    return childSubtopic;
  }

  function deleteChapter(chapterId) {
    const idx = state.chapters.findIndex((c) => c.id === chapterId);
    if (idx >= 0) {
      captureUndoSnapshot(`Delete Chapter: ${state.chapters[idx].name}`);
      const removed = state.chapters.splice(idx, 1)[0];
      state.chapters.forEach((c) => {
        if (c.parents) {
          c.parents = c.parents.filter((p) => p.parentId !== chapterId);
        }
      });
      const logEntry = logUserAction(
        "DELETE_CHAPTER",
        "Syllabus Browser -> Delete Action",
        { chapterId, chapterName: removed.name },
        { remainingChapters: state.chapters.length }
      );
      if (state.lastUndoSnapshot) {
        state.lastUndoSnapshot.logId = logEntry.id;
      }
      saveState();
      return true;
    }
    return false;
  }

  function updateChapter(chapterId, updates) {
    const ch = state.chapters.find((c) => c.id === chapterId);
    if (!ch) return null;
    captureUndoSnapshot(`Update Chapter: ${ch.name}`);
    Object.assign(ch, updates);
    saveState();
    return ch;
  }

  function setDailyTimeBudget(mins) {
    const val = Math.max(15, Math.min(360, Number(mins) || 90));
    if (state.settings.dailyTimeBudgetMins !== val) {
      captureUndoSnapshot(`Set Time Budget to ${val}m`);
      state.settings.dailyTimeBudgetMins = val;
      saveState();
    }
  }

  function shiftSyllabusClock(days, entryMethod = "Exam Settings Modal -> Bidirectional Clock Shifter") {
    const shiftDays = Number(days);
    if (!Number.isFinite(shiftDays) || shiftDays === 0) {
      return { success: false, message: "Invalid days value" };
    }
    const shiftMs = shiftDays * 86400000;
    const signLabel = shiftDays > 0 ? `+${shiftDays}` : `${shiftDays}`;
    captureUndoSnapshot(`Syllabus Clock Shift (${signLabel} Days)`);

    const active = getActiveChapters(state.chapters);
    active.forEach((ch) => {
      ch.lastReviewTimestamp = (Number(ch.lastReviewTimestamp) || Date.now()) + shiftMs;
      ch.lastDirectReviewTimestamp = (Number(ch.lastDirectReviewTimestamp) || Number(ch.lastReviewTimestamp) || Date.now()) + shiftMs;
    });

    state.settings.totalClockShiftDays = (Number(state.settings.totalClockShiftDays) || 0) + shiftDays;

    const logEntry = logUserAction(
      "CLOCK_SHIFT",
      entryMethod,
      { shiftDays, totalClockShiftDays: state.settings.totalClockShiftDays, activeChaptersCount: active.length },
      { shiftDays, totalClockShiftDays: state.settings.totalClockShiftDays, message: `Shifted syllabus clock by ${signLabel} days across ${active.length} active chapters. Total buffer: ${state.settings.totalClockShiftDays}d.` }
    );
    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }
    saveState();
    return { success: true, shiftDays, totalClockShiftDays: state.settings.totalClockShiftDays, count: active.length };
  }

  function resetSicknessClock(entryMethod = "Exam Settings Modal -> Reset Sickness Clock") {
    const totalApplied = Number(state.settings.totalClockShiftDays) || 0;
    if (totalApplied === 0) {
      return { success: false, message: "No sickness buffer days to reset." };
    }
    const reverseShiftDays = -totalApplied;
    const shiftMs = reverseShiftDays * 86400000;
    captureUndoSnapshot(`Reset Sickness Days (${reverseShiftDays} Days)`);

    const active = getActiveChapters(state.chapters);
    active.forEach((ch) => {
      ch.lastReviewTimestamp = (Number(ch.lastReviewTimestamp) || Date.now()) + shiftMs;
      ch.lastDirectReviewTimestamp = (Number(ch.lastDirectReviewTimestamp) || Number(ch.lastReviewTimestamp) || Date.now()) + shiftMs;
    });

    state.settings.totalClockShiftDays = 0;

    const logEntry = logUserAction(
      "CLOCK_SHIFT_RESET",
      entryMethod,
      { revertedDays: totalApplied, activeChaptersCount: active.length },
      { message: `Reverted all ${totalApplied} sickness buffer days back across ${active.length} active chapters.` }
    );
    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }
    saveState();
    return { success: true, revertedDays: totalApplied, count: active.length };
  }

  function addNotepadIdToChapter(chapterId, item, skipUndoSnapshot = false) {
    const ch = state.chapters.find((c) => c.id === chapterId);
    if (!ch) return null;
    if (!Array.isArray(ch.notepadIds)) ch.notepadIds = [];
    const newItem = migrateNotepadItem(item);
    if (!newItem || !newItem.code) return null;
    if (!skipUndoSnapshot) {
      captureUndoSnapshot(`Add Barcode ${newItem.code} to ${ch.name}`);
    }
    ch.notepadIds.push(newItem);
    if (!skipUndoSnapshot) {
      const logEntry = logUserAction(
        "NOTEPAD_BARCODE_ADDED",
        "Notepad Barcode Registry",
        { chapterName: ch.name, code: newItem.code, location: newItem.location, summary: newItem.summary },
        { totalIds: ch.notepadIds.length }
      );
      if (state.lastUndoSnapshot) state.lastUndoSnapshot.logId = logEntry.id;
    }
    saveState();
    return newItem;
  }

  function deleteNotepadIdFromChapter(chapterId, notepadId) {
    const ch = state.chapters.find((c) => c.id === chapterId);
    if (!ch || !Array.isArray(ch.notepadIds)) return false;
    const idx = ch.notepadIds.findIndex((n) => n.id === notepadId);
    if (idx >= 0) {
      const removed = ch.notepadIds[idx];
      captureUndoSnapshot(`Delete Barcode ${removed.code} from ${ch.name}`);
      ch.notepadIds.splice(idx, 1);
      saveState();
      return true;
    }
    return false;
  }

  function updateFaultLineRequiredStreak(chapterId, faultLineId, newStreak) {
    const ch = state.chapters.find((c) => c.id === chapterId);
    if (!ch || !Array.isArray(ch.faultLineVault)) return false;
    const item = ch.faultLineVault.find((t) => t.id === faultLineId);
    if (!item) return false;
    const val = [1, 2, 3].includes(Number(newStreak)) ? Number(newStreak) : 2;
    item.requiredStreak = val;
    if ((item.cleanStreak || 0) >= val) {
      item.graduated = true;
    } else {
      item.graduated = false;
    }
    saveState();
    return true;
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

    if (Object.keys(diffs).length === 0) {
      return false;
    }

    captureUndoSnapshot("Update Exam Settings");
    Object.assign(state.settings, newSettings);

    if (Object.keys(diffs).length === 1 && diffs.dailyTimeBudgetMins !== undefined) {
      saveState();
      return true;
    }

    const logEntry = logUserAction("EXAM_SETTINGS_UPDATE", entryMethod, { changes: oldVals }, { updated: diffs });
    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }
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
    captureUndoSnapshot("Clear All Audit Records");
    state.auditLogs = [];
    saveState();
  }

  function resetDemoData() {
    captureUndoSnapshot("Reset Demo Data");
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
        captureUndoSnapshot("Restore Backup");
        state = {
          settings: { ...getDemoState().settings, ...parsed.settings },
          chapters: parsed.chapters.map(normalizeChapter),
          mockTests: Array.isArray(parsed.mockTests) ? parsed.mockTests : [],
          auditLogs: sanitizeAuditLogs(Array.isArray(parsed.auditLogs) ? parsed.auditLogs : []),
          lastUndoSnapshot: null
        };
        const logEntry = logUserAction(
          "RESTORE_BACKUP",
          "Settings Modal -> Import JSON File",
          { totalChapters: state.chapters.length, totalLogs: state.auditLogs.length },
          { restoredSuccessfully: true }
        );
        if (state.lastUndoSnapshot) {
          state.lastUndoSnapshot.logId = logEntry.id;
        }
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
    captureUndoSnapshot,
    undoLastAction,
    getActiveChapters,
    logUserAction,
    addChapter,
    createDividedChapter,
    activateSubtopic,
    appendSubtopicToGroup,
    splitLeechChapter,
    deleteChapter,
    updateChapter,
    setDailyTimeBudget,
    shiftSyllabusClock,
    resetSicknessClock,
    addNotepadIdToChapter,
    deleteNotepadIdFromChapter,
    updateFaultLineRequiredStreak,
    updateSettings,
    deleteAuditLog,
    clearAllAuditLogs,
    resetDemoData,
    exportStateJSON,
    exportAuditCSV,
    importStateJSON
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DSRStore;
}
