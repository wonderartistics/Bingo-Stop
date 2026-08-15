/* ===========================================================
   Bingo Stop — offline local game logic
   Selectable board sizes: 25 / 50 / 75 numbers. Card layout can
   be Auto Shuffled (fully random placement across the whole grid,
   not locked to a column) or Manually Arranged by the player.
   The BINGO letters light up (green line) cumulatively for every
   completed line (row / column / diagonal), regardless of which
   line it was. 5 completed lines triggers an automatic WIN, which
   can still be overridden and marked as a LOSS.
   All data (results history) is stored in localStorage only.
=========================================================== */
(() => {
  "use strict";

  const APP_VERSION = "2026.BINGO.104.1";

  const STORAGE_HISTORY = "bingoStop_history_v1";
  const STORAGE_LASTPLAYER = "bingoStop_lastPlayer_v3";

  const LETTERS = ["B", "I", "N", "G", "O"];
  const POOL_SIZES = [25, 50, 75];
  const AUTO_WIN_LINES = 5;

  function colRangesForPool(pool) {
    const per = pool / 5;
    return LETTERS.map((_, i) => [i * per + 1, i * per + per]);
  }

  /* ---------------- State ---------------- */
  const state = {
    name: "",
    gender: "blue",
    poolSize: 75,          // 25 | 50 | 75
    colRanges: colRangesForPool(75),
    arrangeMode: "auto",    // auto | manual — how the card layout is built
    board: [],              // 25 cells, row-major: idx = row*5+col, {num, marked}
    mode: "manual",         // manual | auto — how numbers are marked/called
    drawnAuto: [],
    usedManual: new Set(),
    startedAt: null,
    completedLines: new Set(),   // keys like "row0","col3","diag0"
    autoWinFired: false,
    autoWinRecordId: null,
    // temporary state while building a card manually
    arrangeBoard: new Array(25).fill(null),
    arrangeSelectedIdx: null,
    arrangeReturnTo: "setup",   // setup | game
  };

  /* ---------------- Helpers ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function switchScreen(id) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    closeMenu();
  }

  function fmtDateTime(d = new Date()) {
    const date = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${date} · ${time}`;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function letterForNum(n) {
    for (let c = 0; c < 5; c++) {
      if (n >= state.colRanges[c][0] && n <= state.colRanges[c][1]) return LETTERS[c];
    }
    return "?";
  }

  /* ---------------- Setup screen ---------------- */
  function initGenderPicker() {
    const opts = $$(".gender-opt");
    opts.forEach((btn) => {
      btn.addEventListener("click", () => {
        opts.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.gender = btn.dataset.gender;
        document.body.setAttribute("data-theme", state.gender);
      });
    });
    opts[0].classList.add("active");
    document.body.setAttribute("data-theme", "blue");
  }

  function initBoardPicker() {
    const opts = $$(".board-opt");
    opts.forEach((btn) => {
      btn.addEventListener("click", () => {
        opts.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.poolSize = parseInt(btn.dataset.pool, 10);
        state.colRanges = colRangesForPool(state.poolSize);
      });
    });
    const match = opts.find((b) => parseInt(b.dataset.pool, 10) === state.poolSize);
    (match || opts[opts.length - 1]).classList.add("active");
  }

  function initArrangePicker() {
    const opts = $$(".arrange-opt");
    opts.forEach((btn) => {
      btn.addEventListener("click", () => {
        opts.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.arrangeMode = btn.dataset.arrange;
      });
    });
    const match = opts.find((b) => b.dataset.arrange === state.arrangeMode);
    (match || opts[0]).classList.add("active");
  }

  function loadLastPlayer() {
    try {
      const last = JSON.parse(localStorage.getItem(STORAGE_LASTPLAYER) || "null");
      if (last) {
        $("#playerName").value = last.name || "";
        if (last.gender) {
          state.gender = last.gender;
          document.body.setAttribute("data-theme", last.gender);
          $$(".gender-opt").forEach((b) => b.classList.toggle("active", b.dataset.gender === last.gender));
        }
        if (last.poolSize && POOL_SIZES.includes(last.poolSize)) {
          state.poolSize = last.poolSize;
          state.colRanges = colRangesForPool(last.poolSize);
          $$(".board-opt").forEach((b) => b.classList.toggle("active", parseInt(b.dataset.pool, 10) === last.poolSize));
        }
        if (last.arrangeMode === "auto" || last.arrangeMode === "manual") {
          state.arrangeMode = last.arrangeMode;
          $$(".arrange-opt").forEach((b) => b.classList.toggle("active", b.dataset.arrange === last.arrangeMode));
        }
      }
    } catch (e) { /* ignore */ }
  }

  function startGame() {
    const name = $("#playerName").value.trim();
    if (!name) {
      showToast("Please enter a player name");
      $("#playerName").focus();
      return;
    }
    state.name = name;
    localStorage.setItem(STORAGE_LASTPLAYER, JSON.stringify({
      name, gender: state.gender, poolSize: state.poolSize, arrangeMode: state.arrangeMode,
    }));

    renderBingoHeader();
    setupManualPad();
    updateHud();
    updateShuffleCardLabel();

    if (state.arrangeMode === "manual") {
      openArrangeScreen({ prefill: false, returnTo: "setup" });
    } else {
      generateBoard();
      switchScreen("#screen-game");
    }
  }

  /* ---------------- BINGO header ---------------- */
  function renderBingoHeader() {
    const header = $("#bingoHeader");
    header.innerHTML = "";
    LETTERS.forEach((letter, col) => {
      const span = document.createElement("div");
      span.className = "letter-box";
      span.dataset.col = col;
      span.textContent = letter;
      header.appendChild(span);
    });
  }

  // The BINGO letters are cut left-to-right for every completed line,
  // regardless of which row / column / diagonal actually completed it.
  function updateHeaderCut() {
    const cutCount = Math.min(state.completedLines.size, LETTERS.length);
    LETTERS.forEach((letter, col) => {
      const box = document.querySelector(`.letter-box[data-col="${col}"]`);
      if (!box) return;
      box.classList.toggle("cut", col < cutCount);
    });
  }

  /* ---------------- Board generation ---------------- */
  // Auto Shuffle: 25 unique numbers picked from the whole pool (1..poolSize)
  // and dropped into the 25 cells in fully random order — no column lock,
  // so the same number can land in any row/column from game to game.
  function generateBoard() {
    const pool = shuffle(Array.from({ length: state.poolSize }, (_, i) => i + 1));
    const chosen = shuffle(pool.slice(0, 25));
    state.board = chosen.map((num) => ({ num, marked: false }));
    resetBoardRuntimeState();
    renderBoard();
    updateHeaderCut();
    updateStats();
  }

  function resetBoardRuntimeState() {
    state.drawnAuto = [];
    state.usedManual = new Set();
    state.completedLines = new Set();
    state.autoWinFired = false;
    state.autoWinRecordId = null;
    hideAutoWinOverlay();
    setResultButtonsEnabled(true);
  }

  function renderBoard() {
    const board = $("#bingoBoard");
    board.innerHTML = "";
    state.board.forEach((cell, idx) => {
      const div = document.createElement("div");
      div.className = "cell" + (cell.marked ? " marked" : "");
      div.textContent = cell.num;
      div.dataset.idx = idx;
      div.addEventListener("click", () => toggleCell(idx));
      board.appendChild(div);
    });
  }

  function toggleCell(idx) {
    const cell = state.board[idx];
    cell.marked = !cell.marked;
    const el = document.querySelector(`.cell[data-idx="${idx}"]`);
    el.classList.toggle("marked", cell.marked);
    if (cell.marked) {
      el.classList.add("called-flash");
      setTimeout(() => el.classList.remove("called-flash"), 500);
    }
    if (state.mode === "manual") {
      const padBtn = document.querySelector(`.pad-num[data-num="${cell.num}"]`);
      if (padBtn) {
        if (cell.marked) { state.usedManual.add(cell.num); padBtn.classList.add("used"); }
        else { state.usedManual.delete(cell.num); padBtn.classList.remove("used"); }
      }
    }
    checkLines();
  }

  /* ---------------- Line / column / diagonal detection ---------------- */
  function checkLines() {
    const b = state.board;
    const lines = [];

    for (let r = 0; r < 5; r++) {
      lines.push({ key: `row${r}`, idxs: [0, 1, 2, 3, 4].map((c) => r * 5 + c) });
    }
    for (let c = 0; c < 5; c++) {
      lines.push({ key: `col${c}`, idxs: [0, 1, 2, 3, 4].map((r) => r * 5 + c), col: c });
    }
    lines.push({ key: "diag0", idxs: [0, 6, 12, 18, 24] });
    lines.push({ key: "diag1", idxs: [4, 8, 12, 16, 20] });

    const newlyCompleted = [];
    lines.forEach((line) => {
      const complete = line.idxs.every((i) => b[i].marked);
      if (complete && !state.completedLines.has(line.key)) {
        state.completedLines.add(line.key);
        newlyCompleted.push(line);
      } else if (!complete && state.completedLines.has(line.key)) {
        state.completedLines.delete(line.key);
      }
      line.idxs.forEach((i) => {
        const el = document.querySelector(`.cell[data-idx="${i}"]`);
        if (!el) return;
        el.classList.toggle("line-win", complete);
      });
    });

    // Every completed line lights up one more BINGO letter (green line),
    // left to right, independent of which specific line it was.
    updateHeaderCut();
    updateStats();

    if (newlyCompleted.length) {
      showToast(newlyCompleted.length > 1 ? "🟩 Multiple lines completed!" : "🟩 Line completed!");
    }

    if (state.completedLines.size >= AUTO_WIN_LINES && !state.autoWinFired) {
      triggerAutoWin();
    }
  }

  /* ---------------- Auto-win (5 lines completed) ---------------- */
  function triggerAutoWin() {
    state.autoWinFired = true;
    const entry = recordResult("win", { auto: true });
    state.autoWinRecordId = entry ? entry.id : null;
    setResultButtonsEnabled(false);
    showAutoWinOverlay();
  }

  function showAutoWinOverlay() {
    $("#autoWinOverlay").classList.add("show");
  }
  function hideAutoWinOverlay() {
    $("#autoWinOverlay").classList.remove("show");
  }

  function setResultButtonsEnabled(enabled) {
    $("#btnWin").disabled = !enabled;
    $("#btnLose").disabled = !enabled;
    $("#btnWin").style.opacity = enabled ? "1" : "0.5";
    $("#btnLose").style.opacity = enabled ? "1" : "0.5";
  }

  function overrideAutoWinToLoss() {
    if (!state.autoWinRecordId) { hideAutoWinOverlay(); return; }
    const list = getHistory();
    const idx = list.findIndex((item) => item.id === state.autoWinRecordId);
    if (idx !== -1) {
      list[idx].result = "lose";
      list[idx].overridden = true;
      saveHistory(list);
      showToast(`Result changed to LOSE for ${state.name}`);
    }
    hideAutoWinOverlay();
  }

  /* ---------------- Manual arrangement screen ---------------- */
  function openArrangeScreen(opts) {
    opts = opts || {};
    state.arrangeReturnTo = opts.returnTo || "setup";
    state.arrangeSelectedIdx = null;

    if (opts.prefill && state.board.length === 25) {
      state.arrangeBoard = state.board.map((c) => c.num);
    } else {
      state.arrangeBoard = new Array(25).fill(null);
    }

    renderArrangeBoard();
    renderArrangePad();
    updateArrangeProgress();
    switchScreen("#screen-arrange");
  }

  function renderArrangeBoard() {
    const board = $("#arrangeBoard");
    board.innerHTML = "";
    state.arrangeBoard.forEach((num, idx) => {
      const div = document.createElement("div");
      const filled = num !== null;
      div.className = "cell " + (filled ? "filled" : "empty") + (idx === state.arrangeSelectedIdx ? " selected" : "");
      div.textContent = filled ? num : "+";
      div.dataset.idx = idx;
      div.addEventListener("click", () => onArrangeCellClick(idx));
      board.appendChild(div);
    });
  }

  function renderArrangePad() {
    const pad = $("#arrangePad");
    pad.innerHTML = "";
    const used = new Set(state.arrangeBoard.filter((n) => n !== null));
    for (let n = 1; n <= state.poolSize; n++) {
      const btn = document.createElement("button");
      const isUsed = used.has(n);
      btn.className = "arrange-pad-num" + (isUsed ? " used" : "");
      btn.textContent = n;
      btn.dataset.num = n;
      btn.disabled = isUsed;
      btn.addEventListener("click", () => onArrangePadNumberClick(n));
      pad.appendChild(btn);
    }
  }

  function onArrangeCellClick(idx) {
    if (state.arrangeBoard[idx] !== null) {
      // filled cell: clear it and select it for a new number
      state.arrangeBoard[idx] = null;
      state.arrangeSelectedIdx = idx;
      renderArrangeBoard();
      renderArrangePad();
      updateArrangeProgress();
      return;
    }
    state.arrangeSelectedIdx = idx;
    renderArrangeBoard();
  }

  function firstEmptyArrangeIdx() {
    return state.arrangeBoard.findIndex((n) => n === null);
  }

  function onArrangePadNumberClick(num) {
    if (state.arrangeBoard.includes(num)) return; // already placed somewhere
    let targetIdx = state.arrangeSelectedIdx;
    if (targetIdx === null || state.arrangeBoard[targetIdx] !== null) {
      targetIdx = firstEmptyArrangeIdx();
    }
    if (targetIdx === -1 || targetIdx === null) {
      showToast("Card is already full");
      return;
    }
    state.arrangeBoard[targetIdx] = num;
    // auto-advance to the next empty cell for a faster flow
    state.arrangeSelectedIdx = firstEmptyArrangeIdx();
    renderArrangeBoard();
    renderArrangePad();
    updateArrangeProgress();
  }

  function updateArrangeProgress() {
    const filled = state.arrangeBoard.filter((n) => n !== null).length;
    $("#arrangeProgress").textContent = `${filled} / 25 placed`;
    $("#btnArrangeConfirm").disabled = filled !== 25;
  }

  function autoFillArrangeRemaining() {
    const used = new Set(state.arrangeBoard.filter((n) => n !== null));
    const available = shuffle(
      Array.from({ length: state.poolSize }, (_, i) => i + 1).filter((n) => !used.has(n))
    );
    state.arrangeBoard = state.arrangeBoard.map((n) => (n !== null ? n : available.shift()));
    state.arrangeSelectedIdx = null;
    renderArrangeBoard();
    renderArrangePad();
    updateArrangeProgress();
    showToast("Filled the rest randomly");
  }

  function clearArrangeAll() {
    state.arrangeBoard = new Array(25).fill(null);
    state.arrangeSelectedIdx = null;
    renderArrangeBoard();
    renderArrangePad();
    updateArrangeProgress();
  }

  function confirmArrangement() {
    if (state.arrangeBoard.some((n) => n === null)) {
      showToast("Fill all 25 cells first");
      return;
    }
    state.board = state.arrangeBoard.map((num) => ({ num, marked: false }));
    resetBoardRuntimeState();
    renderBoard();
    updateHeaderCut();
    updateStats();
    switchScreen("#screen-game");
    showToast(state.arrangeReturnTo === "game" ? "Card rearranged" : "Card ready — good luck!");
  }

  function updateShuffleCardLabel() {
    const icon = $("#shuffleIcon");
    const title = $("#shuffleTitle");
    const desc = $("#shuffleDesc");
    if (!icon || !title || !desc) return;
    if (state.arrangeMode === "manual") {
      icon.textContent = "✍️";
      title.textContent = "Manual Arrangement";
      desc.textContent = "Tap to rearrange your numbers by hand";
    } else {
      icon.textContent = "🎲";
      title.textContent = "Auto Shuffle";
      desc.textContent = "Tap to reshuffle your numbers into a brand new card";
    }
  }
  /* ---------------- Manual pad ---------------- */
  function setupManualPad() {
    const pad = $("#manualPad");
    pad.innerHTML = "";
    LETTERS.forEach((letter, col) => {
      const group = document.createElement("div");
      group.className = "pad-group";
      const label = document.createElement("span");
      label.className = "pad-group-label";
      label.textContent = letter;
      group.appendChild(label);

      const [lo, hi] = state.colRanges[col];
      const nums = document.createElement("div");
      nums.className = "pad-group-nums";
      for (let n = lo; n <= hi; n++) {
        const btn = document.createElement("button");
        btn.className = "pad-num";
        btn.textContent = n;
        btn.dataset.num = n;
        btn.addEventListener("click", () => {
          const isUsed = state.usedManual.has(n);
          if (isUsed) { state.usedManual.delete(n); btn.classList.remove("used"); }
          else { state.usedManual.add(n); btn.classList.add("used"); }
          state.board.forEach((cell, idx) => {
            if (cell.num === n) {
              cell.marked = !isUsed;
              const el = document.querySelector(`.cell[data-idx="${idx}"]`);
              el.classList.toggle("marked", cell.marked);
            }
          });
          checkLines();
        });
        nums.appendChild(btn);
      }
      group.appendChild(nums);
      pad.appendChild(group);
    });
  }

  /* ---------------- Auto shuffle / draw ---------------- */
  function drawNumber() {
    const remaining = [];
    for (let n = 1; n <= state.poolSize; n++) {
      if (!state.drawnAuto.includes(n)) remaining.push(n);
    }
    if (remaining.length === 0) {
      showToast("All numbers have been drawn");
      return;
    }
    const num = remaining[Math.floor(Math.random() * remaining.length)];
    state.drawnAuto.push(num);
    $("#autoNumber").textContent = `${letterForNum(num)}-${num}`;

    state.board.forEach((cell, idx) => {
      if (cell.num === num) {
        cell.marked = true;
        const el = document.querySelector(`.cell[data-idx="${idx}"]`);
        el.classList.add("marked", "called-flash");
        setTimeout(() => el.classList.remove("called-flash"), 500);
      }
    });
    checkLines();
  }

  function resetAutoDraw() {
    state.drawnAuto = [];
    $("#autoNumber").textContent = "--";
    showToast("Drawn numbers cleared");
  }

  /* ---------------- Mode switch ---------------- */
  function initModeSwitch() {
    $$(".seg-btn[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".seg-btn[data-mode]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.mode = btn.dataset.mode;
        $("#manualPanel").classList.toggle("hidden", state.mode !== "manual");
        $("#autoPanel").classList.toggle("hidden", state.mode !== "auto");
      });
    });
  }

  /* ---------------- Dashboard tabs (Call Numbers / Card Options) ---------------- */
  function initDashTabs() {
    $$(".seg-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".seg-btn[data-tab]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        $("#tabNumbers").classList.toggle("hidden", tab !== "numbers");
        $("#tabCard").classList.toggle("hidden", tab !== "card");
      });
    });
  }

  /* ---------------- Dashboard stats ---------------- */
  function updateStats() {
    const linesEl = $("#statLines");
    const markedEl = $("#statMarked");
    const poolEl = $("#statPool");
    if (linesEl) linesEl.textContent = `${Math.min(state.completedLines.size, AUTO_WIN_LINES)}/${AUTO_WIN_LINES}`;
    if (markedEl) markedEl.textContent = `${state.board.filter((c) => c.marked).length}/25`;
    if (poolEl) poolEl.textContent = `${state.poolSize}-No`;
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    $("#hudName").textContent = state.name;
    $("#avatarInitial").textContent = state.name.trim().charAt(0).toUpperCase() || "P";
    state.startedAt = new Date();
    $("#hudTime").textContent = fmtDateTime(state.startedAt);
  }

  /* ---------------- Menu sheet ---------------- */
  function toggleMenu() { $("#menuSheet").classList.toggle("open"); }
  function closeMenu() { $("#menuSheet").classList.remove("open"); }

  /* ---------------- Results / history ---------------- */
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]"); }
    catch (e) { return []; }
  }
  function saveHistory(list) {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list));
  }

  function recordResult(result, opts) {
    opts = opts || {};
    const list = getHistory();
    const markedCount = state.board.filter((c) => c.marked).length;
    const entry = {
      id: `r_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      name: state.name,
      gender: state.gender,
      poolSize: state.poolSize,
      mode: state.mode,
      result,
      markedCount,
      linesCompleted: state.completedLines.size,
      auto: !!opts.auto,
      date: new Date().toISOString(),
    };
    list.unshift(entry);
    saveHistory(list);
    if (!opts.auto) {
      showToast(result === "win" ? `🏆 Recorded WIN for ${state.name}` : `Recorded loss for ${state.name}`);
    }
    return entry;
  }

  function renderHistory() {
    const list = getHistory();
    const container = $("#historyList");
    container.innerHTML = "";
    $("#historyEmpty").classList.toggle("hidden", list.length !== 0);
    list.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";
      const d = new Date(item.date);
      const pool = item.poolSize || 75;
      const tag = item.overridden ? " · overridden" : (item.auto ? " · auto-win" : "");
      row.innerHTML = `
        <div class="history-info">
          <span class="history-name">${escapeHtml(item.name)}</span>
          <span class="history-time">${fmtDateTime(d)} · ${pool}-No · ${item.mode === "auto" ? "Auto" : "Manual"} · ${item.linesCompleted || 0} line(s)${tag}</span>
        </div>
        <span class="history-badge ${item.result === "win" ? "badge-win" : "badge-lose"}">${item.result === "win" ? "Win" : "Lose"}</span>
      `;
      container.appendChild(row);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- Splash screen ---------------- */
  function initSplashScreen() {
    const splash = $("#splashScreen");
    if (!splash) return;
    const MIN_SPLASH_MS = 3500; // ~3.5s branded splash with credit
    setTimeout(() => {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 700);
    }, MIN_SPLASH_MS);
  }

  /* ---------------- Event wiring ---------------- */
  function init() {
    initSplashScreen();
    const versionText = `v${APP_VERSION}`;
    const splashV = $("#splashVersion");
    const setupV = $("#setupVersion");
    if (splashV) splashV.textContent = versionText;
    if (setupV) setupV.textContent = versionText;

    initGenderPicker();
    initBoardPicker();
    initArrangePicker();
    loadLastPlayer();
    initModeSwitch();
    initDashTabs();

    $("#btnStart").addEventListener("click", startGame);
    $("#btnHistory").addEventListener("click", () => { renderHistory(); switchScreen("#screen-history"); });

    $("#btnMenu").addEventListener("click", toggleMenu);
    $("#btnNewCard").addEventListener("click", () => {
      closeMenu();
      if (state.arrangeMode === "manual") {
        openArrangeScreen({ prefill: false, returnTo: "game" });
      } else {
        generateBoard();
        showToast("New card generated");
      }
    });
    $("#btnResetMarks").addEventListener("click", () => {
      state.board.forEach((c) => { c.marked = false; });
      state.usedManual.clear();
      state.drawnAuto = [];
      state.completedLines = new Set();
      state.autoWinFired = false;
      state.autoWinRecordId = null;
      hideAutoWinOverlay();
      setResultButtonsEnabled(true);
      $("#autoNumber").textContent = "--";
      renderBoard();
      setupManualPad();
      updateHeaderCut();
      updateStats();
      showToast("Marks cleared");
      closeMenu();
    });
    $("#btnGoHistory").addEventListener("click", () => { renderHistory(); switchScreen("#screen-history"); });
    $("#btnGoSetup").addEventListener("click", () => switchScreen("#screen-setup"));

    $("#btnShuffle").addEventListener("click", () => {
      if (state.arrangeMode === "manual") {
        openArrangeScreen({ prefill: true, returnTo: "game" });
        return;
      }
      generateBoard();
      const shuffleCard = $("#btnShuffle");
      const board = $("#bingoBoard");
      shuffleCard.classList.remove("spin");
      board.classList.remove("reshuffling");
      void shuffleCard.offsetWidth; // restart animation
      shuffleCard.classList.add("spin");
      board.classList.add("reshuffling");
      setTimeout(() => {
        shuffleCard.classList.remove("spin");
        board.classList.remove("reshuffling");
      }, 550);
      showToast("Card reshuffled");
    });
    $("#btnDraw").addEventListener("click", drawNumber);
    $("#btnAutoReset").addEventListener("click", resetAutoDraw);

    $("#btnArrangeBack").addEventListener("click", () => {
      switchScreen(state.arrangeReturnTo === "game" ? "#screen-game" : "#screen-setup");
    });
    $("#btnArrangeAutoFill").addEventListener("click", autoFillArrangeRemaining);
    $("#btnArrangeClear").addEventListener("click", clearArrangeAll);
    $("#btnArrangeConfirm").addEventListener("click", confirmArrangement);

    $("#btnWin").addEventListener("click", () => {
      if (state.autoWinFired) return;
      recordResult("win");
      setResultButtonsEnabled(false);
    });
    $("#btnLose").addEventListener("click", () => {
      if (state.autoWinFired) return;
      recordResult("lose");
      setResultButtonsEnabled(false);
    });

    $("#btnAutoWinKeep").addEventListener("click", () => {
      hideAutoWinOverlay();
      showToast(`🏆 WIN kept for ${state.name}`);
    });
    $("#btnAutoWinOverride").addEventListener("click", overrideAutoWinToLoss);

    $("#btnBackFromHistory").addEventListener("click", () => switchScreen("#screen-setup"));
    $("#btnClearHistory").addEventListener("click", () => {
      if (confirm("Clear all saved results on this device?")) {
        saveHistory([]);
        renderHistory();
        showToast("History cleared");
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#menuSheet") && !e.target.closest("#btnMenu")) closeMenu();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
