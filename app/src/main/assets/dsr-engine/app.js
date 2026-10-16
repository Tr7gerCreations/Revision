/**
 * Dynamic DSR v3.0 — Cognitive Revision Engine
 * Main Application Controller & Reactive UI Logic
 * Includes Set D5 + Set D6 Upgrades, Subtopic Chain Engine, and Fault-Line Graduation
 */

(function () {
  let activeTab = "dashboard";
  let activeSubjectFilter = "ALL";
  let activeAuditFilter = "ALL";
  let auditSearchQuery = "";
  let currentAuditingChapterId = null;
  let isAdHocMode = false;
  let isSynthesisSession = false;
  let isSprintModeActive = false;
  let syllabusSearchQuery = "";
  let selectedFaultLineSeverity = 2; // 1 (Minor), 2 (Standard), 3 (High)
  let toastTimeout = null;

  // Stopwatch state
  let stopwatchInterval = null;
  let stopwatchSeconds = 0;
  let stopwatchPhase = 1; // 1: Blank-Page, 2: Red-Pen, 3: Problems
  let stopwatchRunning = false;

  // Divided chapter state
  let dividedSubtopicsList = [];

  // Detail modal state
  let selectedDetailChapterId = null;

  // Synthesis battle partner tracking
  let currentSynthesisPartnerId = null;

  // Open notepad drawers tracking across syllabus re-renders
  const openNotepadDrawers = new Set();

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
    inputDailyBudget: document.getElementById("inputDailyBudget"),
    budgetProgressFill: document.getElementById("budgetProgressFill"),
    btnSprintToggle: document.getElementById("btnSprintToggle"),
    synthesisBanner: document.getElementById("synthesisBanner"),
    synthesisBannerText: document.getElementById("synthesisBannerText"),
    btnLaunchSynthesis: document.getElementById("btnLaunchSynthesis"),
    queueCountLabel: document.getElementById("queueCountLabel"),
    queueListContainer: document.getElementById("queueListContainer"),
    lapsedSlotContainer: document.getElementById("lapsedSlotContainer"),
    lapsedCardContent: document.getElementById("lapsedCardContent"),
    upcomingSectionContainer: document.getElementById("upcomingSectionContainer"),
    upcomingSectionTitle: document.getElementById("upcomingSectionTitle"),
    upcomingListContainer: document.getElementById("upcomingListContainer"),
    // Syllabus components
    syllabusSearchInput: document.getElementById("syllabusSearchInput"),
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
    btnUndoLastAction: document.getElementById("btnUndoLastAction"),
    // FAB & Speed Dial
    mainFabBtn: document.getElementById("mainFabBtn"),
    fabOverlay: document.getElementById("fabOverlay"),
    speedDialMenu: document.getElementById("speedDialMenu"),
    dialNewChapter: document.getElementById("dialNewChapter"),
    dialDividedChapter: document.getElementById("dialDividedChapter"),
    dialMockTest: document.getElementById("dialMockTest"),
    dialAdHoc: document.getElementById("dialAdHoc"),
    // Modals
    modalAddChapter: document.getElementById("modalAddChapter"),
    modalDividedChapter: document.getElementById("modalDividedChapter"),
    modalPostStudy: document.getElementById("modalPostStudy"),
    modalMockTest: document.getElementById("modalMockTest"),
    modalSettings: document.getElementById("modalSettings"),
    modalChapterDetail: document.getElementById("modalChapterDetail"),
    toastPopup: document.getElementById("toastPopup")
  };

  // Toast Helper with Undo Action support
  function showToast(msg, allowUndo = false) {
    if (window.AndroidHost && window.AndroidHost.showToast && !allowUndo) {
      window.AndroidHost.showToast(msg);
      return;
    }
    el.toastPopup.innerHTML = "";
    const textSpan = document.createElement("span");
    textSpan.textContent = msg;
    el.toastPopup.appendChild(textSpan);

    if (allowUndo) {
      const undoBtn = document.createElement("button");
      undoBtn.textContent = "↩ Undo";
      undoBtn.style.cssText =
        "background: none; border: 1px solid var(--amber-hazard); color: #FCD34D; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 2px 7px; margin-left: 8px; cursor: pointer;";
      undoBtn.onclick = (e) => {
        e.stopPropagation();
        const res = DSRStore.undoLastAction();
        if (res.success) {
          showToast(`Reverted: ${res.actionLabel}`);
        }
      };
      el.toastPopup.appendChild(undoBtn);
    }

    el.toastPopup.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.toastPopup.classList.remove("show"), 3500);
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
    const openModalEl = document.querySelector(".modal-backdrop.show");
    if (openModalEl) {
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

    // 2. Normalized Weighted Syllabus Readiness (Requirement 5.1)
    const activeChapters = DSRStore.getActiveChapters(chapters);
    const groupCounts = {};
    activeChapters.forEach((c) => {
      if (c.groupId) {
        groupCounts[c.groupId] = (groupCounts[c.groupId] || 0) + 1;
      }
    });

    let totalEffectiveWeight = 0;
    let weightedHealthSum = 0;
    let dueTodayCount = 0;

    activeChapters.forEach((ch) => {
      const effWeight = ch.groupId ? (Number(ch.weightage) || 1.0) / (groupCounts[ch.groupId] || 1) : (Number(ch.weightage) || 1.0);
      const triage = DSREngine.calculatePriorityScore(ch, settings, now);
      totalEffectiveWeight += effWeight;
      weightedHealthSum += effWeight * triage.R;
      if (triage.statusCategory !== "HEALTHY") {
        dueTodayCount++;
      }
    });

    const healthPct = totalEffectiveWeight > 0 ? Math.round((weightedHealthSum / totalEffectiveWeight) * 100) : 100;
    el.bannerHealthPct.textContent = `${healthPct}% (${dueTodayCount} Due)`;
    el.bannerHealthFill.style.width = `${healthPct}%`;

    // 3. Synthesis Boss Battle Detection Window (Requirement 2.3 & 5.4)
    const synthesisPair = DSREngine.findSynthesisPair(chapters, settings, now);
    if (synthesisPair) {
      el.synthesisBanner.style.display = "flex";
      el.synthesisBannerText.textContent = `Interleave [${synthesisPair.parent.name} + ${synthesisPair.child.name}] into one master problem session for a 1.25x stability boost.`;
      el.btnLaunchSynthesis.onclick = () => {
        launchSynthesisBattle(synthesisPair);
      };
    } else {
      el.synthesisBanner.style.display = "none";
    }

    // 4. Priority Queue Scoring & Subtopic Anti-Collision
    const scoredChapters = activeChapters.map((ch) => {
      const triage = DSREngine.calculatePriorityScore(ch, settings, now);
      return {
        chapter: ch,
        triage,
        tierInfo: DSREngine.getSessionTier(ch.S, triage.R, !!ch.isSubtopic, ch.tauEWMA, ch.D0)
      };
    });

    const lapsedList = scoredChapters.filter((sc) => sc.triage.statusCategory === "LAPSED_REBUILD");
    const dueList = scoredChapters.filter((sc) => sc.triage.statusCategory === "CRITICAL_RESCUE" || sc.triage.statusCategory === "DUE_TODAY");
    let queueList = dueList.sort((a, b) => b.triage.priority - a.triage.priority);

    // Anti-Collision Filter for Subtopics in same groupId (Part 3.5):
    const groupDueMap = {};
    queueList.forEach((sc) => {
      if (sc.chapter.groupId) {
        if (!groupDueMap[sc.chapter.groupId]) groupDueMap[sc.chapter.groupId] = [];
        groupDueMap[sc.chapter.groupId].push(sc);
      }
    });

    Object.keys(groupDueMap).forEach((grpId) => {
      const items = groupDueMap[grpId].sort((a, b) => (a.chapter.sequenceIndex || 1) - (b.chapter.sequenceIndex || 1));
      if (items.length >= 2) {
        const urgentFoundation = items.find((it) => {
          const sub = it.chapter;
          const sCeil = 1.20 * (sub.lastDirectS || sub.S);
          const lastDirectTs = Number(sub.lastDirectReviewTimestamp) || Number(sub.lastReviewTimestamp) || now;
          const tsCeil = lastDirectTs + (sub.S * 0.30 * 86400000);
          return it.triage.R < 0.85 || sub.S >= sCeil || sub.lastReviewTimestamp >= tsCeil;
        });
        const keepId = urgentFoundation ? urgentFoundation.chapter.id : items[items.length - 1].chapter.id;
        queueList = queueList.filter((sc) => sc.chapter.groupId !== grpId || sc.chapter.id === keepId);
      }
    });

    // 5. Round-Robin Subject Balancer (Requirement 5.3):
    // When filling dailyTimeBudgetMins, if Slots #1 and #2 belong to the same Subject and another Subject has due chapters,
    // promote the top due chapter from the underrepresented Subject into Slot #3.
    if (queueList.length >= 3) {
      const subj1 = queueList[0].chapter.subject;
      const subj2 = queueList[1].chapter.subject;
      if (subj1 && subj1 === subj2) {
        const altIdx = queueList.findIndex((sc, idx) => idx >= 2 && sc.chapter.subject !== subj1);
        if (altIdx > 2) {
          const altItem = queueList.splice(altIdx, 1)[0];
          queueList.splice(2, 0, altItem);
        }
      }
    }

    // Calculate budget consumption
    let scheduledMins = 0;
    const budgetMins = Number(settings.dailyTimeBudgetMins) || 90;
    queueList.forEach((sc) => {
      const dur = isSprintModeActive ? 10 : sc.tierInfo.durationMins;
      if (scheduledMins + dur <= budgetMins || scheduledMins === 0) {
        scheduledMins += dur;
      }
    });

    if (el.budgetDurationText) {
      el.budgetDurationText.textContent = `${scheduledMins} /`;
    }
    const inpDailyBudget = document.getElementById("inputDailyBudget");
    if (inpDailyBudget && document.activeElement !== inpDailyBudget) {
      inpDailyBudget.value = budgetMins;
    }
    const budgetPct = Math.min(100, Math.round((scheduledMins / budgetMins) * 100));
    el.budgetProgressFill.style.width = `${budgetPct}%`;
    el.budgetProgressFill.style.background = budgetPct > 100 ? "var(--red-urgent)" : "var(--cyan-core)";

    // Update Sprint Toggle UI state
    if (el.btnSprintToggle) {
      el.btnSprintToggle.classList.toggle("active", isSprintModeActive);
    }

    // Render Queue Cards
    el.queueCountLabel.textContent = `${queueList.length} topics`;
    el.queueListContainer.innerHTML = "";

    if (queueList.length === 0) {
      el.queueListContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 16px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 28px; margin-bottom: 8px;">🎯</div>
          <div style="font-weight: 700; color: var(--emerald-retained);">All Active Topics Retained!</div>
          <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">No active chapters are currently due. Use the (+) button to add or unlock subtopics.</div>
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

    // Render Upcoming / Retained Topics in separate muted/collapsed section (Requirement Fix 2)
    const healthyList = scoredChapters
      .filter((sc) => sc.triage.statusCategory === "HEALTHY")
      .sort((a, b) => a.triage.R - b.triage.R);

    if (el.upcomingSectionContainer && el.upcomingListContainer) {
      if (healthyList.length > 0) {
        el.upcomingSectionContainer.style.display = "block";
        if (el.upcomingSectionTitle) {
          el.upcomingSectionTitle.textContent = `🌱 UPCOMING / RETAINED TOPICS (${healthyList.length})`;
        }
        el.upcomingListContainer.innerHTML = "";
        healthyList.forEach((item) => {
          const card = createChapterQueueCard(item);
          el.upcomingListContainer.appendChild(card);
        });
      } else {
        el.upcomingSectionContainer.style.display = "none";
      }
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

    const subjClass = (ch.subject || "Physics").toLowerCase();

    // High Trap Risk Pill
    const trapWarningHtml =
      ch.hazardIndex >= 0.15
        ? `<div class="trap-risk-pill">
            <span>⚠️</span>
            <span><strong>High Trap Risk</strong> (${Math.round(ch.hazardIndex * 100)}% slip rate) — Double-check calculations & units</span>
          </div>`
        : "";

    // Fault-Lines reminder: Only display active (!graduated) traps (Requirement 3.B.3)
    let faultLinesHtml = "";
    const activeTraps = Array.isArray(ch.faultLineVault) ? ch.faultLineVault.filter((t) => !t.graduated) : [];
    if (activeTraps.length > 0) {
      const topNotes = activeTraps.slice(0, 2).map((fl) => fl.note).join(" • ");
      faultLinesHtml = `
        <div class="fault-lines-pill">
          <strong>🎯 Fault-Lines to verify:</strong> ${escapeHtml(topNotes)}
        </div>
      `;
    }

    // Subtopic Breadcrumb (Requirement 4.C.3)
    let breadcrumbHtml = "";
    if (ch.isSubtopic && ch.groupTitle) {
      breadcrumbHtml = `<span class="subtopic-breadcrumb">🧩 ${escapeHtml(ch.groupTitle)} · PART #${ch.sequenceIndex || 1}</span>`;
    }

    // Task summary line (Sprint mode aware)
    const taskText = isSprintModeActive
      ? "⚡ Sprint Mode · 10m Blank-Page Refresher (0 Problems)"
      : `Task: ${escapeHtml(tier.taskSummary)}`;

    div.innerHTML = `
      <div class="card-top-row">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="status-badge ${statusClass} mono">${statusText}</span>
          ${breadcrumbHtml}
        </div>
        <span class="tier-badge mono">${isSprintModeActive ? "10m Sprint" : `${tier.name} · ${tier.durationMins}m`}</span>
      </div>
      <div class="chapter-main-row">
        <span class="chapter-title">${escapeHtml(ch.name)}</span>
        <span class="subject-pill ${subjClass}">${escapeHtml(ch.subject)}</span>
      </div>
      ${trapWarningHtml}
      ${faultLinesHtml}
      <div class="prescribed-task-line">
        <span>${taskText}</span>
        <span class="mono" style="color: var(--cyan-core); font-weight: 700;">Tap to Audit &rarr;</span>
      </div>
    `;

    div.addEventListener("click", () => {
      openPostStudyModal(ch.id, false);
    });

    return div;
  }

  // -------------------------------------------------------------
  // SYLLABUS & NOTEPAD BARCODE REGISTRY BROWSER
  // -------------------------------------------------------------
  function chapterMatchesQuery(ch, query) {
    if (!query) return true;
    if (ch.name && ch.name.toLowerCase().includes(query)) return true;
    if (ch.subject && ch.subject.toLowerCase().includes(query)) return true;
    if (ch.groupTitle && ch.groupTitle.toLowerCase().includes(query)) return true;
    if (Array.isArray(ch.notepadIds)) {
      return ch.notepadIds.some((n) =>
        (n.code && n.code.toLowerCase().includes(query)) ||
        (n.location && n.location.toLowerCase().includes(query)) ||
        (n.summary && n.summary.toLowerCase().includes(query))
      );
    }
    return false;
  }

  function renderNotepadDrawerContent(ch, query = "") {
    const list = Array.isArray(ch.notepadIds) ? ch.notepadIds : [];
    let itemsHtml = "";
    if (list.length === 0) {
      itemsHtml = `<div style="font-size: 11px; color: var(--text-dim); font-style: italic; padding: 4px 0;">No physical notepad Barcodes / IDs registered yet.</div>`;
    } else {
      itemsHtml = list
        .map((item) => {
          const isMatch = query && (
            (item.code && item.code.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (item.summary && item.summary.toLowerCase().includes(query))
          );
          return `
            <div class="notepad-item-card ${isMatch ? 'search-match' : ''}">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="mono" style="font-weight: 700; color: var(--cyan-core); font-size: 11.5px;">#${escapeHtml(item.code)}</span>
                    <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">📍 ${escapeHtml(item.location)}</span>
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-main);">${escapeHtml(item.summary || "No notes logged.")}</div>
                  <span style="font-size: 10px; color: var(--text-dim);">Added: ${escapeHtml(item.createdAt || "")}</span>
                </div>
                <button type="button" class="secondary-btn btn-delete-notepad-id" data-chap-id="${ch.id}" data-item-id="${item.id}" style="padding: 2px 6px; font-size: 10.5px; color: #F87171; border-color: rgba(239, 68, 68, 0.35);" title="Delete ID">
                  🗑️
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    }

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 11px; font-weight: 700; color: var(--cyan-core);">🏷️ Physical Notepad Barcode / Reference IDs (${list.length})</span>
        <button type="button" class="secondary-btn btn-add-inline-notepad" data-chap-id="${ch.id}" style="font-size: 10.5px; padding: 2px 7px; color: var(--cyan-core); border-color: rgba(56, 189, 248, 0.4);">
          + Add New ID
        </button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${itemsHtml}
      </div>
    `;
  }

  function wireNotepadDrawerEvents(container) {
    container.querySelectorAll(".btn-toggle-notepad").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = btn.getAttribute("data-id");
        const drawer = document.getElementById(`notepadDrawer_${cid}`);
        if (!drawer) return;
        const isHidden = drawer.style.display === "none";
        drawer.style.display = isHidden ? "flex" : "none";
        if (isHidden) {
          openNotepadDrawers.add(cid);
        } else {
          openNotepadDrawers.delete(cid);
        }
      });
    });

    container.querySelectorAll(".btn-delete-notepad-id").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const chapId = btn.getAttribute("data-chap-id");
        const itemId = btn.getAttribute("data-item-id");
        if (confirm("Delete this physical notepad barcode reference?")) {
          DSRStore.deleteNotepadIdFromChapter(chapId, itemId);
          showToast("Deleted physical notepad reference.");
          renderSyllabus();
        }
      });
    });

    container.querySelectorAll(".btn-add-inline-notepad").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const chapId = btn.getAttribute("data-chap-id");
        const code = prompt("Enter Barcode / Reference ID (e.g. ROT-03, NB1-P14):");
        if (!code || !code.trim()) return;
        const loc = prompt("Enter physical notepad location (e.g. Notepad 1 · Page 18):", "Notepad 1");
        const summary = prompt("Enter short convention note / highlight:", "");
        const added = DSRStore.addNotepadIdToChapter(chapId, { code: code.trim(), location: (loc || "").trim(), summary: (summary || "").trim() });
        if (added) {
          showToast(`Added Barcode #${added.code}!`, true);
          renderSyllabus();
        }
      });
    });
  }

  function renderSyllabus() {
    const state = DSRStore.getState();
    const settings = state.settings;
    const chapters = state.chapters;
    const now = Date.now();
    const query = syllabusSearchQuery.trim().toLowerCase();

    const filtered = chapters.filter((c) => {
      if (activeSubjectFilter !== "ALL" && c.subject !== activeSubjectFilter) return false;
      if (!query) return true;
      if (c.groupId) {
        // Group matches if title matches or any sibling subtopic matches
        const groupMembers = chapters.filter((m) => m.groupId === c.groupId);
        return groupMembers.some((m) => chapterMatchesQuery(m, query));
      }
      return chapterMatchesQuery(c, query);
    });

    el.syllabusCountLabel.textContent = `${filtered.length} Topics`;
    el.syllabusListContainer.innerHTML = "";

    if (filtered.length === 0) {
      el.syllabusListContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 16px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle); color: var(--text-dim);">
          No chapters or notepad references found matching query.
        </div>
      `;
      return;
    }

    const handledGroupIds = new Set();

    filtered.forEach((ch) => {
      if (ch.groupId) {
        if (handledGroupIds.has(ch.groupId)) return;
        handledGroupIds.add(ch.groupId);

        // Render Macro Chapter Card
        const groupSubtopics = chapters
          .filter((c) => c.groupId === ch.groupId)
          .sort((a, b) => (a.sequenceIndex || 1) - (b.sequenceIndex || 1));

        const activeSubtopics = groupSubtopics.filter((s) => !s.isLocked && !s.isDropped);
        const avgR = activeSubtopics.length > 0
          ? Math.round(
              (activeSubtopics.reduce((sum, s) => sum + DSREngine.getRetrievability(s, settings, now).R, 0) /
                activeSubtopics.length) *
                100
            )
          : 100;

        const card = document.createElement("div");
        card.className = "macro-chapter-card";

        const subjClass = (ch.subject || "Physics").toLowerCase();
        const macroTitle = ch.groupTitle || "Macro Chapter";

        let treeHtml = "";
        groupSubtopics.forEach((sub, sIdx) => {
          const isLast = sIdx === groupSubtopics.length - 1;
          const branchSymbol = isLast ? "└─" : "├─";
          const retObj = DSREngine.getRetrievability(sub, settings, now);
          const rPct = Math.round(retObj.R * 100);
          const subNotepadCount = Array.isArray(sub.notepadIds) ? sub.notepadIds.length : 0;
          const autoOpenSub = query && Array.isArray(sub.notepadIds) && sub.notepadIds.some(n =>
            (n.code && n.code.toLowerCase().includes(query)) ||
            (n.location && n.location.toLowerCase().includes(query)) ||
            (n.summary && n.summary.toLowerCase().includes(query))
          );

          if (sub.isLocked) {
            treeHtml += `
              <div class="subtopic-tree-node locked">
                <span class="mono" style="color: #A855F7;">${branchSymbol} Part ${sub.sequenceIndex || (sIdx + 1)}:</span>
                <span style="flex: 1; font-weight: 600; color: var(--text-dim);">${escapeHtml(sub.name)}</span>
                <button class="secondary-btn btn-activate-sub" data-id="${sub.id}" style="font-size: 10.5px; padding: 3px 8px; color: #34D399; border-color: rgba(16,185,129,0.4);">
                  🔓 Activate
                </button>
              </div>
            `;
          } else {
            const activeTrapsCount = Array.isArray(sub.faultLineVault) ? sub.faultLineVault.filter((t) => !t.graduated).length : 0;
            const masteredCount = Array.isArray(sub.faultLineVault) ? sub.faultLineVault.filter((t) => t.graduated).length : 0;
            const leechSubtopicSplitBtn =
              sub.lapses >= 3
                ? `<button class="action-btn-sm btn-split-leech" data-id="${sub.id}" style="font-size: 10px; padding: 2px 6px; background: rgba(239, 68, 68, 0.2); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.4);" title="Split leech subtopic">🧬 Split</button>`
                : "";

            treeHtml += `
              <div class="subtopic-tree-node">
                <span class="mono" style="color: #A855F7;">${branchSymbol} Part ${sub.sequenceIndex || (sIdx + 1)}:</span>
                <span style="flex: 1; font-weight: 600; color: var(--text-main); cursor: pointer;" class="btn-subtopic-detail" data-id="${sub.id}">${escapeHtml(sub.name)}</span>
                <span class="mono" style="font-size: 11px; color: ${rPct >= 85 ? 'var(--emerald-retained)' : 'var(--amber-hazard)'};">S:${sub.S}d (R:${rPct}%)</span>
                ${leechSubtopicSplitBtn}
                <button type="button" class="notepad-badge-btn btn-toggle-notepad" data-id="${sub.id}" style="font-size: 10px; padding: 2px 6px;">🏷️ IDs (${subNotepadCount})</button>
                ${activeTrapsCount > 0 ? `<span style="font-size: 10px; color: #FCD34D;" title="Active Traps">🎯 ${activeTrapsCount}</span>` : ''}
                ${masteredCount > 0 ? `<span style="font-size: 10px; color: #34D399;" title="Mastered Traps">🏆 ${masteredCount}</span>` : ''}
                <button class="action-btn-sm btn-audit-sub" data-id="${sub.id}" style="font-size: 10.5px; padding: 3px 7px;">Audit</button>
              </div>
              <div class="notepad-drawer" id="notepadDrawer_${sub.id}" style="display: ${autoOpenSub ? 'flex' : 'none'}; flex-direction: column; gap: 6px; background: rgba(56,189,248,0.04); border: 1px dashed rgba(56,189,248,0.3); border-radius: 6px; padding: 8px; margin: 2px 0 6px 14px;">
                ${renderNotepadDrawerContent(sub, query)}
              </div>
            `;
          }
        });

        card.innerHTML = `
          <div class="macro-header-row">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="subject-pill ${subjClass}">${escapeHtml(ch.subject)}</span>
              <span class="macro-title">🧩 ${escapeHtml(macroTitle)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="mono" style="font-size: 11px; color: #C084FC;">${activeSubtopics.length}/${groupSubtopics.length} Active · R:${avgR}%</span>
            </div>
          </div>
          <div class="subtopic-tree-list">
            ${treeHtml}
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
            <button class="secondary-btn btn-append-sub" data-group-id="${ch.groupId}" style="font-size: 11px; padding: 4px 8px; color: #A855F7;">
              + Append Subtopic
            </button>
          </div>
        `;

        // Wire subtopic tree buttons
        card.querySelectorAll(".btn-activate-sub").forEach((btn) => {
          btn.addEventListener("click", () => {
            const sid = btn.getAttribute("data-id");
            const activated = DSRStore.activateSubtopic(sid);
            if (activated) {
              showToast(`Activated ${activated.name}! Scheduled for spaced reviews.`, true);
              renderSyllabus();
            }
          });
        });

        card.querySelectorAll(".btn-split-leech").forEach((splitBtn) => {
          splitBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const sid = splitBtn.getAttribute("data-id");
            const targetCh = state.chapters.find((c) => c.id === sid);
            if (!targetCh) return;
            const subtopicName = prompt(`Split Leech Subtopic "${targetCh.name}" into subtopic chain.\nEnter title for isolated subtopic problem area:`);
            if (subtopicName && subtopicName.trim()) {
              const newD0Str = prompt("Enter D0 for this troublesome subtopic (1.0 - 10.0):", String(targetCh.D0));
              const newD0 = Number(newD0Str) || targetCh.D0;
              const newSub = DSRStore.splitLeechChapter(targetCh.id, subtopicName.trim(), newD0);
              if (newSub) {
                showToast(`Split "${targetCh.name}"! Lapses reset to 1.`, true);
                renderSyllabus();
              }
            }
          });
        });

        card.querySelectorAll(".btn-audit-sub").forEach((btn) => {
          btn.addEventListener("click", () => {
            const sid = btn.getAttribute("data-id");
            openPostStudyModal(sid, false);
          });
        });

        card.querySelectorAll(".btn-subtopic-detail").forEach((btn) => {
          btn.addEventListener("click", () => {
            const sid = btn.getAttribute("data-id");
            openChapterDetailModal(sid);
          });
        });

        card.querySelector(".btn-append-sub").addEventListener("click", () => {
          const title = prompt("Enter title for new subtopic in sequence:");
          if (title && title.trim()) {
            const d0Str = prompt("Enter difficulty D0 (1.0 - 10.0):", "6.0");
            const d0 = Number(d0Str) || 6.0;
            const newSub = DSRStore.appendSubtopicToGroup(ch.groupId, { name: title.trim(), d0, isLocked: false });
            if (newSub) {
              showToast(`Appended ${newSub.name}!`, true);
              renderSyllabus();
            }
          }
        });

        wireNotepadDrawerEvents(card);
        el.syllabusListContainer.appendChild(card);
      } else {
        // Standalone Chapter Card
        const { R, elapsedDays } = DSREngine.getRetrievability(ch, settings, now);
        const tier = DSREngine.getSessionTier(ch.S, R, false);
        const activeTraps = Array.isArray(ch.faultLineVault) ? ch.faultLineVault.filter((t) => !t.graduated) : [];
        const masteredTraps = Array.isArray(ch.faultLineVault) ? ch.faultLineVault.filter((t) => t.graduated) : [];
        const notepadCount = Array.isArray(ch.notepadIds) ? ch.notepadIds.length : 0;
        const autoOpenCh = query && Array.isArray(ch.notepadIds) && ch.notepadIds.some(n =>
          (n.code && n.code.toLowerCase().includes(query)) ||
          (n.location && n.location.toLowerCase().includes(query)) ||
          (n.summary && n.summary.toLowerCase().includes(query))
        );
        const subjClass = (ch.subject || "Physics").toLowerCase();

        const div = document.createElement("div");
        div.className = "chapter-card";

        const leechAlertHtml =
          ch.lapses >= 3
            ? `<button class="leech-alert-pill btn-split-leech" data-id="${ch.id}" title="Split recurrent trap into subtopic chain">
                🧬 Leech Alert · Split Subtopic
              </button>`
            : "";

        const activeTrapsHtml =
          activeTraps.length > 0
            ? `<span class="badge-amber" style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(245,158,11,0.15); color: #FCD34D;">
                🎯 Active Fault-Lines (${activeTraps.length})
              </span>`
            : "";

        const masteredTrapsHtml =
          masteredTraps.length > 0
            ? `<button type="button" class="mastered-traps-pill btn-toggle-mastered" data-id="${ch.id}">
                🏆 Mastered Traps (${masteredTraps.length}) ▾
              </button>`
            : "";

        div.innerHTML = `
          <div class="card-top-row">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="subject-pill ${subjClass}">${escapeHtml(ch.subject)}</span>
              ${leechAlertHtml}
            </div>
            <span class="mono" style="font-size: 11px; color: ${R >= 0.85 ? 'var(--emerald-retained)' : 'var(--amber-hazard)'};">
              R(t): <strong>${Math.round(R * 100)}%</strong> (${elapsedDays}d ago)
            </span>
          </div>
          <div class="chapter-main-row">
            <span class="chapter-title" style="cursor: pointer;">${escapeHtml(ch.name)}</span>
            <span class="tier-badge mono">${tier.name} · ${tier.durationMins}m</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="mono" style="font-size: 11px; color: var(--text-dim);">S: ${ch.S}d | D: ${ch.D} | Lapses: ${ch.lapses || 0}</span>
            <button type="button" class="notepad-badge-btn btn-toggle-notepad" data-id="${ch.id}">🏷️ Notepad IDs (${notepadCount}) ▾</button>
            ${activeTrapsHtml}
            ${masteredTrapsHtml}
          </div>
          <div class="notepad-drawer" id="notepadDrawer_${ch.id}" style="display: ${autoOpenCh ? 'flex' : 'none'}; flex-direction: column; gap: 6px; background: rgba(56,189,248,0.04); border: 1px dashed rgba(56,189,248,0.3); border-radius: 6px; padding: 8px; margin-top: 6px;">
            ${renderNotepadDrawerContent(ch, query)}
          </div>
          <div class="mastered-traps-drawer" id="masteredDrawer_${ch.id}" style="display: none; background: rgba(16,185,129,0.06); border: 1px dashed rgba(16,185,129,0.3); border-radius: 6px; padding: 8px; margin-top: 4px;">
            <!-- Populated when opened -->
          </div>
          <div class="prescribed-task-line" style="margin-top: 4px;">
            <span>Task: ${escapeHtml(tier.taskSummary)}</span>
            <button class="secondary-btn btn-open-detail" style="font-size: 11px; padding: 3px 8px;">Inspect &rarr;</button>
          </div>
        `;

        div.querySelector(".chapter-title").addEventListener("click", () => openChapterDetailModal(ch.id));
        div.querySelector(".btn-open-detail").addEventListener("click", () => openChapterDetailModal(ch.id));

        const splitBtn = div.querySelector(".btn-split-leech");
        if (splitBtn) {
          splitBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const subtopicName = prompt(`Split Leech Chapter "${ch.name}" into subtopic chain.\nEnter title for isolated subtopic problem area:`);
            if (subtopicName && subtopicName.trim()) {
              const newD0Str = prompt("Enter D0 for this troublesome subtopic (1.0 - 10.0):", String(ch.D0));
              const newD0 = Number(newD0Str) || ch.D0;
              const newSub = DSRStore.splitLeechChapter(ch.id, subtopicName.trim(), newD0);
              if (newSub) {
                showToast(`Split "${ch.name}" into subtopics! Lapses reset to 1.`, true);
                renderSyllabus();
              }
            }
          });
        }

        const masteredBtn = div.querySelector(".btn-toggle-mastered");
        if (masteredBtn) {
          masteredBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const drawer = document.getElementById(`masteredDrawer_${ch.id}`);
            if (!drawer) return;
            const isHidden = drawer.style.display === "none";
            drawer.style.display = isHidden ? "flex" : "none";
            if (isHidden) {
              drawer.style.flexDirection = "column";
              drawer.style.gap = "6px";
              drawer.innerHTML =
                `<div style="font-size: 11px; font-weight: 700; color: #34D399; margin-bottom: 2px;">
                  🏆 Mastered Traps Archive (${masteredTraps.length})
                </div>` +
                masteredTraps
                  .map(
                    (t) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                  <span style="color: var(--text-main);">${escapeHtml(t.note)}</span>
                  <button type="button" class="secondary-btn btn-restore-trap" data-chap-id="${ch.id}" data-fl-id="${t.id}" style="font-size: 10px; padding: 2px 6px; color: #FCD34D;">
                    Restore to Active
                  </button>
                </div>
              `
                  )
                  .join("");

              drawer.querySelectorAll(".btn-restore-trap").forEach((rb) => {
                rb.addEventListener("click", (ev) => {
                  ev.stopPropagation();
                  const flId = rb.getAttribute("data-fl-id");
                  const chap = state.chapters.find((c) => c.id === ch.id);
                  if (chap) {
                    const targetTrap = chap.faultLineVault.find((t) => t.id === flId);
                    if (targetTrap) {
                      targetTrap.graduated = false;
                      targetTrap.cleanStreak = 0;
                      targetTrap.lastUpdated = new Date().toISOString().split("T")[0];
                      DSRStore.saveState();
                      showToast(`Restored trap "${targetTrap.note}" to active audit!`);
                      renderSyllabus();
                    }
                  }
                });
              });
            }
          });
        }

        wireNotepadDrawerEvents(div);
        el.syllabusListContainer.appendChild(div);
      }
    });
  }

  // -------------------------------------------------------------
  // AUDIT LEDGER CONTROLLER
  function renderAuditLedger() {
    const state = DSRStore.getState();
    const logs = state.auditLogs || [];

    const filtered = logs.filter((log) => {
      if (activeAuditFilter !== "ALL") {
        if (activeAuditFilter === "POST_STUDY_REVIEW") {
          const isReview = ["POST_STUDY_REVIEW", "AD_HOC_REVIEW", "SYNTHESIS_BATTLE", "CRYO_FREEZE_SPRINT"].includes(log.inputType);
          if (!isReview) return false;
        } else if (activeAuditFilter === "NEW_CHAPTER") {
          const isChap = ["NEW_CHAPTER", "DIVIDED_CHAPTER_CREATED", "SUBTOPIC_APPENDED", "SUBTOPIC_ACTIVATED"].includes(log.inputType);
          if (!isChap) return false;
        } else if (activeAuditFilter === "MOCK_TEST_LOG") {
          if (log.inputType !== "MOCK_TEST_LOG") return false;
        } else if (activeAuditFilter === "EXAM_SETTINGS_UPDATE") {
          const isSettings = ["EXAM_SETTINGS_UPDATE", "CLOCK_SHIFT", "CLOCK_SHIFT_RESET"].includes(log.inputType);
          if (!isSettings) return false;
        } else if (log.inputType !== activeAuditFilter) {
          return false;
        }
      }
      if (auditSearchQuery) {
        const query = auditSearchQuery.toLowerCase();
        const jsonStr = JSON.stringify(log).toLowerCase();
        return jsonStr.includes(query);
      }
      return true;
    });

    el.auditCountLabel.textContent = `${filtered.length} Records`;
    el.auditLogListContainer.innerHTML = "";

    if (filtered.length === 0) {
      el.auditLogListContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 16px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle); color: var(--text-dim);">
          No audit records found matching the active filter.
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
    const div = document.createElement("div");
    div.className = "log-card";

    const comp = log.computedOutputs || {};
    const raw = log.rawInputs || {};

    // 1. Badge styling & text
    let badgeText = log.inputType;
    let badgeColorStyle = "background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.35);";

    if (log.inputType === "POST_STUDY_REVIEW" || log.inputType === "AD_HOC_REVIEW") {
      if (comp.passed) {
        badgeText = log.inputType === "AD_HOC_REVIEW" ? "AD-HOC REVIEW · PASSED" : "REVIEW · PASSED";
        badgeColorStyle = "background: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.35);";
      } else {
        badgeText = log.inputType === "AD_HOC_REVIEW" ? "AD-HOC REVIEW · LAPSED" : "REVIEW · LAPSED";
        badgeColorStyle = "background: rgba(239, 68, 68, 0.15); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.35);";
      }
    } else if (log.inputType === "CRYO_FREEZE_SPRINT") {
      badgeText = "CRYO-FREEZE SPRINT";
      badgeColorStyle = "background: rgba(56, 189, 248, 0.18); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.4);";
    } else if (log.inputType === "SYNTHESIS_BATTLE") {
      badgeText = comp.passed ? "SYNTHESIS BATTLE · PASSED" : "SYNTHESIS BATTLE · LAPSED";
      badgeColorStyle = "background: rgba(139, 92, 246, 0.2); color: #C084FC; border: 1px solid rgba(139, 92, 246, 0.4);";
    } else if (log.inputType === "NEW_CHAPTER") {
      badgeText = "NEW CHAPTER";
      badgeColorStyle = "background: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.35);";
    } else if (log.inputType === "DIVIDED_CHAPTER_CREATED") {
      badgeText = "DIVIDED CHAPTER";
      badgeColorStyle = "background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.35);";
    } else if (log.inputType === "SUBTOPIC_APPENDED" || log.inputType === "SUBTOPIC_ACTIVATED") {
      badgeText = log.inputType === "SUBTOPIC_ACTIVATED" ? "SUBTOPIC UNLOCKED" : "SUBTOPIC ADDED";
      badgeColorStyle = "background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.35);";
    } else if (log.inputType === "MOCK_TEST_LOG") {
      badgeText = "MOCK TEST MATRIX";
      badgeColorStyle = "background: rgba(139, 92, 246, 0.2); color: #C084FC; border: 1px solid rgba(139, 92, 246, 0.4);";
    } else if (log.inputType === "CLOCK_SHIFT" || log.inputType === "CLOCK_SHIFT_RESET") {
      badgeText = log.inputType === "CLOCK_SHIFT_RESET" ? "CLOCK RESET" : "CLOCK SHIFT";
      badgeColorStyle = "background: rgba(139, 92, 246, 0.2); color: #C084FC; border: 1px solid rgba(139, 92, 246, 0.4);";
    } else if (log.inputType === "EXAM_SETTINGS_UPDATE") {
      badgeText = "SETTINGS UPDATE";
      badgeColorStyle = "background: rgba(245, 158, 11, 0.15); color: #FCD34D; border: 1px solid rgba(245, 158, 11, 0.35);";
    } else if (log.inputType === "NOTEPAD_BARCODE_ADDED" || log.inputType === "NOTEPAD_BARCODE_DELETED") {
      badgeText = "NOTEPAD BARCODE";
      badgeColorStyle = "background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.35);";
    } else if (log.inputType === "DELETE_CHAPTER") {
      badgeText = "CHAPTER DELETED";
      badgeColorStyle = "background: rgba(239, 68, 68, 0.15); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.35);";
    }

    // 2. Title & Icon
    let title = log.inputType;
    const isReview = ["POST_STUDY_REVIEW", "AD_HOC_REVIEW", "CRYO_FREEZE_SPRINT", "SYNTHESIS_BATTLE"].includes(log.inputType);
    if (isReview) {
      const chName = raw.chapterName || "Chapter";
      if (log.inputType === "CRYO_FREEZE_SPRINT") {
        title = `⚡ ${chName} · 10m Cryo-Freeze Recall`;
      } else if (log.inputType === "SYNTHESIS_BATTLE") {
        title = `⚔️ ${chName} · Synthesis Boss Battle`;
      } else if (log.inputType === "AD_HOC_REVIEW") {
        title = `🧭 ${chName} · Ad-Hoc Session Audit`;
      } else {
        title = `📘 ${chName} · Spaced Review Session`;
      }
    } else if (log.inputType === "NEW_CHAPTER") {
      title = `✨ New Chapter Enrolled: ${raw.name || raw.chapterName || "Untitled"}`;
    } else if (log.inputType === "DIVIDED_CHAPTER_CREATED") {
      title = `🔗 Divided Chapter Chain: ${raw.macroName || "Topic"}`;
    } else if (log.inputType === "SUBTOPIC_APPENDED") {
      title = `➕ Added Subtopic: ${raw.name || "Topic"}`;
    } else if (log.inputType === "SUBTOPIC_ACTIVATED") {
      title = `🔓 Unlocked Subtopic: ${raw.name || "Topic"}`;
    } else if (log.inputType === "MOCK_TEST_LOG") {
      title = `📝 Mock Post-Mortem: ${raw.testName || "Full Mock Test"}`;
    } else if (log.inputType === "CLOCK_SHIFT") {
      const sDays = raw.shiftDays !== undefined ? raw.shiftDays : (comp.shiftDays || 0);
      title = `⏱️ Syllabus Clock Shift: ${sDays > 0 ? '+' : ''}${sDays} Days`;
    } else if (log.inputType === "CLOCK_SHIFT_RESET") {
      title = `↺ Sickness Buffer Reset (${raw.revertedDays || comp.revertedDays || 0} Days Reverted)`;
    } else if (log.inputType === "EXAM_SETTINGS_UPDATE") {
      title = `⚙️ Exam Calibration Settings Updated`;
    } else if (log.inputType === "NOTEPAD_BARCODE_ADDED") {
      title = `🏷️ Registered Notepad Barcode #${raw.code || ""}`;
    } else if (log.inputType === "DELETE_CHAPTER") {
      title = `🗑️ Deleted Chapter: ${raw.chapterName || "Topic"}`;
    } else if (log.inputType === "RESTORE_BACKUP") {
      title = `💾 Restored System State Backup`;
    }

    // 3. Human Narrative (Plain English explanation)
    let narrative = "";
    if (isReview) {
      if (log.inputType === "CRYO_FREEZE_SPRINT" || raw.isCryoFreeze || comp.isCryoFreeze) {
        const shift = comp.cryoShiftDays || 2;
        narrative = `Completed a quick 10-minute active formula & concept recall sprint (0 problems attempted). Blank-page recall score: <strong>${raw.blankPageScore || 3}/5</strong>. Memory stability preserved at <strong>${comp.S_old || comp.S_new || '?'}d</strong> with an immediate <strong>+${shift}d schedule buffer</strong> applied to protect against lapses without study fatigue.`;
      } else {
        const totalProb = raw.totalProblems || 0;
        const corrProb = raw.correctProblems || 0;
        const silly = raw.sillySlips || 0;
        const qVal = comp.Q !== undefined ? comp.Q : (raw.Q || "?");
        const passText = comp.passed ? '<span style="color: var(--emerald-retained); font-weight: 700;">PASSED</span>' : '<span style="color: #F87171; font-weight: 700;">LAPSED</span>';
        const sOld = comp.S_old !== undefined ? comp.S_old : "?";
        const sNew = comp.S_new !== undefined ? comp.S_new : "?";
        let deltaS = "";
        if (typeof sOld === "number" && typeof sNew === "number") {
          const diff = sNew - sOld;
          deltaS = ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}d)`;
        }
        const nextDueStr = comp.nextDueDate ? `for <strong>${comp.nextDueDate}</strong> (in ${comp.nextDueDays || '?'} days)` : `in <strong>${comp.nextDueDays || '?'} days</strong>`;

        narrative = `Attempted <strong>${totalProb} problems</strong> (${corrProb} correct, ${silly} silly slip${silly === 1 ? '' : 's'}) during a ${raw.durationMins || 45}m session. Quality Grade: <strong>Q = ${qVal}</strong> (${passText}). Memory stability shifted from <strong>${sOld}d &rarr; ${sNew}d</strong>${deltaS}. Next review scheduled ${nextDueStr}.`;

        if (comp.manualIntervalOverride) {
          narrative += ` <span style="color: #38BDF8;">(Manual Next-Interval Override applied: ${comp.manualIntervalOverride}d &rarr; implied Stability S = ${comp.S_new}d)</span>.`;
        }
        if (raw.faultLineNote && raw.faultLineNote !== "(None)") {
          narrative += `<br><span style="color: var(--amber-hazard); font-size: 11.5px;">⚠️ Red-pen edge case recorded: "${escapeHtml(raw.faultLineNote)}"</span>`;
        }
      }
    } else if (log.inputType === "NEW_CHAPTER") {
      const initS = comp.initialS || comp.S || 3.2;
      const due = comp.nextDueDays || 3;
      narrative = `Enrolled new chapter <strong>${escapeHtml(raw.name || raw.chapterName || "Untitled")}</strong> in <strong>${escapeHtml(raw.subject || "Physics")}</strong> with difficulty <strong>D₀ = ${raw.D0 || 5.0}</strong>, starting baseline stability <strong>S₁ = ${initS}d</strong>, and importance weightage <strong>${raw.weightage || 1.0}x</strong>. Day-0 initial spaced review queued in ${due} days.`;
    } else if (log.inputType === "DIVIDED_CHAPTER_CREATED") {
      narrative = `Partitioned large chapter <strong>${escapeHtml(raw.macroName || "Topic")}</strong> into a sequential chain of <strong>${raw.subtopicsCount || 0} subtopics</strong>. Scaled session lengths by 60% for rapid targeted retention. Subtopic 1 unlocked immediately; subsequent subtopics set to unlock sequentially.`;
    } else if (log.inputType === "SUBTOPIC_APPENDED") {
      narrative = `Appended subtopic <strong>${escapeHtml(raw.name || "Topic")}</strong> (#${raw.sequenceIndex || "?"}) to group <strong>${escapeHtml(raw.groupTitle || "Macro Topic")}</strong>.`;
    } else if (log.inputType === "SUBTOPIC_ACTIVATED") {
      narrative = `Unlocked subtopic <strong>${escapeHtml(raw.name || "Topic")}</strong> in <strong>${escapeHtml(raw.groupTitle || "Group")}</strong> and scheduled its Day-0 review.`;
    } else if (log.inputType === "CLOCK_SHIFT") {
      const days = raw.shiftDays !== undefined ? raw.shiftDays : (comp.shiftDays || 0);
      const sign = days > 0 ? `+${days}` : `${days}`;
      narrative = `Shifted syllabus preparation clock by <strong>${sign} days</strong> across <strong>${raw.activeChaptersCount || comp.count || 0} active chapters</strong>. Total applied sickness/emergency clock buffer is now <strong>${raw.totalClockShiftDays || comp.totalClockShiftDays || 0} days</strong>.`;
    } else if (log.inputType === "CLOCK_SHIFT_RESET") {
      narrative = `Reverted all <strong>${raw.revertedDays || comp.revertedDays || 0} sickness buffer days</strong> across <strong>${raw.activeChaptersCount || comp.count || 0} active chapters</strong>. Total sickness buffer returned to <strong>0 days</strong>.`;
    } else if (log.inputType === "MOCK_TEST_LOG") {
      narrative = `Recorded mock test post-mortem for <strong>${escapeHtml(raw.testName || "Mock")}</strong> (${escapeHtml(raw.testDate || "Today")}). Processed performance across questions with concept lapse back-propagation to prerequisite chapters.`;
    } else if (log.inputType === "EXAM_SETTINGS_UPDATE") {
      narrative = `Updated user calibration parameters and examination milestones.`;
    } else if (log.inputType === "NOTEPAD_BARCODE_ADDED") {
      narrative = `Linked physical red-pen audit reference <strong>#${escapeHtml(raw.code || "")}</strong> (${escapeHtml(raw.location || "Notepad")}) to chapter.`;
    } else if (log.inputType === "DELETE_CHAPTER") {
      narrative = `Permanently removed chapter <strong>${escapeHtml(raw.chapterName || "Topic")}</strong> and pruned associated dependency links.`;
    } else if (log.inputType === "RESTORE_BACKUP") {
      narrative = `Restored database state from backup JSON archive (${raw.totalChapters || 0} chapters, ${raw.totalLogs || 0} audit logs).`;
    } else {
      narrative = escapeHtml(comp.message || "User operation executed and verified.");
    }

    // 4. Parameter Chips Row
    const chips = [];
    if (isReview) {
      if (comp.Q !== undefined) chips.push(`<span class="log-chip" style="color: ${comp.passed ? 'var(--emerald-retained)' : '#F87171'}; font-weight: 700;">Q = ${comp.Q}</span>`);
      if (raw.blankPageScore !== undefined) chips.push(`<span class="log-chip">Blank-Page: ${raw.blankPageScore}/5</span>`);
      if (comp.rigorLabel) chips.push(`<span class="log-chip" style="color: var(--cyan-core);">🎯 ${comp.rigorLabel} (${(comp.rigorMult || 1).toFixed(2)}x)</span>`);
      if (comp.P_adj !== undefined) chips.push(`<span class="log-chip">Mastery: ${comp.P_adj}%</span>`);
      if (raw.totalProblems > 0) chips.push(`<span class="log-chip">Problems: ${raw.correctProblems}/${raw.totalProblems}</span>`);
      if (raw.sillySlips > 0) chips.push(`<span class="log-chip" style="color: #FCD34D;">Silly Slips: ${raw.sillySlips}</span>`);
      if (comp.S_new !== undefined) chips.push(`<span class="log-chip">Stability: ${comp.S_old !== undefined ? comp.S_old + 'd → ' : ''}${comp.S_new}d</span>`);
      if (comp.D_new !== undefined) chips.push(`<span class="log-chip">Difficulty: ${comp.D_new}</span>`);
      if (raw.durationMins) chips.push(`<span class="log-chip">Duration: ${raw.durationMins}m</span>`);
      if (comp.nextDueDays !== undefined) chips.push(`<span class="log-chip" style="color: var(--cyan-core);">Next Due: in ${comp.nextDueDays}d</span>`);
      if (comp.manualIntervalOverride) chips.push(`<span class="log-chip" style="color: #38BDF8; font-weight: 700;">Override: ${comp.manualIntervalOverride}d</span>`);
    } else if (log.inputType === "NEW_CHAPTER") {
      if (raw.subject) chips.push(`<span class="log-chip">${raw.subject}</span>`);
      if (raw.D0) chips.push(`<span class="log-chip">D₀: ${raw.D0}</span>`);
      if (comp.initialS || comp.S) chips.push(`<span class="log-chip">S₁: ${comp.initialS || comp.S}d</span>`);
      if (raw.weightage) chips.push(`<span class="log-chip">Weightage: ${raw.weightage}x</span>`);
      if (comp.nextDueDays) chips.push(`<span class="log-chip">First Due: in ${comp.nextDueDays}d</span>`);
    } else if (log.inputType === "CLOCK_SHIFT") {
      const days = raw.shiftDays !== undefined ? raw.shiftDays : (comp.shiftDays || 0);
      chips.push(`<span class="log-chip" style="color: #C084FC; font-weight: 700;">Shift: ${days > 0 ? '+' : ''}${days}d</span>`);
      if (raw.totalClockShiftDays !== undefined || comp.totalClockShiftDays !== undefined) {
        chips.push(`<span class="log-chip">Total Buffer: ${raw.totalClockShiftDays || comp.totalClockShiftDays}d</span>`);
      }
      if (raw.activeChaptersCount || comp.count) chips.push(`<span class="log-chip">Active Chapters: ${raw.activeChaptersCount || comp.count}</span>`);
    } else if (log.inputType === "CLOCK_SHIFT_RESET") {
      chips.push(`<span class="log-chip" style="color: #FCD34D; font-weight: 700;">Reverted: ${raw.revertedDays || comp.revertedDays || 0}d</span>`);
      chips.push(`<span class="log-chip">Active Chapters: ${raw.activeChaptersCount || comp.count || 0}</span>`);
    }

    const chipsHtml = chips.length > 0 ? `<div class="log-chips-row">${chips.join("")}</div>` : "";

    div.innerHTML = `
      <div class="log-top-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="log-badge mono" style="${badgeColorStyle}">${escapeHtml(badgeText)}</span>
          <span class="mono" style="font-size: 11px; color: var(--text-dim);">${log.displayDate} · ${log.displayTime}</span>
        </div>
        <button class="secondary-btn btn-del-log" data-id="${log.id}" style="padding: 2px 7px; font-size: 11px; color: #F87171; border-color: rgba(239, 68, 68, 0.3);" title="Delete Record">
          🗑️
        </button>
      </div>

      <div class="log-title-row">
        <span>${escapeHtml(title)}</span>
      </div>

      <div class="log-entry-path">
        📍 Path: <span class="mono">${escapeHtml(log.entryMethod || "Manual Action")}</span>
      </div>

      <div class="log-narrative">
        ${narrative}
      </div>

      ${chipsHtml}

      <button type="button" class="log-json-toggle">
        <span class="toggle-icon">▶</span>
        <span>Show Raw Parameters & Schema</span>
      </button>

      <div class="log-details-table">
        <pre class="mono" style="font-size: 10.5px; color: #CBD5E1; margin: 0; white-space: pre-wrap; word-break: break-all;">${escapeHtml(JSON.stringify({ id: log.id, inputType: log.inputType, entryMethod: log.entryMethod, rawInputs: log.rawInputs, computedOutputs: log.computedOutputs }, null, 2))}</pre>
      </div>
    `;

    // Collapsible Raw Parameters & JSON box
    const toggleBtn = div.querySelector(".log-json-toggle");
    const detailsBox = div.querySelector(".log-details-table");
    const toggleIcon = div.querySelector(".toggle-icon");
    toggleBtn.addEventListener("click", () => {
      const isOpen = detailsBox.classList.toggle("open");
      toggleIcon.textContent = isOpen ? "▼" : "▶";
      toggleBtn.querySelector("span:last-child").textContent = isOpen ? "Hide Raw Parameters & Schema" : "Show Raw Parameters & Schema";
    });

    // Delete Log Handler
    div.querySelector(".btn-del-log").addEventListener("click", (e) => {
      e.stopPropagation();
      DSRStore.deleteAuditLog(log.id);
      renderAuditLedger();
      showToast("Audit record deleted.");
    });

    return div;
  }

  function renderCurrentView() {
    if (activeTab === "dashboard") renderDashboard();
    else if (activeTab === "syllabus") renderSyllabus();
    else if (activeTab === "audit") renderAuditLedger();
  }

  // -------------------------------------------------------------
  // MODAL 1: ADD NEW CHAPTER CONTROLLER
  // -------------------------------------------------------------
  function initAddChapterModal() {
    // Segmented controls for Subject & Weightage
    document.querySelectorAll("#segNewSubject .segmented-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        document.querySelectorAll("#segNewSubject .segmented-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        renderParentPrerequisitesList();
      });
    });

    document.querySelectorAll("#segNewWeightage .segmented-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        document.querySelectorAll("#segNewWeightage .segmented-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
      });
    });

    const slider = document.getElementById("sliderNewD0");
    slider.addEventListener("input", (e) => {
      document.getElementById("lblNewD0Val").textContent = Number(e.target.value).toFixed(1);
      updateNewChapterPreview();
    });

    document.getElementById("btnSaveNewChapter").addEventListener("click", () => {
      const name = document.getElementById("inpNewChapterName").value.trim();
      if (!name) {
        showToast("Please enter a chapter title.");
        return;
      }

      const subject = document.querySelector("#segNewSubject .segmented-option.active").getAttribute("data-value");
      const D0 = Number(document.getElementById("sliderNewD0").value);
      const weightage = Number(document.querySelector("#segNewWeightage .segmented-option.active").getAttribute("data-value"));

      const parents = [];
      document.querySelectorAll(".parent-coupling-input").forEach((inp) => {
        const val = Number(inp.value);
        if (val > 0) {
          parents.push({
            parentId: inp.getAttribute("data-parent-id"),
            couplingWeight: DSREngine.clamp(0.1, 1.0, val / 100)
          });
        }
      });

      DSRStore.addChapter({ name, subject, D0, weightage, parents });
      document.getElementById("inpNewChapterName").value = "";
      closeAllModals();
      showToast(`Added ${name} with starting S=${DSREngine.calculateInitialStability(D0, 4.0)}d`, true);
      renderDashboard();
    });
  }

  function renderParentPrerequisitesList() {
    const list = document.getElementById("newChapterParentsList");
    list.innerHTML = "";
    const activeSubject = document.querySelector("#segNewSubject .segmented-option.active")?.getAttribute("data-value") || "Physics";
    const state = DSRStore.getState();
    const candidateParents = DSRStore.getActiveChapters(state.chapters).filter((c) => c.subject === activeSubject && !c.isSubtopic);

    if (candidateParents.length === 0) {
      list.innerHTML = `<span style="font-size: 11px; color: var(--text-dim); font-style: italic;">No prior ${activeSubject} chapters available to link as prerequisites.</span>`;
      return;
    }

    candidateParents.forEach((p) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.background = "var(--bg-card)";
      row.style.padding = "6px 10px";
      row.style.borderRadius = "var(--radius-sm)";
      row.style.border = "1px solid var(--border-subtle)";

      row.innerHTML = `
        <span style="font-size: 12px; font-weight: 600;">${escapeHtml(p.name)}</span>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 10px; color: var(--text-dim);">Coupling:</span>
          <input type="number" class="form-input mono parent-coupling-input" data-parent-id="${p.id}" min="0" max="100" step="5" value="0" style="width: 55px; padding: 2px 4px; font-size: 11px; text-align: center;" />
          <span style="font-size: 10px; color: var(--text-dim);">%</span>
        </div>
      `;
      list.appendChild(row);
    });
  }

  function updateNewChapterPreview() {
    const d0 = Number(document.getElementById("sliderNewD0").value);
    const S1 = DSREngine.calculateInitialStability(d0, 4.0, false);
    const tier = DSREngine.getSessionTier(S1, 1.0, false);
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
      const total = Number(inpTotal.value) || 0;
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

    // Live recalculation on Manual Next-Interval Override
    const inpCustomInterval = document.getElementById("inpCustomNextInterval");
    if (inpCustomInterval) {
      inpCustomInterval.addEventListener("input", updatePostStudyLivePreview);
    }

    // Modal B Add Physical Notepad Barcode
    const btnAddNotepadModal = document.getElementById("btnAddNotepadIdModal");
    if (btnAddNotepadModal) {
      btnAddNotepadModal.addEventListener("click", () => {
        const state = DSRStore.getState();
        const chapter = state.chapters.find((c) => c.id === currentAuditingChapterId);
        if (!chapter) return;
        const inpCode = document.getElementById("inpNotepadCode");
        const inpLoc = document.getElementById("inpNotepadLoc");
        const inpSum = document.getElementById("inpNotepadSummary");
        const code = inpCode ? inpCode.value.trim() : "";
        if (!code) {
          showToast("Please enter a Barcode / ID (e.g., ROT-03).");
          return;
        }
        const loc = (inpLoc ? inpLoc.value.trim() : "") || "Physical Notepad";
        const sum = (inpSum ? inpSum.value.trim() : "");
        const added = DSRStore.addNotepadIdToChapter(chapter.id, { code, location: loc, summary: sum });
        if (added) {
          if (inpCode) inpCode.value = "";
          if (inpLoc) inpLoc.value = "";
          if (inpSum) inpSum.value = "";
          renderModalNotepadPills(chapter);
          showToast(`Registered barcode #${added.code} to ${chapter.name}!`, true);
        }
      });
    }

    // Modal B Fault-Line Severity Selector (1x, 2x, 3x clean streak)
    document.querySelectorAll(".fl-severity-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedFaultLineSeverity = Number(btn.getAttribute("data-severity")) || 2;
        document.querySelectorAll(".fl-severity-opt").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
      });
    });

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
    const totalVal = document.getElementById("inpTotalProblems").value;
    const total = totalVal === "" ? 0 : Math.max(0, Number(totalVal));
    let correct = Number(document.getElementById("inpCorrectProblems").value);
    if (isNaN(correct)) correct = 0;
    correct = DSREngine.clamp(0, total, correct);
    document.getElementById("inpCorrectProblems").value = correct;

    const wrong = total - correct;
    if (total === 0) {
      document.getElementById("lblTotalWrong").textContent = "0 Problems (Cryo-Freeze / Formula Sprint)";
      postStudySillySlips = 0;
    } else {
      document.getElementById("lblTotalWrong").textContent = `${wrong} Wrong Answer${wrong === 1 ? '' : 's'}`;
    }

    if (postStudySillySlips > wrong) {
      postStudySillySlips = wrong;
    }
    document.getElementById("lblSillyVal").textContent = postStudySillySlips;
    const blanks = wrong - postStudySillySlips;
    document.getElementById("lblConceptBlanksVal").textContent = `${blanks} Blank${blanks === 1 ? '' : 's'}`;
  }

  function renderModalNotepadPills(chapter) {
    const container = document.getElementById("modalNotepadPillsContainer");
    if (!container) return;
    container.innerHTML = "";
    const list = Array.isArray(chapter.notepadIds) ? chapter.notepadIds : [];
    if (list.length === 0) {
      container.innerHTML = `<span style="font-size: 11px; color: var(--text-dim); font-style: italic;">No red-pen IDs registered for this chapter yet.</span>`;
      return;
    }
    list.forEach((item) => {
      const chip = document.createElement("div");
      chip.className = "notepad-pill";
      chip.textContent = `#${item.code}: ${item.location}`;
      chip.title = `${item.code} [${item.location}]: ${item.summary || "No notes"} (Click to inspect)`;
      chip.addEventListener("click", () => {
        showToast(`🏷️ [#${item.code}] ${item.location}: ${item.summary || "No notes"}`, false, 4500);
      });
      container.appendChild(chip);
    });
  }

  function renderModalFaultLineChecklist(chapter) {
    const container = document.getElementById("modalFaultLineChecklist");
    if (!container) return;
    container.innerHTML = "";
    const activeTraps = Array.isArray(chapter.faultLineVault) ? chapter.faultLineVault.filter((t) => !t.graduated) : [];

    if (activeTraps.length === 0) {
      container.innerHTML = `<div style="font-size: 11px; color: var(--text-dim); font-style: italic; padding: 4px 0;">No active traps logged for this topic yet.</div>`;
      return;
    }

    activeTraps.forEach((trap) => {
      const row = document.createElement("div");
      row.className = "fl-checklist-row";
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      row.style.gap = "8px";

      const req = trap.requiredStreak || 2;
      const streak = Number(trap.cleanStreak) || 0;
      const curDots = Math.min(req, Math.max(0, streak));
      const dots = "●".repeat(curDots) + "○".repeat(req - curDots);
      const badgeText = req === 1 ? "Min · 1x" : req === 3 ? "Crit · 3x" : "Std · 2x";
      const badgeClass = req === 1 ? "fl-pill-minor" : req === 3 ? "fl-pill-critical" : "fl-pill-standard";
      const progressText = `Progress: ${dots} (${curDots}/${req} in a row)`;

      row.innerHTML = `
        <input type="checkbox" id="chk_fl_${trap.id}" data-fl-id="${trap.id}" style="margin-top: 3px;" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <span style="font-size: 12px; font-weight: 600; color: var(--text-main);">${escapeHtml(trap.note)}</span>
            <button type="button" class="fl-severity-badge ${badgeClass} btn-toggle-fl-req" data-fl-id="${trap.id}" title="Tap to cycle required clean streak (1x -> 2x -> 3x)">
              ${badgeText}
            </button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-dim);">
            <span class="mono" style="color: ${streak >= req ? 'var(--emerald-retained)' : '#FCD34D'};">${progressText}</span>
            <span>Missed ${trap.missCount || 1}x</span>
          </div>
        </div>
      `;

      // Cycle severity on tap
      row.querySelector(".btn-toggle-fl-req").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentReq = trap.requiredStreak || 2;
        const nextReq = (currentReq % 3) + 1;
        DSRStore.updateFaultLineRequiredStreak(chapter.id, trap.id, nextReq);
        renderModalFaultLineChecklist(chapter);
        showToast(`Updated "${trap.note}" severity to ${nextReq}x clean recalls!`);
      });

      container.appendChild(row);
    });
  }

  function openPostStudyModal(chapterId, isAdHoc = false) {
    isAdHocMode = isAdHoc;
    isSynthesisSession = false;
    currentSynthesisPartnerId = null;
    currentAuditingChapterId = chapterId;

    const state = DSRStore.getState();
    const selectorWrap = document.getElementById("postStudyChapterSelectorWrap");
    const select = document.getElementById("postStudyChapterSelect");

    if (isAdHoc) {
      selectorWrap.style.display = "flex";
      select.innerHTML = DSRStore.getActiveChapters(state.chapters)
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

  function launchSynthesisBattle(synthesisPair) {
    if (!synthesisPair || !synthesisPair.child || !synthesisPair.parent) return;
    openPostStudyModal(synthesisPair.child.id, false);
    isSynthesisSession = true;
    currentSynthesisPartnerId = synthesisPair.parent.id;
    document.getElementById("postStudyModalTitle").textContent = `Synthesis Battle: ${synthesisPair.parent.name} + ${synthesisPair.child.name}`;
    updatePostStudyLivePreview();
  }

  function populatePostStudyDefaults(chapterId) {
    const state = DSRStore.getState();
    const chapter = state.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;

    const tier = DSREngine.getSessionTier(chapter.S, 1.0, !!chapter.isSubtopic, chapter.tauEWMA, chapter.D0);

    const chkBlame = document.getElementById("chkParentBlame");
    if (chkBlame) chkBlame.checked = false;

    // Pre-fill for Sprint Mode if toggled (Requirement 4 & 5.3)
    if (isSprintModeActive) {
      document.getElementById("inpTotalProblems").value = 0;
      document.getElementById("inpCorrectProblems").value = 0;
      document.getElementById("inpDurationMins").value = 10;
    } else {
      document.getElementById("inpTotalProblems").value = tier.recommendedProblems;
      document.getElementById("inpCorrectProblems").value = Math.max(1, tier.recommendedProblems - 2);
      document.getElementById("inpDurationMins").value = tier.durationMins;
    }

    document.getElementById("inpFaultLineNote").value = "";
    selectedFaultLineSeverity = 2;
    document.querySelectorAll(".fl-severity-opt").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-severity") === "2");
    });

    // Reset Notepad ID inputs and render existing pills
    const inpCode = document.getElementById("inpNotepadCode");
    if (inpCode) inpCode.value = "";
    const inpLoc = document.getElementById("inpNotepadLoc");
    if (inpLoc) inpLoc.value = "";
    const inpSum = document.getElementById("inpNotepadSummary");
    if (inpSum) inpSum.value = "";
    renderModalNotepadPills(chapter);

    // Reset Custom Next Interval Override
    const inpCustom = document.getElementById("inpCustomNextInterval");
    if (inpCustom) inpCustom.value = "";

    // Render Fault-Line Checklist for existing traps
    renderModalFaultLineChecklist(chapter);

    if (tier.tier === 1) {
      setPostStudyRigorTier(2);
    } else {
      setPostStudyRigorTier(3);
    }

    postStudyBlankPageScore = 3;
    postStudySillySlips = 0;
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
    const totalProblems = totalVal === "" ? 0 : Math.max(0, Number(totalVal));
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
    const modeLabel = outcome.isCryoFreeze ? " · 10m Cryo-Freeze" : "";
    document.getElementById("prevQGrade").innerHTML = `<span style="color: ${qColor};">Q = ${outcome.Q} (${outcome.passed ? 'PASSED' : 'LAPSED'})${modeLabel}</span>`;
    document.getElementById("prevAccuracy").textContent = outcome.isCryoFreeze
      ? `Active Recall Sprint (0 Problems) · Shift: +${outcome.cryoShiftDays}d buffer`
      : `Mastery: ${outcome.P_adj}% (Raw: ${outcome.P_true}%) | Rigor Mult: ${outcome.rigorMult.toFixed(2)}x`;
    document.getElementById("prevStabilityShift").textContent = outcome.isCryoFreeze
      ? `${outcome.S_old}d (Unchanged, +${outcome.cryoShiftDays}d schedule buffer)`
      : `${outcome.S_old}d → ${outcome.S_new}d`;

    // Next due preview & Custom Interval Override
    const customIntVal = document.getElementById("inpCustomNextInterval") ? document.getElementById("inpCustomNextInterval").value.trim() : "";
    const mockUpdatedChapter = { ...chapter, S: outcome.S_new, D: outcome.D_new };
    const autoInterval = DSREngine.calculateNextIntervalDays(mockUpdatedChapter, state.settings, Date.now());
    
    const inpCustom = document.getElementById("inpCustomNextInterval");
    if (inpCustom) {
      inpCustom.placeholder = `Auto (${autoInterval}d)`;
    }

    const manualInterval = customIntVal !== "" ? parseFloat(customIntVal) : null;
    const finalInterval = (manualInterval && manualInterval > 0) ? manualInterval : autoInterval;
    const nextDate = new Date(Date.now() + finalInterval * 86400000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
    const overrideLabel = (manualInterval && manualInterval > 0) ? " [Manual Override]" : "";
    document.getElementById("prevNextDue").textContent = `${nextDate} (in ${finalInterval}d)${overrideLabel}`;
    document.getElementById("prevTierShift").textContent = `${DSREngine.getSessionTier(chapter.S, 1.0, !!chapter.isSubtopic).name} → ${outcome.newTierInfo.name}`;

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
    if (outcome.passed && !outcome.isCryoFreeze && Array.isArray(chapter.parents) && chapter.parents.length > 0) {
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

    DSRStore.captureUndoSnapshot(`Session Audit: ${chapter.name}`);

    const totalVal = document.getElementById("inpTotalProblems").value;
    const totalProblems = totalVal === "" ? 0 : Math.max(0, Number(totalVal));
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

    // Custom Next Interval Override
    const customIntVal = document.getElementById("inpCustomNextInterval") ? document.getElementById("inpCustomNextInterval").value.trim() : "";
    const manualInterval = customIntVal !== "" ? parseFloat(customIntVal) : null;
    if (manualInterval && manualInterval > 0) {
      const customS = DSREngine.calculateStabilityForInterval(manualInterval, { ...chapter, D: outcome.D_new }, state.settings, now);
      outcome.S_new = customS;
      chapter.S = customS;
      chapter.lastDirectS = customS;
      outcome.manualIntervalOverride = manualInterval;
    } else {
      chapter.S = outcome.S_new;
    }

    // Apply Chapter updates
    chapter.D = outcome.D_new;
    chapter.hazardIndex = outcome.newHazardIndex;
    chapter.lapses = outcome.newLapses;
    chapter.forcedUrgent = false;
    if (outcome.newTauEWMA) {
      chapter.tauEWMA = outcome.newTauEWMA;
    }

    if (outcome.isCryoFreeze) {
      // 10-Min Cryo-Freeze Refresher: Advance lastReviewTimestamp by buffer days, keep lastDirectReviewTimestamp intact
      const shiftMs = (outcome.cryoShiftDays || 0) * 86400000;
      chapter.lastReviewTimestamp = (Number(chapter.lastReviewTimestamp) || now) + shiftMs;
    } else {
      chapter.lastReviewTimestamp = now;
      chapter.lastDirectReviewTimestamp = now;
      if (outcome.passed) {
        chapter.lastDirectS = outcome.S_new;
      }
    }

    // If Synthesis Boss Battle, complete partner Parent chapter as well (Requirement 1)
    let partnerChapter = null;
    let partnerOutcome = null;
    if (isSynthesisSession && currentSynthesisPartnerId) {
      partnerChapter = state.chapters.find((c) => c.id === currentSynthesisPartnerId);
      if (partnerChapter) {
        partnerOutcome = DSREngine.evaluateStudySession(partnerChapter, inputs, state.settings, now);
        partnerChapter.S = partnerOutcome.S_new;
        partnerChapter.D = partnerOutcome.D_new;
        partnerChapter.lastReviewTimestamp = now;
        partnerChapter.lastDirectReviewTimestamp = now;
        partnerChapter.lastDirectS = partnerOutcome.S_new;
        partnerChapter.hazardIndex = partnerOutcome.newHazardIndex;
        partnerChapter.lapses = partnerOutcome.newLapses;
        partnerChapter.forcedUrgent = false;
        if (partnerOutcome.newTauEWMA) {
          partnerChapter.tauEWMA = partnerOutcome.newTauEWMA;
        }
      }
    }

    // Evaluate Fault-Line Vault Checklist & Graduation (Severity Aware)
    const activeTraps = Array.isArray(chapter.faultLineVault) ? chapter.faultLineVault.filter((t) => !t.graduated) : [];
    activeTraps.forEach((trap) => {
      const chk = document.getElementById(`chk_fl_${trap.id}`);
      const isChecked = chk && chk.checked;
      const targetReq = trap.requiredStreak || 2;
      if (isChecked && outcome.passed) {
        trap.cleanStreak = (trap.cleanStreak || 0) + 1;
        trap.lastUpdated = new Date().toISOString().split("T")[0];
        if (trap.cleanStreak >= targetReq) {
          trap.graduated = true;
        }
      } else if (!isChecked && !outcome.isCryoFreeze) {
        trap.cleanStreak = 0;
        trap.missCount = (trap.missCount || 1) + 1;
        trap.lastUpdated = new Date().toISOString().split("T")[0];
      }
    });

    // New Fault-Line input with selected severity
    if (faultLineNote) {
      if (!Array.isArray(chapter.faultLineVault)) chapter.faultLineVault = [];
      const existing = chapter.faultLineVault.find((t) => t.note.trim().toLowerCase() === faultLineNote.toLowerCase());
      if (existing) {
        existing.graduated = false;
        existing.cleanStreak = 0;
        existing.missCount = (existing.missCount || 1) + 1;
        existing.requiredStreak = selectedFaultLineSeverity || 2;
        existing.lastUpdated = new Date().toISOString().split("T")[0];
      } else {
        chapter.faultLineVault.unshift({
          id: "fl_" + Date.now(),
          note: faultLineNote,
          requiredStreak: selectedFaultLineSeverity || 2,
          missCount: 1,
          cleanStreak: 0,
          graduated: false,
          lastUpdated: new Date().toISOString().split("T")[0]
        });
      }
    }

    // Auto-save physical notepad barcode if entered in Modal B (skip undo overwrite)
    const npCodeInput = document.getElementById("inpNotepadCode");
    const npCode = npCodeInput ? npCodeInput.value.trim() : "";
    let savedNotepadItem = null;
    if (npCode) {
      const npLoc = (document.getElementById("inpNotepadLoc") ? document.getElementById("inpNotepadLoc").value.trim() : "") || "Physical Notepad";
      const npSummary = document.getElementById("inpNotepadSummary") ? document.getElementById("inpNotepadSummary").value.trim() : "";
      savedNotepadItem = DSRStore.addNotepadIdToChapter(chapter.id, { code: npCode, location: npLoc, summary: npSummary }, true);
    }

    // Bounded Upward Parent Cascade (Requirement 4.C.2)
    const parentBoostsSummary = [];
    if (outcome.passed && !outcome.isCryoFreeze && Array.isArray(chapter.parents)) {
      chapter.parents.forEach((link) => {
        if (isSynthesisSession && link.parentId === currentSynthesisPartnerId) {
          // Already fully updated via Synthesis Battle completion
          return;
        }
        const pChapter = state.chapters.find((c) => c.id === link.parentId);
        if (pChapter) {
          const boost = DSREngine.calculateParentBoost(pChapter, chapter, link.couplingWeight, state.settings, now);
          if (boost.boosted) {
            pChapter.S = boost.newS;
          }
          // Bounded upward shift: max 0.15 * coupling * S, capped at lastDirect + 0.35 * S
          const coupling = Number(link.couplingWeight) || 0.45;
          const singleShiftMs = 0.15 * coupling * (Number(pChapter.S) || 1.0) * 86400000;
          const lastDirectTs = Number(pChapter.lastDirectReviewTimestamp) || Number(pChapter.lastReviewTimestamp) || now;
          const maxAllowedTs = lastDirectTs + ((Number(pChapter.S) || 1.0) * 0.35 * 86400000);
          const currentParentTs = Number(pChapter.lastReviewTimestamp) || now;
          const shiftedTs = Math.min(maxAllowedTs, currentParentTs + singleShiftMs);
          pChapter.lastReviewTimestamp = shiftedTs;

          parentBoostsSummary.push({
            parentName: pChapter.name,
            boostDays: boost.deltaS,
            shiftedDays: Math.round(((shiftedTs - currentParentTs) / 86400000) * 10) / 10
          });
        }
      });
    } else if (!outcome.passed && blameParent && Array.isArray(chapter.parents) && chapter.parents.length > 0) {
      // Emergency Rescue Queue without corrupting lastReviewTimestamp
      const pLink = chapter.parents[0];
      const pChapter = state.chapters.find((c) => c.id === pLink.parentId);
      if (pChapter) {
        pChapter.forcedUrgent = true;
        parentBoostsSummary.push({ parentName: pChapter.name, emergencyInterception: "Flagged Urgent for Priority Queue Rescue" });
      }
    }

    // Online gradient descent updates for personal calibration scalars
    if (!outcome.isCryoFreeze) {
      state.settings.thetaLogic = outcome.newThetaLogic;
      state.settings.thetaRote = outcome.newThetaRote;
      state.settings.totalReviewsLogged = (state.settings.totalReviewsLogged || 0) + 1;
    }

    // Log Immutable Audit Record
    const entryMethod = outcome.isCryoFreeze
      ? "To-Do Dashboard -> 10m Cryo-Freeze Sprint"
      : isSynthesisSession
      ? "To-Do Dashboard -> Synthesis Boss Battle"
      : isAdHocMode
      ? "Bottom-Right FAB (+) -> Ad-Hoc Review Modal"
      : "To-Do Dashboard Card Tap -> Post-Study Modal";

    const nextDays = DSREngine.calculateNextIntervalDays(chapter, state.settings, now);
    const nextDate = new Date(now + nextDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const logEntry = DSRStore.logUserAction(
      outcome.isCryoFreeze ? "CRYO_FREEZE_SPRINT" : isSynthesisSession ? "SYNTHESIS_BATTLE" : isAdHocMode ? "AD_HOC_REVIEW" : "POST_STUDY_REVIEW",
      entryMethod,
      {
        chapterName: chapter.name,
        subject: chapter.subject,
        blankPageScore: postStudyBlankPageScore,
        rigorTier: selectedPostStudyRigorTier,
        totalProblems,
        correctProblems,
        sillySlips: postStudySillySlips,
        durationMins,
        faultLineNote: faultLineNote || "(None)",
        isCryoFreeze: outcome.isCryoFreeze,
        manualIntervalOverride: outcome.manualIntervalOverride || null
      },
      {
        Q: outcome.Q,
        passed: outcome.passed,
        isCryoFreeze: outcome.isCryoFreeze,
        cryoShiftDays: outcome.cryoShiftDays,
        S_old: outcome.S_old,
        S_new: outcome.S_new,
        D_old: outcome.D_old,
        D_new: outcome.D_new,
        P_adj: outcome.P_adj,
        P_true: outcome.P_true,
        rigorLabel: outcome.rigorLabel,
        rigorMult: outcome.rigorMult,
        nextDueDays: nextDays,
        nextDueDate: nextDate,
        manualIntervalOverride: outcome.manualIntervalOverride || null,
        parentBoosts: parentBoostsSummary.length > 0 ? parentBoostsSummary : "(None)"
      }
    );

    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }

    DSRStore.saveState();
    closeAllModals();

    const toastMsg = outcome.isCryoFreeze
      ? `⚡ 10m Cryo-Freeze logged for ${chapter.name}! Buffer: +${outcome.cryoShiftDays}d`
      : `Session logged for ${chapter.name}: Q=${outcome.Q} (${outcome.passed ? 'Passed' : 'Lapsed'})`;

    showToast(toastMsg, true);
    renderDashboard();
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
    const btn = document.getElementById("btnStopwatchStart");
    if (btn) btn.textContent = "Start";
    if (stopwatchInterval) {
      clearInterval(stopwatchInterval);
      stopwatchInterval = null;
    }
  }

  function resetStopwatch() {
    stopStopwatch();
    stopwatchSeconds = 0;
    stopwatchPhase = 1;
    updateStopwatchDisplay();
  }

  function nextStopwatchPhase() {
    stopwatchPhase = (stopwatchPhase % 3) + 1;
    updateStopwatchDisplay();
  }

  function updateStopwatchDisplay() {
    const mins = Math.floor(stopwatchSeconds / 60);
    const secs = stopwatchSeconds % 60;
    const str = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const disp = document.getElementById("stopwatchDisplay");
    if (disp) disp.textContent = str;

    const label = document.getElementById("stopwatchPhaseLabel");
    if (label) {
      if (stopwatchPhase === 1) label.textContent = "PHASE 1: BLANK-PAGE RECALL";
      else if (stopwatchPhase === 2) label.textContent = "PHASE 2: RED-PEN ERROR AUDIT";
      else label.textContent = "PHASE 3: PROBLEM CHUNK DRILL";
    }
  }

  // -------------------------------------------------------------
  // MODAL 6: DIVIDED CHAPTER (SUBTOPIC CHAIN) BUILDER
  // -------------------------------------------------------------
  function initDividedChapterModal() {
    el.dialDividedChapter = document.getElementById("dialDividedChapter");
    el.modalDividedChapter = document.getElementById("modalDividedChapter");
    const btnAddSubtopic = document.getElementById("btnAddSubtopicRow");
    const btnSave = document.getElementById("btnSaveDividedChapter");

    if (el.dialDividedChapter) {
      el.dialDividedChapter.addEventListener("click", () => {
        openDividedChapterModal();
      });
    }

    document.querySelectorAll("#segDividedSubject .segmented-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        document.querySelectorAll("#segDividedSubject .segmented-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        populateDividedPrereqs();
      });
    });

    document.querySelectorAll("#segDividedWeightage .segmented-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        document.querySelectorAll("#segDividedWeightage .segmented-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
      });
    });

    if (btnAddSubtopic) {
      btnAddSubtopic.addEventListener("click", () => {
        dividedSubtopicsList.push({
          name: "",
          d0: 6.0,
          status: "learned_today"
        });
        renderDividedSubtopicRows();
      });
    }

    if (btnSave) {
      btnSave.addEventListener("click", saveDividedChapter);
    }
  }

  function openDividedChapterModal() {
    document.getElementById("inpMacroName").value = "";
    populateDividedPrereqs();
    dividedSubtopicsList = [
      { name: "Moment of Inertia & Theorems", d0: 4.5, status: "learned_today" },
      { name: "Pure Rolling & Instantaneous Axis", d0: 6.5, status: "learned_today" },
      { name: "Rolling with Slipping & Toppling", d0: 8.5, status: "unlock_later" }
    ];
    renderDividedSubtopicRows();
    openModal(el.modalDividedChapter);
  }

  function populateDividedPrereqs() {
    const sel = document.getElementById("selDividedPrereq");
    if (!sel) return;
    const activeSubject = document.querySelector("#segDividedSubject .segmented-option.active")?.getAttribute("data-value") || "Physics";
    const state = DSRStore.getState();
    const eligible = DSRStore.getActiveChapters(state.chapters).filter((c) => c.subject === activeSubject && !c.isSubtopic);

    sel.innerHTML =
      `<option value="">None (Standalone Macro-Chapter)</option>` +
      eligible.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (Coupling: 40%)</option>`).join("");
  }

  function renderDividedSubtopicRows() {
    const container = document.getElementById("dividedSubtopicsContainer");
    if (!container) return;
    container.innerHTML = "";

    dividedSubtopicsList.forEach((sub, idx) => {
      const k = idx + 1;
      const card = document.createElement("div");
      card.className = "subtopic-builder-card";

      if (k > 1) {
        const couplingBadge = document.createElement("div");
        couplingBadge.className = "coupling-indicator-badge";
        couplingBadge.textContent = k === 2 ? "⬇ Auto-Coupled (Direct: 45%)" : "⬇ Auto-Coupled (Direct: 45% | Transitive: 20%)";
        container.appendChild(couplingBadge);
      }

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span class="mono" style="font-weight: 700; color: #C084FC;">#${k}</span>
          <input type="text" class="form-input sub-name-input" data-idx="${idx}" placeholder="Subtopic Title" value="${escapeHtml(sub.name)}" style="flex: 1;" />
          ${dividedSubtopicsList.length > 2 ? `<button type="button" class="secondary-btn btn-del-sub" data-idx="${idx}" style="padding: 4px 8px; color: #F87171;" title="Remove">🗑️</button>` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: var(--text-dim);">Difficulty (D₀):</span>
          <span class="mono sub-d0-val" style="font-weight: 700; color: var(--cyan-core); font-size: 11px;">${sub.d0.toFixed(1)}</span>
        </div>
        <input type="range" class="range-input sub-d0-slider" data-idx="${idx}" min="1.0" max="10.0" step="0.5" value="${sub.d0}" />

        <div style="display: flex; gap: 12px; font-size: 11px;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="sub_status_${idx}" value="learned_today" ${sub.status === 'learned_today' ? 'checked' : ''} class="sub-status-radio" data-idx="${idx}" />
            <span>Learned Today</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="sub_status_${idx}" value="unlock_later" ${sub.status === 'unlock_later' ? 'checked' : ''} class="sub-status-radio" data-idx="${idx}" />
            <span style="color: var(--amber-hazard);">Unlock Later</span>
          </label>
        </div>
      `;

      container.appendChild(card);
    });

    container.querySelectorAll(".sub-name-input").forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const i = Number(e.target.getAttribute("data-idx"));
        dividedSubtopicsList[i].name = e.target.value;
      });
    });

    container.querySelectorAll(".sub-d0-slider").forEach((slider) => {
      slider.addEventListener("input", (e) => {
        const i = Number(e.target.getAttribute("data-idx"));
        const val = Number(e.target.value);
        dividedSubtopicsList[i].d0 = val;
        const valLabel = container.querySelectorAll(".sub-d0-val")[i];
        if (valLabel) valLabel.textContent = val.toFixed(1);
      });
    });

    container.querySelectorAll(".sub-status-radio").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const i = Number(e.target.getAttribute("data-idx"));
        dividedSubtopicsList[i].status = e.target.value;
      });
    });

    container.querySelectorAll(".btn-del-sub").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-idx"));
        dividedSubtopicsList.splice(i, 1);
        renderDividedSubtopicRows();
      });
    });
  }

  function saveDividedChapter() {
    const macroName = document.getElementById("inpMacroName").value.trim();
    if (!macroName) {
      showToast("Please enter a Macro-Chapter Name.");
      return;
    }

    for (let i = 0; i < dividedSubtopicsList.length; i++) {
      if (!dividedSubtopicsList[i].name.trim()) {
        dividedSubtopicsList[i].name = `Part ${i + 1}`;
      }
    }

    const subject = document.querySelector("#segDividedSubject .segmented-option.active")?.getAttribute("data-value") || "Physics";
    const weightage = Number(document.querySelector("#segDividedWeightage .segmented-option.active")?.getAttribute("data-value")) || 1.2;
    const topology = document.querySelector('input[name="chainTopology"]:checked')?.value || "sequential";
    const externalPrereqId = document.getElementById("selDividedPrereq").value || null;

    const res = DSRStore.createDividedChapter({
      macroName,
      subject,
      weightage,
      topology,
      externalPrereqId,
      subtopics: dividedSubtopicsList
    });

    closeAllModals();
    showToast(`Created Divided Chapter "${macroName}" (${res.subtopics.length} Subtopics)!`, true);
    renderDashboard();
  }

  // -------------------------------------------------------------
  // MODAL 3: MOCK TEST MATRIX CONTROLLER
  // -------------------------------------------------------------
  let mockTestRows = [];

  function initMockTestModal() {
    document.getElementById("btnAddMockRow").addEventListener("click", () => createMockTestRow());
    document.getElementById("btnApplyMockTest").addEventListener("click", applyMockTestMatrix);
  }

  function openMockTestModal() {
    document.getElementById("inpMockTestName").value = `Full Mock Test 0${Math.floor(Math.random() * 8) + 1}`;
    document.getElementById("inpMockTestDate").value = new Date().toISOString().split("T")[0];
    document.getElementById("mockRowsContainer").innerHTML = "";
    mockTestRows = [];

    const state = DSRStore.getState();
    const activeChaps = DSRStore.getActiveChapters(state.chapters);
    if (activeChaps.length > 0) {
      createMockTestRow(activeChaps[0].id);
      if (activeChaps.length > 1) createMockTestRow(activeChaps[1].id);
    }

    openModal(el.modalMockTest);
  }

  function createMockTestRow(preSelectedId = null) {
    const state = DSRStore.getState();
    const activeChapters = DSRStore.getActiveChapters(state.chapters);
    const rowId = "mock_row_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);

    const rowEl = document.createElement("div");
    rowEl.className = "preview-box";
    rowEl.style.padding = "8px 10px";

    const groupsSeen = new Set();
    let optionsHtml = "";

    // Macro Groups first
    activeChapters.forEach((c) => {
      if (c.groupId && !groupsSeen.has(c.groupId)) {
        groupsSeen.add(c.groupId);
        optionsHtml += `<option value="group_${c.groupId}" ${preSelectedId === `group_${c.groupId}` ? 'selected' : ''}>[Macro Group] ${escapeHtml(c.groupTitle || "Group")} (All Subtopics)</option>`;
      }
    });

    // Individual chapters
    activeChapters.forEach((c) => {
      optionsHtml += `<option value="${c.id}" ${c.id === preSelectedId ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.subject)})</option>`;
    });

    rowEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <select class="form-select sel-mock-chapter" style="flex: 1; padding: 4px 8px; font-size: 11.5px;">
          ${optionsHtml}
        </select>
        <button class="secondary-btn btn-del-mock-row" style="padding: 2px 6px; font-size: 10px; color: #F87171; margin-left: 8px;">🗑️</button>
      </div>
      <div style="display: flex; gap: 8px; font-size: 11px;">
        <div style="flex: 1;">
          <span style="color: var(--text-dim);">Att</span>
          <input type="number" class="form-input mono inp-att" min="1" max="50" value="4" style="padding: 3px 6px;" />
        </div>
        <div style="flex: 1;">
          <span style="color: var(--text-dim);">Corr</span>
          <input type="number" class="form-input mono inp-corr" min="0" max="50" value="3" style="padding: 3px 6px;" />
        </div>
        <div style="flex: 1;">
          <span style="color: var(--text-dim);">Slip (M_exec)</span>
          <input type="number" class="form-input mono inp-silly" min="0" max="50" value="1" style="padding: 3px 6px;" />
        </div>
        <div style="flex: 1;">
          <span style="color: #F87171;">Blank (M_mem)</span>
          <span class="mono lbl-blanks" style="display: block; font-weight: 700; color: #F87171; padding-top: 4px;">0</span>
        </div>
      </div>
    `;

    const inpAtt = rowEl.querySelector(".inp-att");
    const inpCorr = rowEl.querySelector(".inp-corr");
    const inpSilly = rowEl.querySelector(".inp-silly");
    const lblBlanks = rowEl.querySelector(".lbl-blanks");
    const btnRem = rowEl.querySelector(".btn-del-mock-row");
    const selChap = rowEl.querySelector(".sel-mock-chapter");

    function updateRowCalc() {
      const att = Math.max(1, Number(inpAtt.value) || 1);
      let corr = Number(inpCorr.value) || 0;
      corr = DSREngine.clamp(0, att, corr);
      inpCorr.value = corr;

      const wrong = att - corr;
      let silly = Number(inpSilly.value) || 0;
      silly = DSREngine.clamp(0, wrong, silly);
      inpSilly.value = silly;

      const blanks = wrong - silly;
      lblBlanks.textContent = blanks;
      updateMockImpactPreview();
    }

    [inpAtt, inpCorr, inpSilly, selChap].forEach((input) => input.addEventListener("input", updateRowCalc));

    btnRem.addEventListener("click", () => {
      rowEl.remove();
      mockTestRows = mockTestRows.filter((r) => r.rowId !== rowId);
      updateMockImpactPreview();
    });

    mockTestRows.push({
      rowId,
      rowEl,
      getValues: () => {
        const att = Math.max(1, Number(inpAtt.value) || 1);
        const corr = DSREngine.clamp(0, att, Number(inpCorr.value) || 0);
        const silly = DSREngine.clamp(0, att - corr, Number(inpSilly.value) || 0);
        return {
          chapterId: selChap.value,
          attempted: att,
          correct: corr,
          sillySlips: silly,
          conceptLapses: att - corr - silly
        };
      }
    });

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
      let targetName = "Unknown";
      if (vals.chapterId.startsWith("group_")) {
        const grpId = vals.chapterId.replace("group_", "");
        const groupChap = state.chapters.find((c) => c.groupId === grpId);
        targetName = groupChap ? `[Group] ${groupChap.groupTitle}` : "Macro Group";
      } else {
        const ch = state.chapters.find((c) => c.id === vals.chapterId);
        if (ch) targetName = ch.name;
      }

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
        <span>${escapeHtml(targetName)}</span>
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

    DSRStore.captureUndoSnapshot(`Mock Test: ${testName}`);

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
      let targets = [];

      if (vals.chapterId.startsWith("group_")) {
        const grpId = vals.chapterId.replace("group_", "");
        targets = state.chapters.filter((c) => c.groupId === grpId && !c.isLocked && !c.isDropped);
      } else {
        const ch = state.chapters.find((c) => c.id === vals.chapterId);
        if (ch) targets.push(ch);
      }

      targets.forEach((chapter) => {
        const oldS = chapter.S;

        if (vals.conceptLapses >= 1) {
          // Concept Failure -> Emergency Decay Interception without pre-crushing S
          chapter.forcedUrgent = true;
          const { wd, Fd } = DSREngine.getDecayParams(chapter.D);
          const theta = DSREngine.getTheta(chapter, state.settings);
          const effectiveS = chapter.S * theta;
          const targetElapsedDays = (effectiveS / Fd) * (Math.pow(0.78, -1 / wd) - 1);
          chapter.lastReviewTimestamp = now - targetElapsedDays * 86400000;
          chapter.lapses = (chapter.lapses || 0) + 1;
          affectedSummaries.push({
            chapter: chapter.name,
            impact: "Emergency Interception (R set to 0.78, forcedUrgent enabled)",
            lapses: chapter.lapses
          });
        } else if (vals.attempted >= 2 && vals.conceptLapses === 0) {
          // Aced under pressure
          chapter.lastReviewTimestamp = now;
          chapter.S = Math.round(chapter.S * tInfo.bonus * 100) / 100;
          chapter.lastDirectS = chapter.S;
          affectedSummaries.push({
            chapter: chapter.name,
            impact: `Aced Under Pressure (+${tInfo.bonusPct}% Stability Boost)`,
            S_old: oldS,
            S_new: chapter.S
          });
        } else {
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
        }
      });
    });

    const logEntry = DSRStore.logUserAction(
      "MOCK_TEST_LOG",
      "Bottom-Right FAB (+) -> Mock Test Matrix Modal",
      {
        testName,
        testDate,
        mockToughness: selectedToughness,
        mockToughnessLabel: tInfo.label,
        rows: mockTestRows.map((r) => r.getValues())
      },
      {
        affectedChapters: affectedSummaries
      }
    );

    if (state.lastUndoSnapshot) {
      state.lastUndoSnapshot.logId = logEntry.id;
    }

    DSRStore.saveState();
    closeAllModals();
    showToast(`Applied mock test across ${affectedSummaries.length} chapters`, true);
    renderDashboard();
  }

  // -------------------------------------------------------------
  // MODAL 4: SETTINGS & SICK-DAY CLOCK SHIFT CONTROLLER
  // -------------------------------------------------------------
  function initSettingsModal() {
    const slider = document.getElementById("sliderSettingsRetention");
    slider.addEventListener("input", (e) => {
      document.getElementById("lblSettingsRetentionVal").textContent = `${Math.round(Number(e.target.value) * 100)}%`;
    });

    document.getElementById("btnSaveSettings").addEventListener("click", () => {
      const examName = document.getElementById("inpSettingsExamName").value.trim();
      const examDate = document.getElementById("inpSettingsExamDate").value;
      const prepStartDate = document.getElementById("inpSettingsStartDate").value;
      const targetRetentionBase = Number(document.getElementById("sliderSettingsRetention").value);
      const dailyTimeBudgetMins = Number(document.getElementById("inpSettingsDailyBudget").value);

      DSRStore.updateSettings({
        examName,
        examDate,
        prepStartDate,
        targetRetentionBase,
        dailyTimeBudgetMins
      });

      closeAllModals();
      showToast("Calibration settings updated.", true);
      renderDashboard();
    });

    // Bidirectional Sick-Day / Syllabus Clock Shifter (Requirement 1.A)
    const btnApplyClockShift = document.getElementById("btnApplyClockShift");
    if (btnApplyClockShift) {
      btnApplyClockShift.addEventListener("click", () => {
        const inpDays = document.getElementById("inpClockShiftDays");
        const days = Number(inpDays ? inpDays.value : 0);
        if (!days || isNaN(days)) {
          showToast("Please enter a valid number of days (+ to postpone, - to pull back).");
          return;
        }
        const res = DSRStore.shiftSyllabusClock(days);
        if (res.success) {
          showToast(`Applied clock shift of ${days > 0 ? '+' : ''}${days} days across ${res.count} active chapters! (Total buffer: ${res.totalClockShiftDays}d)`, true);
          openSettingsModal(); // Refresh modal view
          renderDashboard();
        } else {
          showToast(res.message || "Failed to shift clock.");
        }
      });
    }

    const btnResetSicknessDays = document.getElementById("btnResetSicknessDays");
    if (btnResetSicknessDays) {
      btnResetSicknessDays.addEventListener("click", () => {
        const res = DSRStore.resetSicknessClock();
        if (res.success) {
          showToast(`Reverted all ${res.revertedDays} sickness buffer days across ${res.count} active chapters!`, true);
          openSettingsModal(); // Refresh modal view
          renderDashboard();
        } else {
          showToast(res.message || "No sickness buffer to reset.");
        }
      });
    }

    document.getElementById("btnResetDemoData").addEventListener("click", () => {
      if (confirm("Reset application to demonstration baseline state? All custom logs and chapters will be overwritten.")) {
        DSRStore.resetDemoData();
        closeAllModals();
        showToast("Reset to demonstration state.", true);
        renderDashboard();
      }
    });
  }

  function openSettingsModal() {
    const state = DSRStore.getState();
    const settings = state.settings;

    document.getElementById("inpSettingsExamName").value = settings.examName || "JEE ADVANCED 2027";
    document.getElementById("inpSettingsExamDate").value = settings.examDate || "2027-05-24";
    document.getElementById("inpSettingsStartDate").value = settings.prepStartDate || "2026-01-01";
    document.getElementById("sliderSettingsRetention").value = settings.targetRetentionBase || 0.9;
    document.getElementById("lblSettingsRetentionVal").textContent = `${Math.round((settings.targetRetentionBase || 0.9) * 100)}%`;
    document.getElementById("inpSettingsDailyBudget").value = settings.dailyTimeBudgetMins || 90;
    document.getElementById("lblThetaLogic").textContent = Number(settings.thetaLogic || 1.0).toFixed(3);
    document.getElementById("lblThetaRote").textContent = Number(settings.thetaRote || 1.0).toFixed(3);

    const totalApplied = Number(settings.totalClockShiftDays) || 0;
    const lblTotalShift = document.getElementById("lblTotalClockShiftDays");
    if (lblTotalShift) {
      lblTotalShift.textContent = `${totalApplied > 0 ? '+' : ''}${totalApplied} Day${Math.abs(totalApplied) === 1 ? '' : 's'}`;
    }
    const inpShiftDays = document.getElementById("inpClockShiftDays");
    if (inpShiftDays) inpShiftDays.value = "";

    openModal(el.modalSettings);
  }

  // -------------------------------------------------------------
  // MODAL 5: CHAPTER DETAIL CONTROLLER
  // -------------------------------------------------------------
  function openChapterDetailModal(chapterId) {
    selectedDetailChapterId = chapterId;
    const state = DSRStore.getState();
    const ch = state.chapters.find((c) => c.id === chapterId);
    if (!ch) return;

    document.getElementById("detailChapterTitle").textContent = ch.name;

    const { R, elapsedDays } = DSREngine.getRetrievability(ch, state.settings, Date.now());
    const tier = DSREngine.getSessionTier(ch.S, R, !!ch.isSubtopic, ch.tauEWMA, ch.D0);
    const nextInterval = DSREngine.calculateNextIntervalDays(ch, state.settings, Date.now());

    document.getElementById("chapterTelemetryStats").innerHTML = `
      <div class="preview-row">
        <span>Current Retrievability R(t):</span>
        <strong class="mono" style="color: ${R >= 0.85 ? 'var(--emerald-retained)' : 'var(--amber-hazard)'};">${Math.round(R * 100)}% (${elapsedDays}d ago)</strong>
      </div>
      <div class="preview-row">
        <span>Memory Stability (S):</span>
        <strong class="mono">${ch.S} Days</strong>
      </div>
      <div class="preview-row">
        <span>Intrinsic Difficulty (D0 / D):</span>
        <strong class="mono">${ch.D0} / ${ch.D}</strong>
      </div>
      <div class="preview-row">
        <span>Predicted Pacing (EWMA):</span>
        <strong class="mono">${ch.tauEWMA ? (Math.round(ch.tauEWMA * 10) / 10) + ' min/prob' : '2.0 min/prob'} (base: ${ch.tauBaseline || '2.0'}m)</strong>
      </div>
      <div class="preview-row">
        <span>Session Tier:</span>
        <strong class="mono">${tier.name} (${tier.durationMins}m)</strong>
      </div>
      <div class="preview-row">
        <span>Silly Error Slip Rate:</span>
        <strong class="mono" style="color: ${ch.hazardIndex >= 0.15 ? '#F87171' : 'var(--text-main)'};">${Math.round(ch.hazardIndex * 100)}%</strong>
      </div>
      <div class="preview-row">
        <span>Lapses Incurred:</span>
        <strong class="mono" style="color: ${ch.lapses >= 3 ? '#F87171' : 'var(--text-main)'};">${ch.lapses || 0}</strong>
      </div>
      <div class="preview-row">
        <span>Next Spaced Interval:</span>
        <strong class="mono">${nextInterval} Days</strong>
      </div>
    `;

    const list = document.getElementById("detailFaultLineList");
    list.innerHTML = "";
    const vault = Array.isArray(ch.faultLineVault) ? ch.faultLineVault : [];
    document.getElementById("detailFaultLineCount").textContent = `${vault.length} Notes`;

    if (vault.length === 0) {
      list.innerHTML = `<span style="font-size: 11px; color: var(--text-dim); font-style: italic;">No red-pen traps logged for this topic yet.</span>`;
    } else {
      vault.forEach((fl) => {
        const item = document.createElement("div");
        item.style.background = "var(--bg-card)";
        item.style.border = "1px solid var(--border-subtle)";
        item.style.borderRadius = "var(--radius-sm)";
        item.style.padding = "6px 8px";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        const statusBadge = fl.graduated
          ? `<span style="color: #34D399; font-weight: 700; font-size: 10px;">🏆 Mastered</span>`
          : `<span class="mono" style="font-size: 10px; color: var(--amber-hazard);">Missed ${fl.missCount || 1}x · Streak ${fl.cleanStreak || 0}/2</span>`;

        item.innerHTML = `
          <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">${escapeHtml(fl.note)}</div>
          ${statusBadge}
        `;
        list.appendChild(item);
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

    // Direct Daily Time Budget Input (Requirement 1.B.1)
    if (el.inputDailyBudget) {
      const applyDailyBudget = () => {
        const val = Math.max(15, Math.min(480, Number(el.inputDailyBudget.value) || 90));
        DSRStore.setDailyTimeBudget(val);
        el.inputDailyBudget.value = val;
        renderDashboard();
        showToast(`Daily budget set to ${val} mins.`);
      };
      el.inputDailyBudget.addEventListener("change", applyDailyBudget);
      el.inputDailyBudget.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          el.inputDailyBudget.blur();
        }
      });
    }

    // Low-Energy Sprint Toggle (Requirement 4 & 5.3)
    if (el.btnSprintToggle) {
      el.btnSprintToggle.addEventListener("click", () => {
        isSprintModeActive = !isSprintModeActive;
        el.btnSprintToggle.classList.toggle("active", isSprintModeActive);
        showToast(isSprintModeActive ? "⚡ Sprint Mode Active: 10m Blank-Page recall enabled!" : "Standard Study Mode Active");
        renderDashboard();
      });
    }

    // Zero-Bloat Undo Button in Audit Ledger (Requirement 5.2)
    if (el.btnUndoLastAction) {
      el.btnUndoLastAction.addEventListener("click", () => {
        const res = DSRStore.undoLastAction();
        if (res.success) {
          showToast(`Reverted: ${res.actionLabel}`);
          renderCurrentView();
        } else {
          showToast(res.message || "No action to undo");
        }
      });
    }

    const btnClearAllAudit = document.getElementById("btnClearAllAudit");
    if (btnClearAllAudit) {
      btnClearAllAudit.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all records from the audit ledger?")) {
          DSRStore.clearAllAuditLogs();
          showToast("Cleared all audit records.", true);
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

    // Syllabus Search (Fix 1)
    if (el.syllabusSearchInput) {
      el.syllabusSearchInput.addEventListener("input", (e) => {
        syllabusSearchQuery = e.target.value;
        renderSyllabus();
      });
    }

    // Audit Search
    if (el.auditSearchInput) {
      el.auditSearchInput.addEventListener("input", (e) => {
        auditSearchQuery = e.target.value;
        renderAuditLedger();
      });
    }

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
          showToast("Data restored successfully!", true);
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
      const activeChaps = DSRStore.getActiveChapters(state.chapters);
      const firstId = activeChaps[0] ? activeChaps[0].id : null;
      if (!firstId) {
        showToast("No active chapters available. Add a chapter first.");
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
        showToast("Chapter deleted.", true);
      }
    });

    // Sub-modal initializers
    initAddChapterModal();
    initDividedChapterModal();
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
