/* ===========================================================
   Bingo Stop — offline local game logic
   All data (results history) is stored in localStorage only.
=========================================================== */
(() => {
  "use strict";

  const STORAGE_HISTORY = "bingoStop_history_v1";
  const STORAGE_LASTPLAYER = "bingoStop_lastPlayer_v1";

  /* ---------------- State ---------------- */
  const state = {
    name: "",
    gender: "blue",
    range: 25,
    board: [],          // array of {num, marked, free}
    mode: "manual",      // manual | auto
    drawnAuto: [],
    usedManual: new Set(),
    startedAt: null,
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
    // default select blue
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
        if (last.range) $("#numRange").value = String(last.range);
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
    state.range = parseInt($("#numRange").value, 10);
    localStorage.setItem(STORAGE_LASTPLAYER, JSON.stringify({ name, gender: state.gender, range: state.range }));

    generateBoard();
    setupManualPad();
    updateHud();
    switchScreen("#screen-game");
  }

  /* ---------------- Board generation ---------------- */
  function generateBoard() {
    const pool = shuffle(Array.from({ length: state.range }, (_, i) => i + 1));
    const picks = pool.slice(0, 24); // 24 + 1 free = 25
    state.board = [];
    let p = 0;
    for (let i = 0; i < 25; i++) {
      if (i === 12) {
        state.board.push({ num: null, marked: true, free: true });
      } else {
        state.board.push({ num: picks[p++], marked: false, free: false });
      }
    }
    state.drawnAuto = [];
    state.usedManual = new Set();
    renderBoard();
  }

  function renderBoard() {
    const board = $("#bingoBoard");
    board.innerHTML = "";
    state.board.forEach((cell, idx) => {
      const div = document.createElement("div");
      div.className = "cell" + (cell.free ? " free" : "") + (cell.marked ? " marked" : "");
      div.textContent = cell.free ? "FREE" : cell.num;
      div.dataset.idx = idx;
      div.addEventListener("click", () => toggleCell(idx));
      board.appendChild(div);
    });
  }

  function toggleCell(idx) {
    const cell = state.board[idx];
    if (cell.free) return;
    cell.marked = !cell.marked;
    const el = document.querySelector(`.cell[data-idx="${idx}"]`);
    el.classList.toggle("marked", cell.marked);
    if (cell.marked) {
      el.classList.add("called-flash");
      setTimeout(() => el.classList.remove("called-flash"), 500);
    }
    // reflect in manual pad if manual mode
    if (state.mode === "manual") {
      const padBtn = document.querySelector(`.pad-num[data-num="${cell.num}"]`);
      if (padBtn) {
        if (cell.marked) { state.usedManual.add(cell.num); padBtn.classList.add("used"); }
        else { state.usedManual.delete(cell.num); padBtn.classList.remove("used"); }
      }
    }
  }

  /* ---------------- Manual pad ---------------- */
  function setupManualPad() {
    const pad = $("#manualPad");
    pad.innerHTML = "";
    for (let n = 1; n <= state.range; n++) {
      const btn = document.createElement("button");
      btn.className = "pad-num";
      btn.textContent = n;
      btn.dataset.num = n;
      btn.addEventListener("click", () => {
        const isUsed = state.usedManual.has(n);
        if (isUsed) { state.usedManual.delete(n); btn.classList.remove("used"); }
        else { state.usedManual.add(n); btn.classList.add("used"); }
        // mark matching cell(s) on board
        state.board.forEach((cell, idx) => {
          if (!cell.free && cell.num === n) {
            cell.marked = !isUsed;
            const el = document.querySelector(`.cell[data-idx="${idx}"]`);
            el.classList.toggle("marked", cell.marked);
          }
        });
      });
      pad.appendChild(btn);
    }
  }

  /* ---------------- Auto shuffle / draw ---------------- */
  function drawNumber() {
    const remaining = [];
    for (let n = 1; n <= state.range; n++) {
      if (!state.drawnAuto.includes(n)) remaining.push(n);
    }
    if (remaining.length === 0) {
      showToast("All numbers have been drawn");
      return;
    }
    const num = remaining[Math.floor(Math.random() * remaining.length)];
    state.drawnAuto.push(num);
    $("#autoNumber").textContent = num;

    // auto-mark matching board cell
    state.board.forEach((cell, idx) => {
      if (!cell.free && cell.num === num) {
        cell.marked = true;
        const el = document.querySelector(`.cell[data-idx="${idx}"]`);
        el.classList.add("marked", "called-flash");
        setTimeout(() => el.classList.remove("called-flash"), 500);
      }
    });
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
    const markedCount = state.board.filter((c) => c.marked && !c.free).length;
    list.unshift({
      name: state.name,
      gender: state.gender,
      range: state.range,
      mode: state.mode,
      result,
      markedCount,
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
          <span class="history-time">${fmtDateTime(d)} · 1–${item.range} · ${item.mode === "auto" ? "Auto" : "Manual"}</span>
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
      state.board.forEach((c) => { if (!c.free) c.marked = false; });
      state.usedManual.clear();
      state.drawnAuto = [];
      $("#autoNumber").textContent = "--";
      renderBoard();
      setupManualPad();
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
