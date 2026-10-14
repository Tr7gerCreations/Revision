/**
 * Dynamic DSR v3.0 — Cognitive Revision Engine
 * Main Application Controller & Reactive UI Logic
 */

(function () {
  let activeTab = "dashboard";
  let activeSubjectFilter = "ALL";
  let activeAuditFilter = "ALL";
  let auditSearchQuery = "";
  let currentAuditingChapterId = null;
  let isAdHocMode = false;
  let isSynthesisSession = false;

  // Stopwatch state
  let stopwatchInterval = null;
  let stopwatchSeconds = 0;
  let stopwatchPhase = 1; // 1: Blank-Page, 2: Red-Pen, 3: Problems
  let stopwatchRunning = false;

  // DOM Elements cache
  const el = {
    // Views
    viewDashboard: document.getElementById("viewDashboard"),
    viewSyllabus: document.getElementById("viewSyllabus"),
    viewAudit: document.getElementById("viewAudit"),
    // Nav
    navTabDashboard: document.getElementById("navTabDashboard"),
    navTabSyllabus: document.getElementById("navTabSyllabus"),
    navTabAudit: document.getElementById("navTabAudit"),
    // Header actions
    btnHeaderAudit: document.getElementById("btnHeaderAudit"),
    btnHeaderSettings: document.getElementById("btnHeaderSettings"),
    // Dashboard components
    topCountdownBanner: document.getElementById("topCountdownBanner"),
    bannerExamTitle: document.getElementById("bannerExamTitle"),
    bannerDaysLeft: document.getElementById("bannerDaysLeft"),
    bannerTargetRetention: document.getElementById("bannerTargetRetention"),
    bannerHealthPct: document.getElementById("bannerHealthPct"),
    bannerHealthFill: document.getElementById("bannerHealthFill"),
    budgetDurationText: document.getElementById("budgetDurationText"),
    budgetProgressFill: document.getElementById("budgetProgressFill"),
    btnBudgetDec: document.getElementById("btnBudgetDec"),
    btnBudgetInc: document.getElementById("btnBudgetInc"),
    synthesisBanner: document.getElementById("synthesisBanner"),
    synthesisBannerText: document.getElementById("synthesisBannerText"),
    btnLaunchSynthesis: document.getElementById("btnLaunchSynthesis"),
    queueCountLabel: document.getElementById("queueCountLabel"),
    queueListContainer: document.getElementById("queueListContainer"),
    lapsedSlotContainer: document.getElementById("lapsedSlotContainer"),
    lapsedCardContent: document.getElementById("lapsedCardContent"),
    // Syllabus components
    syllabusCountLabel: document.getElementById("syllabusCountLabel"),
    syllabusListContainer: document.getElementById("syllabusListContainer"),
    // Audit components
    auditCountLabel: document.getElementById("auditCountLabel"),
    auditSearchInput: document.getElementById("auditSearchInput"),
    auditLogListContainer: document.getElementById("auditLogListContainer"),
    btnExportJSON: document.getElementById("btnExportJSON"),
    btnExportCSV: document.getElementById("btnExportCSV"),
    btnTriggerImport: document.getElementById("btnTriggerImport"),
    fileImportInput: document.getElementById("fileImportInput"),
    // FAB & Speed Dial
    mainFabBtn: document.getElementById("mainFabBtn"),
    fabOverlay: document.getElementById("fabOverlay"),
    speedDialMenu: document.getElementById("speedDialMenu"),
    dialNewChapter: document.getElementById("dialNewChapter"),
    dialMockTest: document.getElementById("dialMockTest"),
    dialAdHoc: document.getElementById("dialAdHoc"),
    // Modals
    modalAddChapter: document.getElementById("modalAddChapter"),
    modalPostStudy: document.getElementById("modalPostStudy"),
    modalMockTest: document.getElementById("modalMockTest"),
    modalSettings: document.getElementById("modalSettings"),
    modalChapterDetail: document.getElementById("modalChapterDetail"),
    toastPopup: document.getElementById("toastPopup")
  };

  // Toast Helper
  function showToast(msg) {
    if (window.AndroidHost && window.AndroidHost.showToast) {
      window.AndroidHost.showToast(msg);
      return;
    }
    el.toastPopup.textContent = msg;
    el.toastPopup.classList.add("show");
    setTimeout(() => el.toastPopup.classList.remove("show"), 2500);
  }

  // Native share or fallback download
  function triggerExport(content, mimeType, filename) {
    if (window.AndroidHost && window.AndroidHost.shareExport) {
      window.AndroidHost.shareExport(content, mimeType, filename);
    } else {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${filename}`);
    }
  }

  // Android Back Button Handler
  window.handleAndroidBack = function () {
    const openModal = document.querySelector(".modal-backdrop.show");
    if (openModal) {
      closeAllModals();
      return true;
    }
    if (el.speedDialMenu.classList.contains("show")) {
      toggleSpeedDial(false);
      return true;
    }
    if (activeTab !== "dashboard") {
      switchTab("dashboard");
      return true;
    }
    return false;
  };

  function switchTab(tabId) {
    activeTab = tabId;
    [el.viewDashboard, el.viewSyllabus, el.viewAudit].forEach((sec) => sec.classList.remove("active"));
    [el.navTabDashboard, el.navTabSyllabus, el.navTabAudit].forEach((btn) => btn.classList.remove("active"));

    if (tabId === "dashboard") {
      el.viewDashboard.classList.add("active");
      el.navTabDashboard.classList.add("active");
    } else if (tabId === "syllabus") {
      el.viewSyllabus.classList.add("active");
      el.navTabSyllabus.classList.add("active");
    } else if (tabId === "audit") {
      el.viewAudit.classList.add("active");
      el.navTabAudit.classList.add("active");
    }
    renderCurrentView();
  }

  function toggleSpeedDial(forceState) {
    const isShow = typeof forceState === "boolean" ? forceState : !el.speedDialMenu.classList.contains("show");
    if (isShow) {
      el.speedDialMenu.classList.add("show");
      el.fabOverlay.classList.add("show");
      el.mainFabBtn.classList.add("open");
    } else {
      el.speedDialMenu.classList.remove("show");
      el.fabOverlay.classList.remove("show");
      el.mainFabBtn.classList.remove("open");
    }
  }

  function openModal(modalEl) {
    closeAllModals();
    toggleSpeedDial(false);
    modalEl.classList.add("show");
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.remove("show"));
    stopStopwatch();
  }

  // -------------------------------------------------------------
  // DASHBOARD RENDERING & MATHEMATICAL ENGINE SYNC
  // -------------------------------------------------------------
  function renderDashboard() {
    const state = DSRStore.getState();
    const settings = state.settings;
    const chapters = state.chapters;
    const now = Date.now();

    // 1. Exam Countdown & Target Retention
    const examMs = new Date(settings.examDate).getTime();
    const daysLeft = Math.max(0, Math.ceil((examMs - now) / 86400000));
    el.bannerExamTitle.textContent = settings.examName || "EXAM PREP";
    el.bannerDaysLeft.textContent = `${daysLeft} DAYS LEFT`;

    const effectiveR_req = DSREngine.getEffectiveTargetRetention(settings, now);
    el.bannerTargetRetention.textContent = `${Math.round(effectiveR_req * 100)}%`;

    // 2. Syllabus Health Gauge (% chapters where R(t) >= R_req)
    let healthyCount = 0;
    const scoredChapters = chapters.map((ch) => {
      const triage = DSREngine.calculatePriorityScore(ch, settings, now);
      if (triage.R >= triage.R_req) {
        healthyCount++;
      }
      return { chapter: ch, triage, tierInfo: DSREngine.getSessionTier(ch.S) };
    });

    const healthPct = chapters.length > 0 ? Math.round((healthyCount / chapters.length) * 100) : 100;
    el.bannerHealthPct.textContent = `${healthPct}%`;
    el.bannerHealthFill.style.width = `${healthPct}%`;

    // 3. Check Synthesis Boss Battle Condition
    // 2 or 3 mature chapters (S >= 21) due within 4 days (R <= R_req + 0.05)
    const synthesisCandidates = scoredChapters.filter(
      (sc) => sc.chapter.S >= 21 && sc.triage.R <= sc.triage.R_req + 0.05
    );

    if (synthesisCandidates.length >= 2) {
      el.synthesisBanner.style.display = "flex";
      const names = synthesisCandidates.slice(0, 3).map((c) => c.chapter.name).join(" + ");
      el.synthesisBannerText.textContent = `Interleave [${names}] into one master problem session for a 1.25x stability boost.`;
      el.btnLaunchSynthesis.onclick = () => {
        launchSynthesisBattle(synthesisCandidates[0].chapter);
      };
    } else {
      el.synthesisBanner.style.display = "none";
    }

    // 4. Priority Queue Sorting & Lapsed Rebuild Separation
    const lapsedList = scoredChapters.filter((sc) => sc.triage.statusCategory === "LAPSED_REBUILD");
    const queueList = scoredChapters
      .filter((sc) => sc.triage.statusCategory !== "LAPSED_REBUILD")
      .sort((a, b) => b.triage.priority - a.triage.priority);

    // Calculate budget consumption
    let scheduledMins = 0;
    const budgetMins = Number(settings.dailyTimeBudgetMins) || 90;
    queueList.forEach((sc) => {
      if (scheduledMins + sc.tierInfo.durationMins <= budgetMins || scheduledMins === 0) {
        scheduledMins += sc.tierInfo.durationMins;
      }
    });

    el.budgetDurationText.textContent = `${scheduledMins} / ${budgetMins} min`;
    const budgetPct = Math.min(100, Math.round((scheduledMins / budgetMins) * 100));
    el.budgetProgressFill.style.width = `${budgetPct}%`;
    el.budgetProgressFill.style.background = budgetPct > 100 ? "var(--red-urgent)" : "var(--cyan-core)";

    // Render Queue Cards
    el.queueCountLabel.textContent = `${queueList.length} topics`;
    el.queueListContainer.innerHTML = "";

    if (queueList.length === 0) {
      el.queueListContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 16px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 28px; margin-bottom: 8px;">🎯</div>
          <div style="font-weight: 700; color: var(--emerald-retained);">All Topics Retained!</div>
          <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">No chapters are currently due. Use the (+) button to add chapters or run an ad-hoc review.</div>
        </div>
      `;
    } else {
      queueList.forEach((item) => {
        const card = createChapterQueueCard(item);
        el.queueListContainer.appendChild(card);
      });
    }

    // Render Lapsed Rebuild Slot (Capped 1 active/day)
    if (lapsedList.length > 0) {
      el.lapsedSlotContainer.style.display = "flex";
      el.lapsedCardContent.innerHTML = "";
      const activeLapsed = lapsedList[0];
      const card = createChapterQueueCard(activeLapsed, true);
      el.lapsedCardContent.appendChild(card);
    } else {
      el.lapsedSlotContainer.style.display = "none";
    }
  }

  function createChapterQueueCard(item, isLapsed = false) {
    const ch = item.chapter;
    const triage = item.triage;
    const tier = item.tierInfo;

    const div = document.createElement("div");
    div.className = "chapter-card";

    // Status Badge Logic
    let statusClass = "healthy";
    let statusText = `RETAINED (R = ${Math.round(triage.R * 100)}%)`;

    if (isLapsed || triage.statusCategory === "LAPSED_REBUILD") {
      statusClass = "urgent";
      statusText = `🔴 REBUILD REQUIRED (R = ${Math.round(triage.R * 100)}%)`;
    } else if (triage.statusCategory === "CRITICAL_RESCUE") {
      statusClass = "urgent";
      statusText = `🔴 URGENT (R = ${Math.round(triage.R * 100)}%)`;
    } else if (triage.statusCategory === "DUE_TODAY") {
      statusClass = "due";
      statusText = `🟡 DUE TODAY (R = ${Math.round(triage.R * 100)}%)`;
    }

    // Subject Class
    const subjClass = (ch.subject || "Physics").toLowerCase();

    // High Trap Risk Pill
    const trapWarningHtml =
      ch.hazardIndex >= 0.15
        ? `<div class="trap-risk-pill">
            <span>⚠️</span>
            <span><strong>High Trap Risk</strong> (${Math.round(ch.hazardIndex * 100)}% silly error rate) — Double-check calculations & units</span>
          </div>`
        : "";

    // Fault-Lines reminder (Tier 2 or 3)
    let faultLinesHtml = "";
    if (tier.tier >= 2 && Array.isArray(ch.faultLineVault) && ch.faultLineVault.length > 0) {
      const topNotes = ch.faultLineVault.slice(0, 2).map((fl) => fl.note).join(" • ");
      faultLinesHtml = `
        <div class="fault-lines-pill">
          <strong>🎯 Fault-Lines to verify:</strong> ${escapeHtml(topNotes)}
        </div>
      `;
    }

    div.innerHTML = `
      <div class="card-top-row">
        <span class="status-badge ${statusClass} mono">${statusText}</span>
        <span class="tier-badge mono">${tier.name} · ${tier.durationMins}m</span>
      </div>
      <div class="chapter-main-row">
        <span class="chapter-title">${escapeHtml(ch.name)}</span>
        <span class="subject-pill ${subjClass}">${escapeHtml(ch.subject)}</span>
      </div>
      ${trapWarningHtml}
      ${faultLinesHtml}
      <div class="prescribed-task-line">
        <span>Task: ${escapeHtml(tier.taskSummary)}</span>
        <span class="mono" style="color: var(--cyan-core); font-weight: 700;">Tap to Audit &rarr;</span>
      </div>
    `;

    div.addEventListener("click", () => {
      openPostStudyModal(ch.id, false);
    });

    return div;
  }

  // -------------------------------------------------------------
  // SYLLABUS & FAULT-LINE BROWSER
  // -------------------------------------------------------------
  function renderSyllabus() {
    const state = DSRStore.getState();
    const settings = state.settings;
    const chapters = state.chapters;
    const now = Date.now();

    const filtered = chapters.filter((c) => {
      if (activeSubjectFilter === "ALL") return true;
      return c.subject === activeSubjectFilter;
    });

    el.syllabusCountLabel.textContent = `${filtered.length} Chapters`;
    el.syllabusListContainer.innerHTML = "";

    if (filtered.length === 0) {
      el.syllabusListContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 16px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle); color: var(--text-dim);">
          No chapters found for this subject filter.
        </div>
      `;
      return;
    }

    filtered.forEach((ch) => {
      const { R, elapsedDays } = DSREngine.getRetrievability(ch, settings, now);
      const tier = DSREngine.getSessionTier(ch.S);
      const vaultCount = Array.isArray(ch.faultLineVault) ? ch.faultLineVault.length : 0;
      const subjClass = (ch.subject || "Physics").toLowerCase();

      const div = document.createElement("div");
      div.className = "chapter-card";
      div.innerHTML = `
        <div class="card-top-row">
          <span class="subject-pill ${subjClass}">${escapeHtml(ch.subject)}</span>
          <span class="mono" style="font-size: 11px; color: ${R >= 0.85 ? 'var(--emerald-retained)' : 'var(--amber-hazard)'};">
            R(t): <strong>${Math.round(R * 100)}%</strong> (${elapsedDays}d ago)
          </span>
        </div>
        <div class="chapter-main-row">
          <span class="chapter-title">${escapeHtml(ch.name)}</span>
          <span class="tier-badge mono">${tier.name}</span>
        </div>
        <div style="display: flex; gap: 12px; font-size: 11.5px; color: var(--text-muted); background: rgba(0,0,0,0.25); padding: 8px 10px; border-radius: var(--radius-sm);">
          <div>Stability: <strong class="mono" style="color: var(--text-main);">${ch.S}d</strong></div>
          <div>Difficulty (D): <strong class="mono" style="color: var(--text-main);">${ch.D}</strong></div>
          <div>Lapses: <strong class="mono" style="color: ${ch.lapses > 0 ? '#F87171' : 'var(--text-main)'};">${ch.lapses || 0}</strong></div>
          <div>Vault Notes: <strong class="mono" style="color: var(--cyan-core);">${vaultCount}</strong></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; border-top: 1px dashed var(--border-subtle); padding-top: 6px;">
          <span style="color: var(--text-dim);">${ch.parents && ch.parents.length > 0 ? `${ch.parents.length} Prerequisite Parent(s)` : 'Foundational Root Topic'}</span>
          <span style="color: var(--cyan-core); font-weight: 700;">View Telemetry &rarr;</span>
        </div>
      `;

      div.addEventListener("click", () => {
        openChapterDetailModal(ch.id);
      });

      el.syllabusListContainer.appendChild(div);
    });
  }

  // -------------------------------------------------------------
  // IMMUTABLE AUDIT LEDGER (Human-Readable Activity Cards)
  // -------------------------------------------------------------
  function renderAuditLedger() {
    const state = DSRStore.getState();
    const logs = state.auditLogs || [];

    const filtered = logs.filter((log) => {
      if (activeAuditFilter !== "ALL" && log.inputType !== activeAuditFilter) {
        return false;
      }
      if (auditSearchQuery.trim()) {
        const q = auditSearchQuery.toLowerCase();
        const jsonStr = (JSON.stringify(log.rawInputs) + JSON.stringify(log.computedOutputs) + log.inputType + log.entryMethod).toLowerCase();
        return jsonStr.includes(q);
      }
      return true;
    });

    el.auditCountLabel.textContent = `${filtered.length} Events`;
    el.auditLogListContainer.innerHTML = "";

    if (filtered.length === 0) {
      el.auditLogListContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 16px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle); color: var(--text-dim);">
          No audit records found matching criteria.
        </div>
      `;
      return;
    }

    filtered.forEach((log) => {
      const card = createHumanReadableAuditCard(log);
      el.auditLogListContainer.appendChild(card);
    });
  }

  function createHumanReadableAuditCard(log) {
    const card = document.createElement("div");
    card.className = "log-card";

    let badgeColor = "var(--cyan-core)";
    let badgeBg = "rgba(56, 189, 248, 0.15)";
    let actionIcon = "📝";
    let title = "System Event";
    let narrative = "";
    let chips = [];

    const raw = log.rawInputs || {};
    const comp = log.computedOutputs || {};
    const displayRaw = { ...raw };

    if (log.inputType === "POST_STUDY_REVIEW" || log.inputType === "AD_HOC_REVIEW" || log.inputType === "SYNTHESIS_BATTLE") {
      const isSyn = log.inputType === "SYNTHESIS_BATTLE";
      badgeColor = isSyn ? "#C084FC" : "#10B981";
      badgeBg = isSyn ? "rgba(139, 92, 246, 0.2)" : "rgba(16, 185, 129, 0.15)";
      actionIcon = isSyn ? "🟣" : "📖";
      const chapter = raw.chapterName || "Chapter Review";
      title = `${actionIcon} ${isSyn ? 'Synthesis Battle' : 'Study Review'}: ${chapter}`;

      const passed = comp.passed !== false;
      const qVal = comp.Q !== undefined ? comp.Q : "--";
      const totalP = raw.totalProblems || 10;
      const corrP = raw.correctProblems || 0;
      const acc = Math.round((corrP / totalP) * 100);
      const sOld = comp.S_old !== undefined ? comp.S_old : "--";
      const sNew = comp.S_new !== undefined ? comp.S_new : "--";

      // Fallback: Default to Rigor Tier 2 (Standard / JEE Main) if missing
      const rigorTier = Number(raw.rigorTier || comp.rigorTier) || 2;
      const rigorConfig = DSREngine.RIGOR_CONFIG ? DSREngine.RIGOR_CONFIG[rigorTier] : null;
      const rigorLabel = raw.rigorLabel || (rigorConfig ? rigorConfig.label : "Standard / JEE Main");
      const rigorMult = Number(raw.rigorMult || comp.rigorMult || (rigorConfig ? rigorConfig.stabilityBonus : 1.00));
      const pAdj = comp.P_adj !== undefined ? comp.P_adj : acc;
      const pTrue = comp.P_true !== undefined ? comp.P_true : acc;

      displayRaw.rigorTier = rigorTier;
      displayRaw.rigorLabel = rigorLabel;
      displayRaw.rigorMult = Number(rigorMult.toFixed(2));

      narrative = `Completed revision of <strong>${escapeHtml(chapter)}</strong>. Solved <strong>${corrP}/${totalP}</strong> problems correctly (${acc}% raw accuracy). Mastery: <strong>${pAdj}%</strong> (Raw: <strong>${pTrue}%</strong>) · Rigor: <strong>${escapeHtml(rigorLabel)}</strong> (${rigorMult.toFixed(2)}x S-mult). Result: <strong style="color: ${passed ? '#34D399' : '#F87171'};">${passed ? 'Passed (Retained)' : 'Lapsed (Needs Rebuild)'}</strong> with quality grade <strong>Q = ${qVal}</strong>.`;

      chips.push(`🎯 Rigor: ${escapeHtml(rigorLabel)} (${rigorMult.toFixed(2)}x)`);
      chips.push(`Grade: Q = ${qVal}`);
      chips.push(`Mastery: ${pAdj}%`);
      chips.push(`Stability: ${sOld}d → ${sNew}d`);
      if (comp.D_old && comp.D_new) chips.push(`Difficulty: ${comp.D_old} → ${comp.D_new}`);
      if (raw.sillySlips) chips.push(`Silly Slips: ${raw.sillySlips}`);
      if (raw.conceptBlanks) chips.push(`Concept Blanks: ${raw.conceptBlanks}`);
      if (raw.durationMins) chips.push(`Time: ${raw.durationMins}m`);
      if (comp.nextDueDays) chips.push(`Next Due: ${comp.nextDueDays}d`);
      if (raw.faultLineNote && raw.faultLineNote !== "(None)") chips.push(`Fault-Line: "${escapeHtml(raw.faultLineNote)}"`);
      if (Array.isArray(comp.parentBoosts) && comp.parentBoosts.length > 0) {
        comp.parentBoosts.forEach((pb) => {
          if (pb.boostDays) chips.push(`+${pb.boostDays}d to ${escapeHtml(pb.parentName)}`);
        });
      }
    } else if (log.inputType === "NEW_CHAPTER") {
      badgeColor = "var(--cyan-core)";
      badgeBg = "rgba(56, 189, 248, 0.15)";
      actionIcon = "➕";
      const chapter = raw.name || "New Topic";
      title = `➕ Added Chapter: ${chapter}`;
      narrative = `Added new chapter <strong>${escapeHtml(chapter)}</strong> (${escapeHtml(raw.subject || 'STEM')}) at intrinsic difficulty <strong>D₀ = ${raw.D0 || 5.0}</strong>. Initialized Day-0 baseline stability in <strong>${escapeHtml(comp.startingTier || 'Tier 1')}</strong>.`;

      if (comp.initialS) chips.push(`Initial S: ${comp.initialS}d`);
      if (raw.weightage) chips.push(`Weightage: ${raw.weightage}x`);
      if (comp.firstReviewDue) chips.push(`First Due: ${escapeHtml(comp.firstReviewDue)}`);
      if (raw.parentsCount) chips.push(`Prerequisites: ${raw.parentsCount}`);
    } else if (log.inputType === "MOCK_TEST_LOG") {
      badgeColor = "#F59E0B";
      badgeBg = "rgba(245, 158, 11, 0.15)";
      actionIcon = "🧪";
      const testName = raw.testName || "Mock Test Matrix";
      title = `🧪 Mock Test Audit: ${testName}`;
      const count = raw.chaptersCount || (raw.rows ? raw.rows.length : 0);
      const mockToughnessTier = Number(raw.mockToughness || raw.rigorTier) || 2;
      const mockToughnessLabel = raw.mockToughnessLabel || (mockToughnessTier === 3 ? "Tough (JEE Advanced)" : mockToughnessTier === 4 ? "Elite (AITS / Olympiad)" : "Standard (JEE Main)");

      displayRaw.mockToughnessTier = mockToughnessTier;
      displayRaw.mockToughnessLabel = mockToughnessLabel;

      narrative = `Logged full exam post-mortem for <strong>${escapeHtml(testName)}</strong> (${escapeHtml(raw.testDate || 'Today')}) at Toughness: <strong>${escapeHtml(mockToughnessLabel)}</strong> across ${count} tested chapters with automated back-propagation.`;

      chips.push(`🎯 Toughness: ${escapeHtml(mockToughnessLabel)}`);
      if (Array.isArray(comp.affectedChapters)) {
        comp.affectedChapters.forEach((ac) => {
          chips.push(`${escapeHtml(ac.chapter)}: ${escapeHtml(ac.impact || 'Updated')}`);
        });
      }
    } else if (log.inputType === "EXAM_SETTINGS_UPDATE") {
      badgeColor = "#A78BFA";
      badgeBg = "rgba(167, 139, 250, 0.15)";
      actionIcon = "⚙️";
      title = `⚙️ Exam Calibration Updated`;
      const upd = comp.updated || comp.newSettings || {};
      const changesList = Object.entries(upd)
        .filter(([k]) => k !== "totalReviewsLogged")
        .map(([k, v]) => `<strong>${escapeHtml(k)}</strong>: ${escapeHtml(String(v))}`)
        .join(", ");
      narrative = changesList ? `Updated system calibration parameters: ${changesList}.` : "Exam settings calibrated.";
      Object.entries(upd).forEach(([k, v]) => {
        if (k !== "totalReviewsLogged") chips.push(`${k}: ${v}`);
      });
    } else if (log.inputType === "RESTORE_BACKUP") {
      badgeColor = "#38BDF8";
      badgeBg = "rgba(56, 189, 248, 0.15)";
      actionIcon = "📦";
      title = `📦 Data Restored from Backup`;
      narrative = `Restored state successfully from JSON backup file.`;
      if (raw.totalChapters) chips.push(`Chapters: ${raw.totalChapters}`);
      if (raw.totalLogs) chips.push(`Logs: ${raw.totalLogs}`);
    } else {
      title = `📝 ${log.inputType}`;
      narrative = `Event recorded in ledger.`;
    }

    const rawJsonStr = escapeHtml(JSON.stringify({ rawInputs: displayRaw, computedOutputs: comp }, null, 2));

    card.innerHTML = `
      <div class="log-top-row">
        <span class="log-badge mono" style="color: ${badgeColor}; background: ${badgeBg};">
          ${escapeHtml(log.inputType)}
        </span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="mono" style="font-size: 11px; color: var(--text-dim);">
            ${escapeHtml(log.displayDate)} · ${escapeHtml(log.displayTime)}
          </span>
          <button class="btn-delete-log" title="Delete this record" style="background: transparent; border: none; color: #EF4444; cursor: pointer; padding: 2px 4px; display: flex; align-items: center; justify-content: center; opacity: 0.85;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="log-entry-path">
        <span>Via: ${escapeHtml(log.entryMethod)}</span>
      </div>
      <div class="log-title-row">
        <span>${title}</span>
      </div>
      <div class="log-narrative">
        ${narrative}
      </div>
      ${chips.length > 0 ? `<div class="log-chips-row">${chips.map((c) => `<span class="log-chip">${c}</span>`).join('')}</div>` : ''}
      <button class="log-json-toggle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <span>Toggle Raw Telemetry & Math</span>
      </button>
      <div class="log-details-table">
        <pre>${rawJsonStr}</pre>
      </div>
    `;

    const btnDel = card.querySelector(".btn-delete-log");
    if (btnDel) {
      btnDel.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Delete this entry from the audit ledger?")) {
          DSRStore.deleteAuditLog(log.id);
          showToast("Audit log entry deleted.");
        }
      });
    }

    const btnToggle = card.querySelector(".log-json-toggle");
    const drawer = card.querySelector(".log-details-table");
    btnToggle.addEventListener("click", () => {
      drawer.classList.toggle("open");
      btnToggle.querySelector("span").textContent = drawer.classList.contains("open")
        ? "Hide Raw Telemetry"
        : "Toggle Raw Telemetry & Math";
    });

    return card;
  }

  function renderCurrentView() {
    if (activeTab === "dashboard") renderDashboard();
    else if (activeTab === "syllabus") renderSyllabus();
    else if (activeTab === "audit") renderAuditLedger();
  }

  // -------------------------------------------------------------
  // MODAL 1: ADD NEW CHAPTER CONTROLLER
  // -------------------------------------------------------------
  let newChapterSubject = "Physics";
  let newChapterWeightage = 1.0;

  function initAddChapterModal() {
    document.querySelectorAll("#segNewSubject .segmented-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        document.querySelectorAll("#segNewSubject .segmented-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        newChapterSubject = opt.getAttribute("data-value");
        renderParentPrerequisitesList();
        updateNewChapterPreview();
      });
    });

    document.querySelectorAll("#segNewWeightage .segmented-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        document.querySelectorAll("#segNewWeightage .segmented-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        newChapterWeightage = Number(opt.getAttribute("data-value"));
        updateNewChapterPreview();
      });
    });

    const sliderD0 = document.getElementById("sliderNewD0");
    const lblD0 = document.getElementById("lblNewD0Val");
    sliderD0.addEventListener("input", () => {
      lblD0.textContent = Number(sliderD0.value).toFixed(1);
      updateNewChapterPreview();
    });

    document.getElementById("btnSaveNewChapter").addEventListener("click", () => {
      const titleInput = document.getElementById("inpNewChapterName");
      const title = titleInput.value.trim();
      if (!title) {
        showToast("Please enter a chapter title.");
        titleInput.focus();
        return;
      }

      // Collect selected parents
      const parents = [];
      document.querySelectorAll(".parent-prereq-checkbox:checked").forEach((chk) => {
        const parentId = chk.getAttribute("data-parent-id");
        const slider = document.querySelector(`.parent-weight-slider[data-parent-id="${parentId}"]`);
        const weight = slider ? Number(slider.value) : 0.40;
        parents.push({ parentId, couplingWeight: weight });
      });

      const d0 = Number(sliderD0.value);
      DSRStore.addChapter({
        name: title,
        subject: newChapterSubject,
        D0: d0,
        weightage: newChapterWeightage,
        parents
      });

      titleInput.value = "";
      closeAllModals();
      showToast(`Added ${title} (Day-0 initialized)`);
    });
  }

  function renderParentPrerequisitesList() {
    const listWrap = document.getElementById("newChapterParentsList");
    const state = DSRStore.getState();
    const sameSubject = state.chapters.filter((c) => c.subject === newChapterSubject);

    listWrap.innerHTML = "";
    if (sameSubject.length === 0) {
      listWrap.innerHTML = `<div style="font-size: 11px; color: var(--text-dim);">No existing ${newChapterSubject} chapters to link as prerequisites.</div>`;
      return;
    }

    sameSubject.forEach((ch) => {
      const row = document.createElement("div");
      row.style.background = "var(--bg-card)";
      row.style.border = "1px solid var(--border-subtle)";
      row.style.borderRadius = "var(--radius-sm)";
      row.style.padding = "8px 10px";
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "6px";

      row.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; cursor: pointer;">
            <input type="checkbox" class="parent-prereq-checkbox" data-parent-id="${ch.id}" />
            <span>${escapeHtml(ch.name)}</span>
          </label>
          <span class="mono parent-weight-label" data-parent-id="${ch.id}" style="font-size: 11px; color: var(--cyan-core); display: none;">40% coupling</span>
        </div>
        <div class="parent-slider-wrap" data-parent-id="${ch.id}" style="display: none; flex-direction: column; gap: 2px;">
          <input type="range" class="range-input parent-weight-slider" data-parent-id="${ch.id}" min="0.10" max="0.60" step="0.05" value="0.40" />
        </div>
      `;

      const chk = row.querySelector(".parent-prereq-checkbox");
      const sliderWrap = row.querySelector(".parent-slider-wrap");
      const weightLbl = row.querySelector(".parent-weight-label");
      const slider = row.querySelector(".parent-weight-slider");

      chk.addEventListener("change", () => {
        if (chk.checked) {
          sliderWrap.style.display = "flex";
          weightLbl.style.display = "inline";
        } else {
          sliderWrap.style.display = "none";
          weightLbl.style.display = "none";
        }
      });

      slider.addEventListener("input", () => {
        weightLbl.textContent = `${Math.round(slider.value * 100)}% coupling`;
      });

      listWrap.appendChild(row);
    });
  }

  function updateNewChapterPreview() {
    const d0 = Number(document.getElementById("sliderNewD0").value);
    const S1 = DSREngine.calculateInitialStability(d0, 4.0);
    const tier = DSREngine.getSessionTier(S1);
    const settings = DSRStore.getState().settings;

    const mockChapter = { D0: d0, D: d0, S: S1 };
    const intervalDays = DSREngine.calculateNextIntervalDays(mockChapter, settings, Date.now());
    const nextDue = new Date(Date.now() + intervalDays * 86400000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });

    document.getElementById("prevNewS1").textContent = `${S1} Days`;
    document.getElementById("prevNewDue").textContent = `${nextDue} (in ${intervalDays}d)`;
    document.getElementById("prevNewTier").textContent = tier.name;
  }

  // -------------------------------------------------------------
  // MODAL 2: POST-STUDY SESSION AUDIT CONTROLLER
  // -------------------------------------------------------------
  let postStudyBlankPageScore = 3;
  let postStudySillySlips = 0;
  let selectedPostStudyRigorTier = 2;

  const RIGOR_CONFIG_LABELS = {
    1: "Strict grading · 0.85x S-mult",
    2: "Baseline curve · 1.0x S-mult",
    3: "Forgiving curve · 1.20x S-mult",
    4: "High strain · 1.35x S-mult"
  };

  function setPostStudyRigorTier(tierVal) {
    selectedPostStudyRigorTier = Number(tierVal) || 2;
    document.querySelectorAll("#rigorSelectorGroup .rigor-pill-btn").forEach((btn) => {
      const bTier = Number(btn.getAttribute("data-rigor")) || 2;
      btn.classList.toggle("active", bTier === selectedPostStudyRigorTier);
    });
    const subLabel = document.getElementById("lblRigorSelectionSub");
    if (subLabel) {
      subLabel.textContent = RIGOR_CONFIG_LABELS[selectedPostStudyRigorTier] || RIGOR_CONFIG_LABELS[2];
    }
  }

  function initPostStudyModal() {
    // Star Rating
    document.querySelectorAll("#starRatingGroup .star-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#starRatingGroup .star-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        postStudyBlankPageScore = Number(btn.getAttribute("data-val"));

        const rubrics = {
          1: "1 = Complete blankout / Zero retention",
          2: "2 = Disjointed fragments recalled",
          3: "3 = Recalled with heavy strain",
          4: "4 = Smooth recall with minor hesitation",
          5: "5 = Instant fluid recall & derivation"
        };
        document.getElementById("lblBlankPageDesc").textContent = rubrics[postStudyBlankPageScore];
        updatePostStudyLivePreview();
      });
    });

    // Rigor Pill Selector
    document.querySelectorAll("#rigorSelectorGroup .rigor-pill-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rTier = Number(btn.getAttribute("data-rigor")) || 2;
        setPostStudyRigorTier(rTier);
        updatePostStudyLivePreview();
      });
    });

    // Problems Attempted & Correct inputs
    const inpTotal = document.getElementById("inpTotalProblems");
    const inpCorrect = document.getElementById("inpCorrectProblems");
    inpTotal.addEventListener("input", () => {
      validateProblemsInput();
      updatePostStudyLivePreview();
    });
    inpCorrect.addEventListener("input", () => {
      validateProblemsInput();
      updatePostStudyLivePreview();
    });

    // Silly Slips Stepper
    document.getElementById("btnDecSilly").addEventListener("click", () => {
      if (postStudySillySlips > 0) {
        postStudySillySlips--;
        document.getElementById("lblSillyVal").textContent = postStudySillySlips;
        validateProblemsInput();
        updatePostStudyLivePreview();
      }
    });

    document.getElementById("btnIncSilly").addEventListener("click", () => {
      const total = Number(inpTotal.value) || 10;
      const correct = Number(inpCorrect.value) || 0;
      const wrong = Math.max(0, total - correct);
      if (postStudySillySlips < wrong) {
        postStudySillySlips++;
        document.getElementById("lblSillyVal").textContent = postStudySillySlips;
        validateProblemsInput();
        updatePostStudyLivePreview();
      }
    });

    document.getElementById("inpDurationMins").addEventListener("input", updatePostStudyLivePreview);

    document.getElementById("postStudyChapterSelect").addEventListener("change", (e) => {
      currentAuditingChapterId = e.target.value;
      populatePostStudyDefaults(currentAuditingChapterId);
      updatePostStudyLivePreview();
    });

    // Stopwatch actions
    document.getElementById("btnStopwatchStart").addEventListener("click", toggleStopwatch);
    document.getElementById("btnStopwatchNextPhase").addEventListener("click", nextStopwatchPhase);
    document.getElementById("btnStopwatchReset").addEventListener("click", resetStopwatch);

    // Confirm post study
    document.getElementById("btnConfirmPostStudy").addEventListener("click", submitPostStudySession);
  }

  function validateProblemsInput() {
    const total = Math.max(1, Number(document.getElementById("inpTotalProblems").value) || 10);
    let correct = Number(document.getElementById("inpCorrectProblems").value);
    if (isNaN(correct)) correct = 0;
    correct = DSREngine.clamp(0, total, correct);
    document.getElementById("inpCorrectProblems").value = correct;

    const wrong = total - correct;
    document.getElementById("lblTotalWrong").textContent = `${wrong} Wrong Answer${wrong === 1 ? '' : 's'}`;

    if (postStudySillySlips > wrong) {
      postStudySillySlips = wrong;
    }
    document.getElementById("lblSillyVal").textContent = postStudySillySlips;
    const blanks = wrong - postStudySillySlips;
    document.getElementById("lblConceptBlanksVal").textContent = `${blanks} Blank${blanks === 1 ? '' : 's'}`;
  }

  function openPostStudyModal(chapterId, isAdHoc = false) {
    isAdHocMode = isAdHoc;
    isSynthesisSession = false;
    currentAuditingChapterId = chapterId;

    const state = DSRStore.getState();
    const selectorWrap = document.getElementById("postStudyChapterSelectorWrap");
    const select = document.getElementById("postStudyChapterSelect");

    if (isAdHoc) {
      selectorWrap.style.display = "flex";
      select.innerHTML = state.chapters
        .map((c) => `<option value="${c.id}" ${c.id === chapterId ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.subject)})</option>`)
        .join("");
      document.getElementById("postStudyModalTitle").textContent = "Ad-Hoc Session Audit";
    } else {
      selectorWrap.style.display = "none";
      const ch = state.chapters.find((c) => c.id === chapterId);
      document.getElementById("postStudyModalTitle").textContent = ch ? `Audit: ${ch.name}` : "Session Audit";
    }

    resetStopwatch();
    populatePostStudyDefaults(chapterId);
    openModal(el.modalPostStudy);
    updatePostStudyLivePreview();
  }

  function launchSynthesisBattle(chapter) {
    openPostStudyModal(chapter.id, false);
    isSynthesisSession = true;
    document.getElementById("postStudyModalTitle").textContent = `Synthesis Boss Battle: ${chapter.name}`;
    updatePostStudyLivePreview();
  }

  function populatePostStudyDefaults(chapterId) {
    const state = DSRStore.getState();
    const chapter = state.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;

    const tier = DSREngine.getSessionTier(chapter.S);
    document.getElementById("inpTotalProblems").value = tier.recommendedProblems;
    document.getElementById("inpCorrectProblems").value = Math.max(1, tier.recommendedProblems - 2);
    document.getElementById("inpDurationMins").value = tier.durationMins;
    document.getElementById("inpFaultLineNote").value = "";

    // Auto-Selection Logic: If Tier 1, pre-select Tier 2. If Tier 2 or 3, pre-select Tier 3.
    if (tier.tier === 1) {
      setPostStudyRigorTier(2);
    } else {
      setPostStudyRigorTier(3);
    }

    postStudyBlankPageScore = 3;
    postStudySillySlips = 1;
    document.querySelectorAll("#starRatingGroup .star-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-val") === "3");
    });
    document.getElementById("lblBlankPageDesc").textContent = "3 = Recalled with heavy strain";

    validateProblemsInput();
  }

  function updatePostStudyLivePreview() {
    const state = DSRStore.getState();
    const chapter = state.chapters.find((c) => c.id === currentAuditingChapterId);
    if (!chapter) return;

    const totalVal = document.getElementById("inpTotalProblems").value;
    const totalProblems = totalVal === "" ? 10 : Math.max(0, Number(totalVal));
    const correctProblems = Number(document.getElementById("inpCorrectProblems").value) || 0;
    const durationMins = Number(document.getElementById("inpDurationMins").value) || 30;

    const inputs = {
      blankPageScore: postStudyBlankPageScore,
      totalProblems,
      correctProblems,
      sillySlips: postStudySillySlips,
      durationMins,
      rigorTier: selectedPostStudyRigorTier,
      isSynthesisBattle: isSynthesisSession
    };

    const outcome = DSREngine.evaluateStudySession(chapter, inputs, state.settings, Date.now());

    // Q Grade display
    const qColor = outcome.passed ? "var(--emerald-retained)" : "#F87171";
    document.getElementById("prevQGrade").innerHTML = `<span style="color: ${qColor};">Q = ${outcome.Q} (${outcome.passed ? 'PASSED' : 'LAPSED'})</span>`;
    document.getElementById("prevAccuracy").textContent = `Mastery: ${outcome.P_adj}% (Raw: ${outcome.P_true}%) | Rigor Mult: ${outcome.rigorMult.toFixed(2)}x`;
    document.getElementById("prevStabilityShift").textContent = `${outcome.S_old}d → ${outcome.S_new}d`;

    // Next due preview
    const mockUpdatedChapter = { ...chapter, S: outcome.S_new, D: outcome.D_new };
    const nextInterval = DSREngine.calculateNextIntervalDays(mockUpdatedChapter, state.settings, Date.now());
    const nextDate = new Date(Date.now() + nextInterval * 86400000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
    document.getElementById("prevNextDue").textContent = `${nextDate} (in ${nextInterval}d)`;
    document.getElementById("prevTierShift").textContent = `${DSREngine.getSessionTier(chapter.S).name} → ${outcome.newTierInfo.name}`;

    // Conditional Parent Blame checkbox
    const parentBlameWrap = document.getElementById("parentBlameWrap");
    if (!outcome.passed && Array.isArray(chapter.parents) && chapter.parents.length > 0) {
      parentBlameWrap.style.display = "flex";
      const parentNames = chapter.parents
        .map((p) => {
          const pch = state.chapters.find((c) => c.id === p.parentId);
          return pch ? pch.name : "Parent";
        })
        .join(", ");
      document.getElementById("lblParentBlameText").textContent = `Did you miss questions due to forgotten concepts in prerequisite (${parentNames})?`;
    } else {
      parentBlameWrap.style.display = "none";
    }

    // Parent boost preview
    const parentBoostRow = document.getElementById("prevParentBoostRow");
    if (outcome.passed && Array.isArray(chapter.parents) && chapter.parents.length > 0) {
      const firstParent = chapter.parents[0];
      const pch = state.chapters.find((c) => c.id === firstParent.parentId);
      if (pch) {
        const boost = DSREngine.calculateParentBoost(pch, chapter, firstParent.couplingWeight, state.settings);
        if (boost.boosted) {
          parentBoostRow.style.display = "flex";
          document.getElementById("prevParentBoostVal").textContent = `+${boost.deltaS}d to ${pch.name}`;
        } else {
          parentBoostRow.style.display = "none";
        }
      } else {
        parentBoostRow.style.display = "none";
      }
    } else {
      parentBoostRow.style.display = "none";
    }
  }

  function submitPostStudySession() {
    const state = DSRStore.getState();
    const chapter = state.chapters.find((c) => c.id === currentAuditingChapterId);
    if (!chapter) {
      showToast("Chapter not found.");
      return;
    }

    const totalVal = document.getElementById("inpTotalProblems").value;
    const totalProblems = totalVal === "" ? 10 : Math.max(0, Number(totalVal));
    const correctProblems = Number(document.getElementById("inpCorrectProblems").value) || 0;
    const durationMins = Number(document.getElementById("inpDurationMins").value) || 30;
    const faultLineNote = document.getElementById("inpFaultLineNote").value.trim();
    const blameParent = document.getElementById("chkParentBlame").checked;

    const now = Date.now();
    const inputs = {
      blankPageScore: postStudyBlankPageScore,
      totalProblems,
      correctProblems,
      sillySlips: postStudySillySlips,
      durationMins,
      rigorTier: selectedPostStudyRigorTier,
      isSynthesisBattle: isSynthesisSession
    };

    const outcome = DSREngine.evaluateStudySession(chapter, inputs, state.settings, now);

    // Apply Chapter updates
    chapter.S = outcome.S_new;
    chapter.D = outcome.D_new;
    chapter.hazardIndex = outcome.newHazardIndex;
    chapter.lapses = outcome.newLapses;
    chapter.lastReviewTimestamp = now;
    if (outcome.passed) {
      chapter.lastDirectS = outcome.S_new;
    }

    // Append to Fault-Line Vault if provided
    if (faultLineNote) {
      if (!Array.isArray(chapter.faultLineVault)) chapter.faultLineVault = [];
      chapter.faultLineVault.unshift({
        id: "fl_" + Date.now(),
        note: faultLineNote,
        missCount: 1,
        lastMissed: new Date().toISOString().split("T")[0]
      });
    }

    // Parent Graph Propagation
    const parentBoostsSummary = [];
    if (outcome.passed && Array.isArray(chapter.parents)) {
      chapter.parents.forEach((link) => {
        const pChapter = state.chapters.find((c) => c.id === link.parentId);
        if (pChapter) {
          const boost = DSREngine.calculateParentBoost(pChapter, chapter, link.couplingWeight, state.settings, now);
          if (boost.boosted) {
            pChapter.S = boost.newS;
            parentBoostsSummary.push({ parentName: pChapter.name, boostDays: boost.deltaS });
          }
        }
      });
    } else if (!outcome.passed && blameParent && Array.isArray(chapter.parents) && chapter.parents.length > 0) {
      // Dock parent stability / adjust lastReviewTimestamp so R_P = 0.78 (Emergency Rescue Queue)
      const pLink = chapter.parents[0];
      const pChapter = state.chapters.find((c) => c.id === pLink.parentId);
      if (pChapter) {
        // Compute elapsed days needed for R = 0.78
        const { wd, Fd } = DSREngine.getDecayParams(pChapter.D);
        const theta = DSREngine.getTheta(pChapter, state.settings);
        const effectiveS = pChapter.S * theta;
        const targetElapsedDays = (effectiveS / Fd) * (Math.pow(0.78, -1 / wd) - 1);
        pChapter.lastReviewTimestamp = now - targetElapsedDays * 86400000;
        parentBoostsSummary.push({ parentName: pChapter.name, emergencyInterception: "Pulled to Critical Rescue (R = 0.78)" });
      }
    }

    // Online gradient descent updates for personal calibration scalars
    state.settings.thetaLogic = outcome.newThetaLogic;
    state.settings.thetaRote = outcome.newThetaRote;
    state.settings.totalReviewsLogged = (state.settings.totalReviewsLogged || 0) + 1;

    // Log Immutable Audit Record
    const entryMethod = isSynthesisSession
      ? "To-Do Dashboard -> Synthesis Boss Battle"
      : isAdHocMode
      ? "Bottom-Right FAB (+) -> Ad-Hoc Review Modal"
      : "To-Do Dashboard Card Tap -> Post-Study Modal";

    const nextDays = DSREngine.calculateNextIntervalDays(chapter, state.settings, now);
    const nextDate = new Date(now + nextDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    DSRStore.logUserAction(
      isSynthesisSession ? "SYNTHESIS_BATTLE" : isAdHocMode ? "AD_HOC_REVIEW" : "POST_STUDY_REVIEW",
      entryMethod,
      {
        chapterName: chapter.name,
        blankPageScore: postStudyBlankPageScore,
        totalProblems,
        correctProblems,
        sillySlips: postStudySillySlips,
        conceptBlanks: outcome.M_mem,
        durationMins,
        faultLineNote: faultLineNote || "(None)",
        parentBlameTriggered: blameParent,
        rigorTier: outcome.rigorTier,
        rigorLabel: outcome.rigorLabel,
        rigorMult: outcome.rigorMult
      },
      {
        Q: outcome.Q,
        passed: outcome.passed,
        P_adj: outcome.P_adj,
        P_true: outcome.P_true,
        rigorMult: outcome.rigorMult,
        S_old: outcome.S_old,
        S_new: outcome.S_new,
        D_old: outcome.D_old,
        D_new: outcome.D_new,
        nextDueDays: nextDays,
        nextDueDate: nextDate,
        parentBoosts: parentBoostsSummary.length > 0 ? parentBoostsSummary : "(None)"
      }
    );

    DSRStore.saveState();
    closeAllModals();
    showToast(`Session logged for ${chapter.name}: Q=${outcome.Q} (${outcome.passed ? 'Passed' : 'Lapsed'})`);
  }

  // -------------------------------------------------------------
  // STOPWATCH CONTROLLER
  // -------------------------------------------------------------
  function toggleStopwatch() {
    if (stopwatchRunning) {
      stopStopwatch();
    } else {
      startStopwatch();
    }
  }

  function startStopwatch() {
    stopwatchRunning = true;
    document.getElementById("btnStopwatchStart").textContent = "Pause";
    stopwatchInterval = setInterval(() => {
      stopwatchSeconds++;
      updateStopwatchDisplay();
    }, 1000);
  }

  function stopStopwatch() {
    stopwatchRunning = false;
    document.getElementById("btnStopwatchStart").textContent = "Start";
    if (stopwatchInterval) {
      clearInterval(stopwatchInterval);
      stopwatchInterval = null;
    }
    // Auto-populate duration field
    const mins = Math.max(1, Math.round(stopwatchSeconds / 60));
    document.getElementById("inpDurationMins").value = mins;
    updatePostStudyLivePreview();
  }

  function resetStopwatch() {
    stopStopwatch();
    stopwatchSeconds = 0;
    stopwatchPhase = 1;
    updateStopwatchPhaseUI();
    updateStopwatchDisplay();
  }

  function nextStopwatchPhase() {
    stopwatchPhase = (stopwatchPhase % 3) + 1;
    updateStopwatchPhaseUI();
  }

  function updateStopwatchPhaseUI() {
    const phases = {
      1: "PHASE 1: BLANK-PAGE RECALL",
      2: "PHASE 2: 2-MIN RED-PEN AUDIT",
      3: "PHASE 3: PROBLEM CHUNK"
    };
    document.getElementById("stopwatchPhaseLabel").textContent = phases[stopwatchPhase];
  }

  function updateStopwatchDisplay() {
    const m = Math.floor(stopwatchSeconds / 60);
    const s = stopwatchSeconds % 60;
    document.getElementById("stopwatchDisplay").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // -------------------------------------------------------------
  // MODAL 3: MOCK TEST POST-MORTEM MATRIX CONTROLLER
  // -------------------------------------------------------------
  let mockTestRows = [];

  function initMockTestModal() {
    document.getElementById("inpMockTestDate").value = new Date().toISOString().split("T")[0];
    document.getElementById("btnAddMockRow").addEventListener("click", addMockTestRow);
    document.getElementById("btnApplyMockTest").addEventListener("click", applyMockTestMatrix);
    document.getElementById("selMockTestToughness")?.addEventListener("change", updateMockImpactPreview);
  }

  function openMockTestModal() {
    mockTestRows = [];
    document.getElementById("mockRowsContainer").innerHTML = "";
    document.getElementById("inpMockTestName").value = "JEE Advanced Mock " + String(Math.floor(Math.random() * 90) + 10);
    const selTough = document.getElementById("selMockTestToughness");
    if (selTough) selTough.value = "2";
    addMockTestRow();
    openModal(el.modalMockTest);
  }

  function addMockTestRow() {
    const state = DSRStore.getState();
    const rowId = "mock_row_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    const rowEl = document.createElement("div");
    rowEl.className = "mock-test-row";
    rowEl.id = rowId;
    rowEl.style.background = "var(--bg-card)";
    rowEl.style.border = "1px solid var(--border-accent)";
    rowEl.style.borderRadius = "var(--radius-md)";
    rowEl.style.padding = "10px 12px";
    rowEl.style.display = "flex";
    rowEl.style.flexDirection = "column";
    rowEl.style.gap = "8px";

    const chapterOptions = state.chapters
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.subject)})</option>`)
      .join("");

    rowEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <select class="form-select mock-row-chapter" style="flex: 1; padding: 6px 10px; font-size: 13px;">
          ${chapterOptions}
        </select>
        <button class="close-btn btn-remove-mock-row" style="margin-left: 8px;">&times;</button>
      </div>
      <div style="display: flex; gap: 8px; font-size: 11px;">
        <div style="flex: 1;">
          <span style="color: var(--text-dim);">Attempted</span>
          <input type="number" class="form-input mono mock-inp-attempted" min="1" max="20" value="3" style="padding: 6px;" />
        </div>
        <div style="flex: 1;">
          <span style="color: var(--text-dim);">Correct</span>
          <input type="number" class="form-input mono mock-inp-correct" min="0" max="20" value="2" style="padding: 6px;" />
        </div>
        <div style="flex: 1;">
          <span style="color: var(--text-dim);">Silly Slips</span>
          <input type="number" class="form-input mono mock-inp-silly" min="0" max="20" value="1" style="padding: 6px;" />
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px;">
        <span class="mock-row-blanks mono" style="color: var(--text-muted);">Concept Lapses: <strong>0</strong></span>
        <span class="mock-row-verdict mono" style="font-weight: 700; color: var(--cyan-core);">Partial Pass</span>
      </div>
    `;

    const inpAtt = rowEl.querySelector(".mock-inp-attempted");
    const inpCorr = rowEl.querySelector(".mock-inp-correct");
    const inpSilly = rowEl.querySelector(".mock-inp-silly");
    const selChap = rowEl.querySelector(".mock-row-chapter");
    const lblBlanks = rowEl.querySelector(".mock-row-blanks");
    const lblVerdict = rowEl.querySelector(".mock-row-verdict");
    const btnRem = rowEl.querySelector(".btn-remove-mock-row");

    function updateRowCalc() {
      const att = Math.max(1, Number(inpAtt.value) || 1);
      const corr = DSREngine.clamp(0, att, Number(inpCorr.value) || 0);
      inpCorr.value = corr;
      const wrong = att - corr;
      const silly = DSREngine.clamp(0, wrong, Number(inpSilly.value) || 0);
      inpSilly.value = silly;
      const conceptLapses = wrong - silly;

      lblBlanks.innerHTML = `Concept Lapses: <strong style="color: ${conceptLapses > 0 ? '#F87171' : 'var(--emerald-retained)'};">${conceptLapses}</strong>`;

      let verdict = "";
      if (att >= 2 && conceptLapses === 0) {
        verdict = `<span style="color: var(--emerald-retained);">🌟 Aced Under Pressure</span>`;
      } else if (conceptLapses === 0) {
        verdict = `<span style="color: var(--cyan-core);">✓ Partial Pass (Relief Shift)</span>`;
      } else {
        verdict = `<span style="color: #F87171;">⚠️ Concept Failure &rarr; Emergency Rescue</span>`;
      }
      lblVerdict.innerHTML = verdict;
      updateMockImpactPreview();
    }

    [inpAtt, inpCorr, inpSilly, selChap].forEach((input) => input.addEventListener("input", updateRowCalc));

    btnRem.addEventListener("click", () => {
      rowEl.remove();
      mockTestRows = mockTestRows.filter((r) => r.rowId !== rowId);
      updateMockImpactPreview();
    });

    mockTestRows.push({ rowId, rowEl, getValues: () => {
      const att = Math.max(1, Number(inpAtt.value) || 1);
      const corr = DSREngine.clamp(0, att, Number(inpCorr.value) || 0);
      const silly = DSREngine.clamp(0, att - corr, Number(inpSilly.value) || 0);
      return {
        chapterId: selChap.value,
        attempted: att,
        correct: corr,
        sillySlips: silly,
        conceptLapses: (att - corr) - silly
      };
    }});

    document.getElementById("mockRowsContainer").appendChild(rowEl);
    updateRowCalc();
  }

  function updateMockImpactPreview() {
    const state = DSRStore.getState();
    const impactList = document.getElementById("mockImpactList");
    impactList.innerHTML = "";

    const selectedToughness = Number(document.getElementById("selMockTestToughness")?.value) || 2;
    const TOUGHNESS_MAP = {
      2: { label: "Standard (JEE Main)", bonus: 1.15, bonusPct: 15 },
      3: { label: "Tough (JEE Advanced)", bonus: 1.20, bonusPct: 20 },
      4: { label: "Elite (AITS / Olympiad)", bonus: 1.25, bonusPct: 25 }
    };
    const tInfo = TOUGHNESS_MAP[selectedToughness] || TOUGHNESS_MAP[2];

    mockTestRows.forEach((r) => {
      const vals = r.getValues();
      const ch = state.chapters.find((c) => c.id === vals.chapterId);
      if (!ch) return;

      const item = document.createElement("div");
      item.style.fontSize = "11.5px";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
      item.style.padding = "3px 0";

      let statusMsg = "";
      if (vals.attempted >= 2 && vals.conceptLapses === 0) {
        statusMsg = `<strong style="color: var(--emerald-retained);">+${tInfo.bonusPct}% Stability Boost (${tInfo.label})</strong>`;
      } else if (vals.conceptLapses === 0) {
        statusMsg = `<strong style="color: var(--cyan-core);">Schedule Relief (+30% Elapsed Shift)</strong>`;
      } else {
        statusMsg = `<strong style="color: #F87171;">Emergency Interception &rarr; R=0.78 (Rescue Queue)</strong>`;
      }

      item.innerHTML = `
        <span>${escapeHtml(ch.name)}</span>
        <span class="mono">${statusMsg}</span>
      `;
      impactList.appendChild(item);
    });
  }

  function applyMockTestMatrix() {
    const state = DSRStore.getState();
    const testName = document.getElementById("inpMockTestName").value.trim() || "Mock Test Matrix";
    const testDate = document.getElementById("inpMockTestDate").value;
    const now = Date.now();

    const selectedToughness = Number(document.getElementById("selMockTestToughness")?.value) || 2;
    const TOUGHNESS_MAP = {
      2: { label: "Standard (JEE Main)", bonus: 1.15, bonusPct: 15 },
      3: { label: "Tough (JEE Advanced)", bonus: 1.20, bonusPct: 20 },
      4: { label: "Elite (AITS / Olympiad)", bonus: 1.25, bonusPct: 25 }
    };
    const tInfo = TOUGHNESS_MAP[selectedToughness] || TOUGHNESS_MAP[2];

    if (mockTestRows.length === 0) {
      showToast("Please add at least one chapter to the mock test matrix.");
      return;
    }

    const affectedSummaries = [];

    mockTestRows.forEach((r) => {
      const vals = r.getValues();
      const chapter = state.chapters.find((c) => c.id === vals.chapterId);
      if (!chapter) return;

      const oldS = chapter.S;

      if (vals.attempted >= 2 && vals.conceptLapses === 0) {
        // Aced under pressure scaled by Toughness
        chapter.lastReviewTimestamp = now;
        chapter.S = Math.round(chapter.S * tInfo.bonus * 100) / 100;
        chapter.lastDirectS = chapter.S;
        affectedSummaries.push({
          chapter: chapter.name,
          impact: `Aced Under Pressure (+${tInfo.bonusPct}% Stability Boost)`,
          toughness: tInfo.label,
          S_old: oldS,
          S_new: chapter.S
        });
      } else if (vals.conceptLapses === 0) {
        // Partial Pass
        const elapsed = Math.max(0, now - chapter.lastReviewTimestamp);
        chapter.lastReviewTimestamp = now - Math.round(elapsed * 0.70);
        const attCount = Math.max(1, vals.attempted || 1);
        chapter.hazardIndex = Math.round((0.7 * (chapter.hazardIndex || 0) + 0.3 * (vals.sillySlips / attCount)) * 1000) / 1000;
        affectedSummaries.push({
          chapter: chapter.name,
          impact: "Partial Pass Relief Shift",
          hazardIndex: chapter.hazardIndex
        });
      } else {
        // Concept Failure -> Emergency Decay Interception
        const { wd, Fd } = DSREngine.getDecayParams(chapter.D);
        const theta = DSREngine.getTheta(chapter, state.settings);
        const effectiveS = chapter.S * theta;
        const targetElapsedDays = (effectiveS / Fd) * (Math.pow(0.78, -1 / wd) - 1);
        chapter.lastReviewTimestamp = now - targetElapsedDays * 86400000;
        chapter.lapses = (chapter.lapses || 0) + 1;
        affectedSummaries.push({
          chapter: chapter.name,
          impact: "Emergency Decay Interception (R set to 0.78)",
          lapses: chapter.lapses
        });
      }
    });

    DSRStore.logUserAction(
      "MOCK_TEST_LOG",
      "Bottom-Right FAB (+) -> Mock Test Matrix Modal",
      {
        testName,
        testDate,
        mockToughness: selectedToughness,
        mockToughnessLabel: tInfo.label,
        rigorTier: selectedToughness,
        chaptersCount: mockTestRows.length,
        rows: mockTestRows.map((r) => r.getValues())
      },
      {
        mockToughness: tInfo.label,
        affectedChapters: affectedSummaries
      }
    );

    DSRStore.saveState();
    closeAllModals();
    showToast(`Applied mock test back-propagation across ${affectedSummaries.length} chapters`);
  }

  // -------------------------------------------------------------
  // MODAL 4: SETTINGS & CALIBRATION CONTROLLER
  // -------------------------------------------------------------
  function initSettingsModal() {
    const sliderRet = document.getElementById("sliderSettingsRetention");
    const lblRet = document.getElementById("lblSettingsRetentionVal");
    sliderRet.addEventListener("input", () => {
      lblRet.textContent = `${Math.round(sliderRet.value * 100)}%`;
    });

    document.getElementById("btnSaveSettings").addEventListener("click", () => {
      const examName = document.getElementById("inpSettingsExamName").value.trim();
      const examDate = document.getElementById("inpSettingsExamDate").value;
      const prepStartDate = document.getElementById("inpSettingsStartDate").value;
      const targetRetentionBase = Number(sliderRet.value);
      const dailyTimeBudgetMins = Number(document.getElementById("inpSettingsDailyBudget").value);

      DSRStore.updateSettings({
        examName,
        examDate,
        prepStartDate,
        targetRetentionBase,
        dailyTimeBudgetMins
      });

      closeAllModals();
      showToast("Calibration settings saved");
    });

    document.getElementById("btnResetDemoData").addEventListener("click", () => {
      if (confirm("Reset all chapters and audit logs to factory demonstration state?")) {
        DSRStore.resetDemoData();
        closeAllModals();
        showToast("Reset to factory demo state");
      }
    });
  }

  function openSettingsModal() {
    const settings = DSRStore.getState().settings;
    document.getElementById("inpSettingsExamName").value = settings.examName || "";
    document.getElementById("inpSettingsExamDate").value = settings.examDate || "";
    document.getElementById("inpSettingsStartDate").value = settings.prepStartDate || "";
    document.getElementById("sliderSettingsRetention").value = settings.targetRetentionBase || 0.90;
    document.getElementById("lblSettingsRetentionVal").textContent = `${Math.round((settings.targetRetentionBase || 0.90) * 100)}%`;
    document.getElementById("inpSettingsDailyBudget").value = settings.dailyTimeBudgetMins || 90;
    document.getElementById("lblThetaLogic").textContent = Number(settings.thetaLogic || 1.0).toFixed(3);
    document.getElementById("lblThetaRote").textContent = Number(settings.thetaRote || 1.0).toFixed(3);

    openModal(el.modalSettings);
  }

  // -------------------------------------------------------------
  // MODAL 5: CHAPTER TELEMETRY DETAIL & FAULT-LINE VAULT
  // -------------------------------------------------------------
  let selectedDetailChapterId = null;

  function openChapterDetailModal(chapterId) {
    selectedDetailChapterId = chapterId;
    const state = DSRStore.getState();
    const chapter = state.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;

    document.getElementById("detailChapterTitle").textContent = chapter.name;
    const { R, elapsedDays } = DSREngine.getRetrievability(chapter, state.settings, Date.now());
    const tier = DSREngine.getSessionTier(chapter.S);
    const nextInterval = DSREngine.calculateNextIntervalDays(chapter, state.settings, Date.now());

    document.getElementById("chapterTelemetryStats").innerHTML = `
      <div class="preview-row">
        <span>Current Retrievability:</span>
        <strong class="mono" style="color: ${R >= 0.85 ? 'var(--emerald-retained)' : '#F87171'};">${Math.round(R * 100)}% (${elapsedDays}d elapsed)</strong>
      </div>
      <div class="preview-row">
        <span>Stability (S):</span>
        <strong class="mono">${chapter.S} Days</strong>
      </div>
      <div class="preview-row">
        <span>Dynamic Difficulty (D / D0):</span>
        <strong class="mono">${chapter.D} / ${chapter.D0}</strong>
      </div>
      <div class="preview-row">
        <span>Session Tier:</span>
        <strong>${tier.name} (${tier.durationMins}m)</strong>
      </div>
      <div class="preview-row">
        <span>Hazard Index (Silly Slips):</span>
        <strong class="mono" style="color: ${chapter.hazardIndex >= 0.15 ? '#FCD34D' : 'var(--text-main)'};">${Math.round(chapter.hazardIndex * 100)}%</strong>
      </div>
      <div class="preview-row">
        <span>Next Recommended Review:</span>
        <strong class="mono">${nextInterval} Days</strong>
      </div>
    `;

    // Render Fault-Lines
    const faultList = document.getElementById("detailFaultLineList");
    const vault = Array.isArray(chapter.faultLineVault) ? chapter.faultLineVault : [];
    document.getElementById("detailFaultLineCount").textContent = `${vault.length} Notes`;
    faultList.innerHTML = "";

    if (vault.length === 0) {
      faultList.innerHTML = `<div style="font-size: 11px; color: var(--text-dim);">No fault-lines logged yet. Perform a session audit to record micro-concept gaps.</div>`;
    } else {
      vault.forEach((fl) => {
        const item = document.createElement("div");
        item.style.background = "var(--bg-card)";
        item.style.border = "1px solid var(--border-subtle)";
        item.style.borderRadius = "var(--radius-sm)";
        item.style.padding = "8px 10px";
        item.style.fontSize = "12px";
        item.innerHTML = `
          <div style="font-weight: 700; color: #7DD3FC; margin-bottom: 2px;">• ${escapeHtml(fl.note)}</div>
          <div class="mono" style="font-size: 10px; color: var(--text-dim);">Missed ${fl.missCount || 1}x · Last: ${escapeHtml(fl.lastMissed || 'Recent')}</div>
        `;
        faultList.appendChild(item);
      });
    }

    openModal(el.modalChapterDetail);
  }

  // -------------------------------------------------------------
  // INITIALIZATION & EVENT WIRING
  // -------------------------------------------------------------
  function initApp() {
    DSRStore.loadState();

    // Nav Switcher
    el.navTabDashboard.addEventListener("click", () => switchTab("dashboard"));
    el.navTabSyllabus.addEventListener("click", () => switchTab("syllabus"));
    el.navTabAudit.addEventListener("click", () => switchTab("audit"));

    // Header actions
    el.btnHeaderAudit.addEventListener("click", () => switchTab("audit"));
    el.btnHeaderSettings.addEventListener("click", openSettingsModal);
    el.topCountdownBanner.addEventListener("click", openSettingsModal);

    // Budget Steppers (Smooth updates without creating audit log spam)
    el.btnBudgetDec.addEventListener("click", () => {
      const current = DSRStore.getState().settings.dailyTimeBudgetMins || 90;
      const next = Math.max(15, current - 15);
      DSRStore.setDailyTimeBudget(next);
    });

    el.btnBudgetInc.addEventListener("click", () => {
      const current = DSRStore.getState().settings.dailyTimeBudgetMins || 90;
      const next = Math.min(360, current + 15);
      DSRStore.setDailyTimeBudget(next);
    });


    const btnClearAllAudit = document.getElementById("btnClearAllAudit");
    if (btnClearAllAudit) {
      btnClearAllAudit.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all records from the audit ledger?")) {
          DSRStore.clearAllAuditLogs();
          showToast("Cleared all audit records.");
        }
      });
    }

    // Subject Filter pills
    document.querySelectorAll("[data-subject-filter]").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("[data-subject-filter]").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeSubjectFilter = pill.getAttribute("data-subject-filter");
        renderSyllabus();
      });
    });

    // Audit Filter pills
    document.querySelectorAll("[data-audit-filter]").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("[data-audit-filter]").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeAuditFilter = pill.getAttribute("data-audit-filter");
        renderAuditLedger();
      });
    });

    // Audit Search
    el.auditSearchInput.addEventListener("input", (e) => {
      auditSearchQuery = e.target.value;
      renderAuditLedger();
    });

    // Audit Exports / Imports
    el.btnExportJSON.addEventListener("click", () => {
      const json = DSRStore.exportStateJSON();
      triggerExport(json, "application/json", `dsr_backup_${Date.now()}.json`);
    });

    el.btnExportCSV.addEventListener("click", () => {
      const csv = DSRStore.exportAuditCSV();
      triggerExport(csv, "text/csv", `dsr_audit_ledger_${Date.now()}.csv`);
    });

    el.btnTriggerImport.addEventListener("click", () => {
      el.fileImportInput.click();
    });

    el.fileImportInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (event) {
        const res = DSRStore.importStateJSON(event.target.result);
        if (res.success) {
          showToast("Data restored successfully!");
        } else {
          showToast(`Restore failed: ${res.error}`);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    // FAB & Speed Dial
    el.mainFabBtn.addEventListener("click", () => toggleSpeedDial());
    el.fabOverlay.addEventListener("click", () => toggleSpeedDial(false));

    el.dialNewChapter.addEventListener("click", () => {
      renderParentPrerequisitesList();
      updateNewChapterPreview();
      openModal(el.modalAddChapter);
    });

    el.dialMockTest.addEventListener("click", () => {
      openMockTestModal();
    });

    el.dialAdHoc.addEventListener("click", () => {
      const state = DSRStore.getState();
      const firstId = state.chapters[0] ? state.chapters[0].id : null;
      if (!firstId) {
        showToast("No chapters available. Add a chapter first.");
        return;
      }
      openPostStudyModal(firstId, true);
    });

    // Close buttons on all sheets
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", closeAllModals);
    });

    // Close on tapping backdrop
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeAllModals();
      });
    });

    // Detail modal actions
    document.getElementById("btnLaunchAdHocFromDetail").addEventListener("click", () => {
      if (selectedDetailChapterId) {
        closeAllModals();
        openPostStudyModal(selectedDetailChapterId, false);
      }
    });

    document.getElementById("btnDeleteChapter").addEventListener("click", () => {
      if (selectedDetailChapterId && confirm("Permanently delete this chapter and prune its prerequisite links?")) {
        DSRStore.deleteChapter(selectedDetailChapterId);
        closeAllModals();
        showToast("Chapter deleted.");
      }
    });

    // Sub-modal initializers
    initAddChapterModal();
    initPostStudyModal();
    initMockTestModal();
    initSettingsModal();

    // Subscribe to store updates to refresh active view automatically
    DSRStore.subscribe(() => {
      renderCurrentView();
    });

    // Initial render
    renderDashboard();
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return String(str || "");
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Boot on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
