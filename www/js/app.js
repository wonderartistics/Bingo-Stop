/* ===========================================================
   Bingo Stop — offline local game logic
   Classic 75-ball style board: columns B-I-N-G-O, no FREE space.
   All data (results history) is stored in localStorage only.
=========================================================== */
(() => {
  "use strict";

  const STORAGE_HISTORY = "bingoStop_history_v1";
  const STORAGE_LASTPLAYER = "bingoStop_lastPlayer_v2";

  const LETTERS = ["B", "I", "N", "G", "O"];
  const COL_RANGES = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  /* ---------------- State ---------------- */
  const state = {
    name: "",
    gender: "blue",
    board: [],            // 25 cells, row-major: idx = row*5+col, {num, marked, col}
    mode: "manual",        // manual | auto
    drawnAuto: [],
    usedManual: new Set(),
    startedAt: null,
    completedLines: new Set(),  // keys like "row0","col3","diag0"
    completedCols: new Set(),   // 0..4 -> letter fully marked
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
      if (n >= COL_RANGES[c][0] && n <= COL_RANGES[c][1]) return LETTERS[c];
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
    localStorage.setItem(STORAGE_LASTPLAYER, JSON.stringify({ name, gender: state.gender }));

    renderBingoHeader();
    generateBoard();
    setupManualPad();
    updateHud();
    switchScreen("#screen-game");
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

  function updateHeaderCut() {
    LETTERS.forEach((letter, col) => {
      const box = document.querySelector(`.letter-box[data-col="${col}"]`);
      if (!box) return;
      box.classList.toggle("cut", state.completedCols.has(col));
    });
  }

  /* ---------------- Board generation ---------------- */
  function generateBoard() {
    state.board = [];
    // build 5 shuffled columns from their own number range (5 numbers each)
    const columns = COL_RANGES.map(([lo, hi]) => {
      const pool = shuffle(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
      return pool.slice(0, 5);
    });
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        state.board.push({ num: columns[col][row], marked: false, col });
      }
    }
    state.drawnAuto = [];
    state.usedManual = new Set();
    state.completedLines = new Set();
    state.completedCols = new Set();
    renderBoard();
    updateHeaderCut();
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

    // recompute which columns are fully complete (for the BINGO letter cut)
    state.completedCols = new Set();
    for (let c = 0; c < 5; c++) {
      const idxs = [0, 1, 2, 3, 4].map((r) => r * 5 + c);
      if (idxs.every((i) => b[i].marked)) state.completedCols.add(c);
    }
    updateHeaderCut();

    if (newlyCompleted.length) {
      showToast(newlyCompleted.length > 1 ? "🟩 Multiple lines completed!" : "🟩 Line completed!");
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

      const [lo, hi] = COL_RANGES[col];
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
    for (let n = 1; n <= 75; n++) {
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
    $$(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.mode = btn.dataset.mode;
        $("#manualPanel").classList.toggle("hidden", state.mode !== "manual");
        $("#autoPanel").classList.toggle("hidden", state.mode !== "auto");
      });
    });
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

  function recordResult(result) {
    const list = getHistory();
    const markedCount = state.board.filter((c) => c.marked).length;
    list.unshift({
      name: state.name,
      gender: state.gender,
      mode: state.mode,
      result,
      markedCount,
      linesCompleted: state.completedLines.size,
      date: new Date().toISOString(),
    });
    saveHistory(list);
    showToast(result === "win" ? `🏆 Recorded WIN for ${state.name}` : `Recorded loss for ${state.name}`);
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
      row.innerHTML = `
        <div class="history-info">
          <span class="history-name">${escapeHtml(item.name)}</span>
          <span class="history-time">${fmtDateTime(d)} · ${item.mode === "auto" ? "Auto" : "Manual"} · ${item.linesCompleted || 0} line(s)</span>
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

  /* ---------------- Event wiring ---------------- */
  function init() {
    initGenderPicker();
    loadLastPlayer();
    initModeSwitch();

    $("#btnStart").addEventListener("click", startGame);
    $("#btnHistory").addEventListener("click", () => { renderHistory(); switchScreen("#screen-history"); });

    $("#btnMenu").addEventListener("click", toggleMenu);
    $("#btnNewCard").addEventListener("click", () => { generateBoard(); showToast("New card generated"); closeMenu(); });
    $("#btnResetMarks").addEventListener("click", () => {
      state.board.forEach((c) => { c.marked = false; });
      state.usedManual.clear();
      state.drawnAuto = [];
      state.completedLines = new Set();
      state.completedCols = new Set();
      $("#autoNumber").textContent = "--";
      renderBoard();
      setupManualPad();
      updateHeaderCut();
      showToast("Marks cleared");
      closeMenu();
    });
    $("#btnGoHistory").addEventListener("click", () => { renderHistory(); switchScreen("#screen-history"); });
    $("#btnGoSetup").addEventListener("click", () => switchScreen("#screen-setup"));

    $("#btnShuffle").addEventListener("click", () => { generateBoard(); showToast("Card shuffled"); });
    $("#btnDraw").addEventListener("click", drawNumber);
    $("#btnAutoReset").addEventListener("click", resetAutoDraw);

    $("#btnWin").addEventListener("click", () => recordResult("win"));
    $("#btnLose").addEventListener("click", () => recordResult("lose"));

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
