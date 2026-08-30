(async () => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  if (root == null) return;

  const phone = root.querySelector(".ma-letter-phone");
  const inbox = root.querySelector(".ma-report-inbox");
  const inboxOpen = root.querySelector(".ma-report-inbox-open");
  const reportScreen = root.querySelector(".ma-report-screen");
  const reportClose = root.querySelector(".ma-report-close");
  const reportPaperInner = root.querySelector(".ma-report-paper-inner");
  const reportProgress = root.querySelector("[data-report-progress]");
  const reportPinAction = root.querySelector(".ma-report-pin-action");
  const timelineBoard = root.querySelector(".ma-timeline-board");
  const boardScroll = root.querySelector(".ma-board-scroll");
  const boardHome = root.querySelector(".ma-board-home");
  const boardNote = root.querySelector(".ma-board-note");
  const boardDots = root.querySelector("[data-board-dots]");
  const boardPageCount = root.querySelector("[data-board-page-count]");
  const boardGuide = root.querySelector(".ma-board-guide");
  const firstBoardGuide = root.querySelector("[data-board-first-guide]");
  const boardStay = root.querySelector("[data-board-stay]");
  const boardEnter = root.querySelector("[data-board-enter]");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  const params = new URL(window.location.href).searchParams;
  const uid = API && API.getUserId ? API.getUserId() : null;
  const overlayEvent = "makeagain:board-overlay-change";
  if (
    phone == null ||
    inbox == null ||
    inboxOpen == null ||
    reportScreen == null ||
    reportClose == null ||
    reportPaperInner == null ||
    reportProgress == null ||
    reportPinAction == null ||
    timelineBoard == null ||
    boardScroll == null ||
    boardHome == null ||
    boardNote == null ||
    boardDots == null ||
    boardPageCount == null ||
    boardGuide == null ||
    firstBoardGuide == null ||
    boardStay == null ||
    boardEnter == null ||
    shared == null ||
    state == null
  ) return;
  await state.ready();
  const guard = state.activeGuard({ requireLetter:true });
  if (!guard.allowed) {
    window.location.replace(guard.redirect);
    return;
  }

  let boardTimer = null;
  let boardDragStartX = null;
  let boardDragScrollLeft = 0;
  let boardMoved = false;
  let boardScrollFrame = null;
  let firstGuideTimer = null;

  const requestOverlay = (name) => {
    root.dispatchEvent(new CustomEvent(overlayEvent, { detail: { name } }));
  };

  const clearBoardTimer = () => {
    if (boardTimer != null) window.clearTimeout(boardTimer);
    if (firstGuideTimer != null) window.clearTimeout(firstGuideTimer);
    boardTimer = null;
    firstGuideTimer = null;
  };

  const markBoardGuideSeen = () => {
    state.updateCurrentJourney((journey) => { journey.boardIntroSeen = true; });
  };

  const hasSeenBoardGuide = () => {
    return state.getCurrentJourney()?.boardIntroSeen === true;
  };

  const hideFirstBoardGuide = (markSeen = true) => {
    if (markSeen) markBoardGuideSeen();
    firstBoardGuide.hidden = true;
    if (root.dataset.boardOverlay === "first-guide") requestOverlay("none");
  };

  const showFirstBoardGuide = () => {
    if (hasSeenBoardGuide() && params.get("guide") !== "1") return;
    requestOverlay("first-guide");
    firstBoardGuide.hidden = false;
    if (!shared.reducedMotion()) firstBoardGuide.animate(
      [{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0)" }],
      { duration: 620, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" }
    );
  };

  const setState = (state) => {
    if (state !== "board") requestOverlay("none");
    phone.dataset.transitionState = state;
    const reportReady = state === "report-reading" || state === "report-pinning" || state === "board" || state === "report-reopen";
    const boardReady = state === "board";
    inbox.hidden = state !== "report-inbox";
    inbox.setAttribute("aria-hidden", String(state !== "report-inbox"));
    reportScreen.setAttribute("aria-hidden", String(!reportReady));
    timelineBoard.setAttribute("aria-hidden", String(!boardReady));
  };

  const updateReportProgress = () => {
    const distance = reportPaperInner.scrollHeight - reportPaperInner.clientHeight;
    const progress = distance <= 0 ? 1 : Math.min(1, Math.max(0, reportPaperInner.scrollTop / distance));
    reportProgress.style.transform = "scaleX(" + String(progress) + ")";
  };

  const visibleBoardPages = () => Array.from(root.querySelectorAll(".ma-board-page")).filter((page) => !page.hidden);

  const updateBoardPagination = () => {
    const pages = visibleBoardPages();
    const pageWidth = boardScroll.clientWidth || 1;
    const index = Math.min(Math.max(Math.round(boardScroll.scrollLeft / pageWidth), 0), Math.max(0, pages.length - 1));
    if (boardDots.childElementCount !== pages.length) {
      boardDots.replaceChildren(...pages.map((page, pageIndex) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", "查看第 " + String(pageIndex + 1) + " 页");
        dot.addEventListener("click", () => boardScroll.scrollTo({ left: pageIndex * boardScroll.clientWidth, behavior: shared.reducedMotion() ? "auto" : "smooth" }));
        return dot;
      }));
    }
    Array.from(boardDots.children).forEach((dot, dotIndex) => {
      dot.dataset.active = String(dotIndex === index);
      dot.setAttribute("aria-current", dotIndex === index ? "page" : "false");
    });
    boardPageCount.textContent = pages.length === 0 ? "0 / 0" : String(index + 1) + " / " + String(pages.length);
    boardGuide.hidden = pages.length <= 1;
  };

  const openReport = () => {
    if (phone.dataset.transitionState !== "report-inbox") return;
    clearBoardTimer();
    reportPaperInner.scrollTop = 0;
    setState("report-reading");
    window.requestAnimationFrame(updateReportProgress);
    shared.setStatus("004 初次报告 · 已打开 · 可上下滑动阅读");
  };

  const pinReport = () => {
    if (phone.dataset.transitionState !== "report-reading") return;
    clearBoardTimer();
    setState("report-pinning");
    state.updateCurrentJourney((journey) => { journey.firstReportStatus = "pinned"; });
    state.updateAccount((account) => { account.onboarding.completedAt ||= new Date().toISOString(); });
    if (uid && API && API.enterMain) API.enterMain(uid).catch(() => {});
    shared.setStatus("004 · 已确认报告 · 同一张纸正在收进时间看板");
    boardTimer = window.setTimeout(() => {
      boardTimer = null;
      setState("board");
      boardScroll.scrollLeft = 0;
      shared.setStatus("004 时间看板 · 一页一个时间物件 · 左右滑动切换");
      boardScroll.focus({ preventScroll: true });
      updateBoardPagination();
      firstGuideTimer = window.setTimeout(() => {
        firstGuideTimer = null;
        showFirstBoardGuide();
      }, shared.reducedMotion() ? 0 : 280);
    }, shared.reducedMotion() ? 40 : 640);
  };

  const reopenReport = () => {
    if (phone.dataset.transitionState !== "board") return;
    clearBoardTimer();
    reportPaperInner.scrollTop = 0;
    setState("report-reopen");
    window.requestAnimationFrame(updateReportProgress);
    shared.setStatus("004 · 已从看板重新打开完整报告 · 关闭后回到看板");
  };

  const closeReopenedReport = () => {
    if (phone.dataset.transitionState !== "report-reopen") return;
    setState("board");
    shared.setStatus("004 时间看板 · 报告已收回 · 可再次点击查看");
  };

  const snapBoardPage = () => {
    const pageWidth = boardScroll.clientWidth;
    if (pageWidth > 0) boardScroll.scrollTo({ left: Math.round(boardScroll.scrollLeft / pageWidth) * pageWidth, behavior: shared.reducedMotion() ? "auto" : "smooth" });
    boardDragStartX = null;
  };

  inboxOpen.addEventListener("click", openReport);
  reportPaperInner.addEventListener("scroll", updateReportProgress, { passive: true });
  reportPinAction.addEventListener("click", pinReport);
  reportClose.addEventListener("click", closeReopenedReport);
  boardNote.addEventListener("click", () => {
    if (boardMoved) return;
    reopenReport();
  });
  boardHome.addEventListener("click", () => {
    if (phone.dataset.transitionState !== "board") return;
    if (!firstBoardGuide.hidden) hideFirstBoardGuide();
    shared.nextPage("005-home.html?from=board", {
      exitState: "board-home",
      delay: 280,
      status: "时间看板正在退后 · 回到首页",
    });
  });

  boardScroll.addEventListener("wheel", (event) => {
    if (phone.dataset.transitionState !== "board") return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    boardScroll.scrollLeft += event.deltaY;
  }, { passive: false });
  boardScroll.addEventListener("scroll", () => {
    if (boardScrollFrame != null) return;
    boardScrollFrame = window.requestAnimationFrame(() => {
      boardScrollFrame = null;
      updateBoardPagination();
    });
  }, { passive: true });
  boardScroll.addEventListener("pointerdown", (event) => {
    if (phone.dataset.transitionState !== "board") return;
    boardDragStartX = event.clientX;
    boardDragScrollLeft = boardScroll.scrollLeft;
    boardMoved = false;
    try {
      boardScroll.setPointerCapture(event.pointerId);
    } catch (error) {
      // Native touch scrolling remains available.
    }
  });
  boardScroll.addEventListener("pointermove", (event) => {
    if (boardDragStartX == null) return;
    if (Math.abs(event.clientX - boardDragStartX) > 8) boardMoved = true;
    boardScroll.scrollLeft = boardDragScrollLeft - (event.clientX - boardDragStartX);
  });
  boardScroll.addEventListener("pointerup", () => {
    snapBoardPage();
    window.setTimeout(() => { boardMoved = false; }, 0);
  });
  boardScroll.addEventListener("pointercancel", () => {
    boardDragStartX = null;
  });

  boardStay.addEventListener("click", () => hideFirstBoardGuide());
  boardEnter.addEventListener("click", () => {
    hideFirstBoardGuide();
    state.updateCurrentJourney((journey) => { journey.homeIntroSeen = true; });
    state.updateAccount((account) => { account.onboarding.completedAt ||= new Date().toISOString(); });
    if (uid && API && API.enterMain) API.enterMain(uid).catch(() => {});
    shared.nextPage("005-home.html?from=board-intro", {
      exitState: "board-home",
      delay: 280,
      status: "第一次相识已经收好 · 进入主界面",
    });
  });

  document.addEventListener("makeagain:board-items", updateBoardPagination);

  const currentJourney = state.getCurrentJourney();
  // 真实初始报告:调 /initial-report,替换报告纸与看板首卡;未生成/失败时保持中性加载态。
  const applyReport = (report) => {
    if (!report) return;
    const reportTitle = root.querySelector(".ma-report-paper h2");
    const reportKeywords = root.querySelector(".ma-report-keywords");
    const reportParagraphs = root.querySelectorAll(".ma-report-body p");
    const reportQuote = root.querySelector(".ma-report-paper blockquote");
    const noteTitle = root.querySelector(".ma-board-note-title");
    const noteKeywords = root.querySelector(".ma-board-note-keywords");
    const noteCopies = root.querySelectorAll(".ma-board-note-copy");
    const noteQuote = root.querySelector(".ma-board-note-quote");
    if (reportTitle && report.title) reportTitle.textContent = report.title;
    if (noteTitle && report.title) noteTitle.textContent = report.title;
    const words = Array.isArray(report.keywords) && report.keywords.length ? report.keywords : [];
    if (reportKeywords) {
      if (words.length) reportKeywords.replaceChildren(...words.map((word) => {
        const span = document.createElement("span");
        span.textContent = word;
        return span;
      }));
      else reportKeywords.replaceChildren();
    }
    if (noteKeywords) {
      if (words.length) noteKeywords.replaceChildren(...words.map((word) => {
        const i = document.createElement("i");
        i.textContent = word;
        return i;
      }));
      else noteKeywords.replaceChildren();
    }
    const summary = report.summary || "";
    const narrative = report.relationship_analysis && report.relationship_analysis.narrative;
    if (reportParagraphs[0]) {
      if (summary) reportParagraphs[0].textContent = summary;
      else reportParagraphs[0].hidden = true;
    }
    if (reportParagraphs[1]) {
      if (narrative) { reportParagraphs[1].textContent = narrative; reportParagraphs[1].hidden = false; }
      else reportParagraphs[1].hidden = true;
    }
    if (noteCopies[0]) {
      if (summary) noteCopies[0].textContent = summary;
      else noteCopies[0].hidden = true;
    }
    if (noteCopies[1]) {
      if (narrative) noteCopies[1].textContent = narrative;
      else noteCopies[1].hidden = true;
    }
    if (reportQuote && report.quote) { reportQuote.textContent = "“" + report.quote + "”"; reportQuote.hidden = false; }
    if (noteQuote && report.quote) noteQuote.textContent = "“" + report.quote + "”";
  };
  const showReportLoading = () => {
    const reportTitle = root.querySelector(".ma-report-paper h2");
    const reportKeywords = root.querySelector(".ma-report-keywords");
    const reportParagraphs = root.querySelectorAll(".ma-report-body p");
    const reportQuote = root.querySelector(".ma-report-paper blockquote");
    if (reportTitle) reportTitle.textContent = "初次见面后的记录";
    if (reportKeywords) reportKeywords.replaceChildren();
    if (reportParagraphs[0]) { reportParagraphs[0].textContent = "报告还在整理中，稍后会在这里呈现。"; reportParagraphs[0].hidden = false; }
    if (reportParagraphs[1]) reportParagraphs[1].hidden = true;
    if (reportQuote) reportQuote.hidden = true;
  };
  if (uid && API && API.initialReport) {
    API.initialReport(uid).then((report) => {
      if (report && (report.title || report.summary)) applyReport(report);
      else showReportLoading();
    }).catch(() => showReportLoading());
  }
  const initialState = currentJourney?.firstReportStatus === "pinned" ? "board" : currentJourney?.firstLetterStatus === "opened" ? "report-reading" : "report-inbox";
  setState(initialState);
  if (initialState === "report-reading") window.requestAnimationFrame(updateReportProgress);
  if (initialState === "board") boardScroll.scrollLeft = 0;
  window.setTimeout(updateBoardPagination, 0);
})();
