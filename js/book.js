// ============================================
// BOOK READING VIEW — the core story engine
// ============================================

const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");

let book = null;      // full row from Supabase
let bookData = null;  // the parsed `data` jsonb (characters, chapters, etc.)
let currentChapterIdx = 0;
let currentEpisodeIdx = 0;
let currentPageIdx = 0;
let viewPageIdx = 0;   // which page is on screen right now — usually equals
                        // currentPageIdx, but moves independently while the
                        // reader is browsing back through earlier pages
let isBusy = false;

const MAX_RETRIES = 5;
let pendingVariants = [];   // [{ page, result, vitalDelta }] for the turn currently being previewed
let pendingVariantIndex = 0;
let lastTurnContext = null; // { turnText, isCustom, inventoryActions }

// -------- inventory item usage state --------
const MAX_INVENTORY_SELECTION = 5;
let pendingInventorySelection = {}; // name -> { qty, action, emoji, singleUse }
let activeInventoryActions = [];    // confirmed selection, queued for the NEXT turn taken

// -------- vitals decay (per in-story hour) --------
// Hunger/Fatigue drain passively as story-time passes. Health/Hygiene only
// move when the AI reports a specific vitalChanges event (injury, bathing,
// eating, resting, etc.) — they don't passively decay on their own.
const VITAL_DECAY_PER_HOUR = { hunger: 4, fatigue: 5, health: 0, hygiene: 2 };
const VITAL_CRISIS_THRESHOLD = 15;
const VITAL_RECOVER_THRESHOLD = 30; // re-arms the crisis once it climbs back above this

const titleEl = document.getElementById("book-title");
const pageTextEl = document.getElementById("page-text");
const turnOptionsEl = document.getElementById("turn-options");
const customInput = document.getElementById("custom-turn-input");
const customBtn = document.getElementById("custom-turn-btn");
const lastTurnNoteEl = document.getElementById("page-last-turn");
const redoTurnRowEl = document.getElementById("redo-turn-row");
const redoTurnBtn = document.getElementById("redo-turn-btn");
const statusEl = document.getElementById("turn-status");
const inventoryListEl = document.getElementById("inventory-list");
const inventoryCountEl = document.getElementById("inventory-count");
const coinsCountEl = document.getElementById("coins-count");
const backBtn = document.getElementById("back-btn");
const retryControlsEl = document.getElementById("retry-controls");
const retryPrevBtn = document.getElementById("retry-prev-btn");
const retryNextBtn = document.getElementById("retry-next-btn");
const retryGenBtn = document.getElementById("retry-gen-btn");
const retryLabelEl = document.getElementById("retry-label");
const savedIndicatorEl = document.getElementById("saved-indicator");
const customTurnRowEl = document.querySelector(".custom-turn-row");

// new elements — page browsing footer
const pagePrevBtn = document.getElementById("page-prev-btn");
const pageNextBtn = document.getElementById("page-next-btn");
const pageCounterEl = document.getElementById("page-counter");

// new elements — behavior modal
const behaviorBtn = document.getElementById("behavior-btn");
const behaviorBackdrop = document.getElementById("behavior-backdrop");
const behaviorTextarea = document.getElementById("behavior-textarea");
const behaviorCloseBtn = document.getElementById("behavior-close-btn");
const behaviorSaveBtn = document.getElementById("behavior-save-btn");

// new elements — vitals panel
const toggleVitalsBtn = document.getElementById("toggle-vitals");
const vitalsPanelEl = document.getElementById("vitals-panel");
const vitalHungerEl = document.getElementById("vital-hunger");
const vitalFatigueEl = document.getElementById("vital-fatigue");
const vitalHealthEl = document.getElementById("vital-health");
const vitalHygieneEl = document.getElementById("vital-hygiene");

// new elements — relationships panel
const toggleRelationshipsBtn = document.getElementById("toggle-relationships");
const relationshipsPanelEl = document.getElementById("relationships-panel");
const relationshipsListEl = document.getElementById("relationships-list");
const relPublicViewEl = document.getElementById("rel-public-view");
const relPublicViewValueEl = document.getElementById("rel-public-view-value");

// new elements — inventory usage
const toggleInventoryBtn = document.getElementById("toggle-inventory");
const inventoryPanelEl = document.getElementById("inventory-panel");
const invCountBadgeEl = document.getElementById("inv-count-badge");
const invCountPopoverEl = document.getElementById("inv-count-popover");
const invConfirmBtn = document.getElementById("inv-confirm-btn");
const invCancelBtn = document.getElementById("inv-cancel-btn");
const invPendingNoteEl = document.getElementById("inv-pending-note");

const mapBtn = document.getElementById("map-btn");

backBtn.addEventListener("click", () => { window.location.href = "index.html"; });

if (mapBtn) {
  mapBtn.addEventListener("click", () => {
    window.location.href = `map.html?id=${bookId}`;
  });
}

if (toggleInventoryBtn && inventoryPanelEl) {
  toggleInventoryBtn.addEventListener("click", () => {
    inventoryPanelEl.classList.toggle("show");
    if (vitalsPanelEl) vitalsPanelEl.classList.remove("show");
    if (relationshipsPanelEl) relationshipsPanelEl.classList.remove("show");
  });
}

if (toggleVitalsBtn && vitalsPanelEl) {
  toggleVitalsBtn.addEventListener("click", () => {
    vitalsPanelEl.classList.toggle("show");
    if (inventoryPanelEl) inventoryPanelEl.classList.remove("show");
    if (relationshipsPanelEl) relationshipsPanelEl.classList.remove("show");
  });
}

if (toggleRelationshipsBtn && relationshipsPanelEl) {
  toggleRelationshipsBtn.addEventListener("click", () => {
    relationshipsPanelEl.classList.toggle("show");
    if (inventoryPanelEl) inventoryPanelEl.classList.remove("show");
    if (vitalsPanelEl) vitalsPanelEl.classList.remove("show");
  });
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }

  // Wire up settings immediately — must never depend on the book below
  // loading successfully, or a data hiccup silently breaks the gear button.
  initSettingsModal();
  initBehaviorModal();

  if (!bookId) {
    pageTextEl.textContent = "No book was specified.";
    return;
  }

  try {
    const { data, error } = await supabase.from("books").select("*").eq("id", bookId).single();
    if (error || !data) {
      pageTextEl.textContent = "Couldn't find this book.";
      console.error(error);
      return;
    }

    book = data;
    bookData = book.data;

    // Defensive defaults for books created before these features existed,
    // or if a field was somehow left out — never let a missing key throw
    // and blank the whole page.
    if (!bookData.protagonist) bookData.protagonist = {};
    if (!Array.isArray(bookData.inventory)) bookData.inventory = [];
    if (!bookData.vitals) {
      bookData.vitals = { enabled: false, hunger: 100, fatigue: 100, health: 100, hygiene: 100 };
    }
    bookData.vitals._critical = bookData.vitals._critical || {};
    if (!Array.isArray(bookData.characters)) bookData.characters = [];
    if (typeof bookData.publicView !== "string") bookData.publicView = "";
    // Older books may still have the pre-slider stat shape (0-100, with
    // separate fear/hatred/jealousy keys) — normalize to the new
    // -100..100 three-axis shape so the panel and prompt don't choke on it.
    bookData.characters.forEach((c) => {
      if (typeof c.platonic !== "boolean") c.platonic = false;
      const s = c.stats || {};
      c.stats = {
        love: clampNum(Math.round((s.love ?? 0) - (s.hatred ?? 0)), -100, 100),
        trust: clampNum(Math.round((s.trust ?? 0) - (s.jealousy ?? 0)), -100, 100),
        loyalty: clampNum(Math.round(s.loyalty ?? 0), -100, 100)
      };
    });

    titleEl.textContent = book.title;
    applyVisualStudioSettings();

    if (!bookData.vitals.enabled) {
      if (toggleVitalsBtn) toggleVitalsBtn.style.display = "none";
    }

    // Resume progress if we have it, else start at the very first page
    if (bookData.progress) {
      currentChapterIdx = bookData.progress.chapterIdx || 0;
      currentEpisodeIdx = bookData.progress.episodeIdx || 0;
      currentPageIdx = bookData.progress.pageIdx || 0;
    }
    viewPageIdx = currentPageIdx;

    renderCurrentPage();
    renderSidePanels();
  } catch (err) {
    console.error(err);
    pageTextEl.textContent = "Something went wrong loading this book. Your settings still work — try reopening from the library.";
  }
}

function currentPages() {
  return bookData.chapters[currentChapterIdx].episodes[currentEpisodeIdx].pages;
}

function currentPage() {
  return currentPages()[currentPageIdx];
}

function applyVisualStudioSettings() {
  const design = book.design || {};
  const cover = book.cover_config || {};
  const pageEl = document.querySelector(".page");

  if (design.paperColor) {
    pageEl.style.background = design.paperColor;
  }

  const fontMap = {
    lora: "var(--font-body)",
    fraunces: "var(--font-display)",
    serif: "Georgia, 'Times New Roman', serif"
  };
  if (design.textTheme && fontMap[design.textTheme]) {
    pageEl.style.fontFamily = fontMap[design.textTheme];
  }

  if (design.borderStyle === "sharp") {
    pageEl.style.borderRadius = "0";
  } else if (design.borderStyle === "ornate") {
    pageEl.style.border = `3px double ${cover.accent || "var(--gold)"}`;
  }

  if (cover.accent) {
    document.documentElement.style.setProperty("--gold-bright", cover.accent);
  }
}
function isLatestPage() {
  return viewPageIdx === currentPages().length - 1;
}

function renderCurrentPage(animate = false) {
  const page = currentPages()[viewPageIdx];
  const wrap = pageTextEl.parentElement;

  const doRender = () => {
    const divider = book.design?.dividerStyle;
    const showDivider = divider && viewPageIdx > 0;
    const bodyHtml = colorizeDialogue(page.text, page.dialogue, bookData.characters || []);
    pageTextEl.innerHTML = showDivider
      ? `<div class="page__divider">${escapeHtml(divider)}</div>${bodyHtml}`
      : bodyHtml;
    renderLastTurnNote(page);
    wrap.classList.remove("turning");
  };

  if (animate) {
    wrap.classList.add("turning");
    setTimeout(doRender, 380);
  } else {
    doRender();
  }

  const latest = isLatestPage();
  turnOptionsEl.style.display = latest ? "" : "none";
  if (customTurnRowEl) customTurnRowEl.style.display = latest ? "" : "none";
  renderTurnOptions(latest ? (page.turnOptions || []) : []);
  renderRetryControls();
  renderPageNav();
  renderRedoRow();
}

// -------- dialogue coloring --------
// Wraps quoted lines the AI told us a named character spoke (see the
// "dialogue" field in the JSON schema below) in a colored span using that
// character's chosen dialogueColor. Falls back to plain escaped text for
// anything it can't confidently match — never guesses.
function colorizeDialogue(rawText, dialogueEntries, characters) {
  if (!dialogueEntries || !dialogueEntries.length || !characters.length) {
    return escapeHtml(rawText);
  }

  const segments = [];
  dialogueEntries.forEach((entry) => {
    if (!entry || !entry.line || !entry.speaker) return;
    const character = characters.find(
      (c) => c.name && c.name.toLowerCase() === String(entry.speaker).toLowerCase()
    );
    if (!character) return;
    const idx = rawText.indexOf(entry.line);
    if (idx === -1) return; // AI didn't quote verbatim — skip rather than mis-highlight
    segments.push({ start: idx, end: idx + entry.line.length, color: character.dialogueColor || "#8a5cf6", name: character.name });
  });

  if (!segments.length) return escapeHtml(rawText);

  // Sort and drop any overlapping segments, keeping the earliest.
  segments.sort((a, b) => a.start - b.start);
  const clean = [];
  let lastEnd = -1;
  segments.forEach((seg) => {
    if (seg.start >= lastEnd) { clean.push(seg); lastEnd = seg.end; }
  });

  let html = "";
  let cursor = 0;
  clean.forEach((seg) => {
    html += escapeHtml(rawText.slice(cursor, seg.start));
    html += `<span class="dialogue-color" style="color:${seg.color}" title="${escapeHtml(seg.name)}">${escapeHtml(rawText.slice(seg.start, seg.end))}</span>`;
    cursor = seg.end;
  });
  html += escapeHtml(rawText.slice(cursor));
  return html;
}

// -------- "your last turn" note at the top of the page --------
function renderLastTurnNote(page) {
  if (!lastTurnNoteEl) return;
  const turn = page && page.turnTaken;
  if (!turn || !turn.text) {
    lastTurnNoteEl.style.display = "none";
    lastTurnNoteEl.textContent = "";
    return;
  }
  lastTurnNoteEl.style.display = "";
  lastTurnNoteEl.textContent = `You: ${turn.text}`;
}

// -------- redo last turn --------
function renderRedoRow() {
  if (!redoTurnRowEl) return;
  const page = currentPages()[viewPageIdx];
  const show = !isBusy && isLatestPage() && page && !page.basePage && page.turnTaken;
  redoTurnRowEl.style.display = show ? "" : "none";
}

if (redoTurnBtn) {
  redoTurnBtn.addEventListener("click", () => {
    if (isBusy) return;
    const pages = currentPages();
    const page = pages[pages.length - 1];
    if (!page || page.basePage || !page.turnTaken) return;

    // Best-effort undo of this page's side effects — only possible while
    // the in-memory variant data from generating it is still around (i.e.
    // the reader hasn't navigated away since). If it's gone, we still let
    // them rewrite the text, we just can't safely unwind stat/inventory
    // changes from it.
    if (pendingVariants.length && pendingVariants[pendingVariantIndex] && pendingVariants[pendingVariantIndex].page === page) {
      revertSideEffects(pendingVariants[pendingVariantIndex]);
    }
    pendingVariants = [];
    pendingVariantIndex = 0;

    pages.pop();
    currentPageIdx = pages.length - 1;
    viewPageIdx = currentPageIdx;

    customInput.value = page.turnTaken.text;
    if (window.autoGrowTextarea) window.autoGrowTextarea(customInput);
    customInput.focus();

    renderCurrentPage();
    renderSidePanels();
    clearStatus();
    saveProgress();
  });
}

// -------- page browsing (read-only trip through pages already written) --------
function renderPageNav() {
  if (!pageCounterEl) return;
  pageCounterEl.textContent = `pg. ${viewPageIdx + 1}`;
  pagePrevBtn.disabled = isBusy || viewPageIdx <= 0;
  pageNextBtn.disabled = isBusy;
}

function navigatePage(delta) {
  if (isBusy) return;
  const pages = currentPages();

  if (delta > 0 && viewPageIdx >= pages.length - 1) {
    showStatus("You're already on the newest page — choose a turn below to keep going.");
    return;
  }

  const target = viewPageIdx + delta;
  if (target < 0 || target >= pages.length) return;

  clearStatus();
  viewPageIdx = target;
  renderCurrentPage(true);
}

if (pagePrevBtn) pagePrevBtn.addEventListener("click", () => navigatePage(-1));
if (pageNextBtn) pageNextBtn.addEventListener("click", () => navigatePage(1));

function renderTurnOptions(options) {
  turnOptionsEl.innerHTML = "";
  if (!options || options.length === 0) {
    // No AI-generated options yet (e.g. base page) — just let them write freely
    return;
  }
  const symbol = (book.design && book.design.turnSymbol) ? book.design.turnSymbol + " " : "";
  options.forEach((opt) => {
    // Options may be plain strings, or objects { text, successChance } when
    // the success-rate calculator is turned on.
    const isObj = typeof opt === "object" && opt !== null;
    const text = isObj ? opt.text : opt;
    const btn = document.createElement("button");
    btn.className = "turn-option";
    btn.type = "button";
    btn.innerHTML = isObj && typeof opt.successChance === "number"
      ? `${symbol}${escapeHtml(text)}<span class="turn-option__odds">${opt.successChance}% success</span>`
      : `${symbol}${escapeHtml(text)}`;
    btn.addEventListener("click", () => takeTurn(text));
    turnOptionsEl.appendChild(btn);
  });
}

function renderSidePanels() {
  coinsCountEl.textContent = bookData.coins ?? 0;
  const inv = bookData.inventory || [];
  inventoryCountEl.textContent = inv.reduce((sum, i) => sum + (i.qty || 1), 0);
  renderInventoryList();
  renderVitalsPanel();
  renderRelationshipsPanel();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function clampNum(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ============================================
// BEHAVIOR MODAL
// ============================================
function initBehaviorModal() {
  if (!behaviorBtn || !behaviorBackdrop || !behaviorTextarea || !behaviorCloseBtn || !behaviorSaveBtn) {
    // Page doesn't have this markup (or an id typo) — fail quietly and
    // visibly in the console instead of throwing and killing other setup.
    console.warn("Behavior modal elements missing — skipping wiring.");
    return;
  }

  behaviorBtn.addEventListener("click", () => {
    behaviorTextarea.value = (bookData && bookData.protagonist && bookData.protagonist.behavior) || "";
    behaviorBackdrop.classList.add("show");
  });

  behaviorCloseBtn.addEventListener("click", () => behaviorBackdrop.classList.remove("show"));
  behaviorBackdrop.addEventListener("click", (e) => {
    if (e.target === behaviorBackdrop) behaviorBackdrop.classList.remove("show");
  });

  behaviorSaveBtn.addEventListener("click", async () => {
    if (!bookData) return;
    bookData.protagonist = bookData.protagonist || {};
    bookData.protagonist.behavior = behaviorTextarea.value.trim();
    behaviorSaveBtn.disabled = true;
    behaviorSaveBtn.textContent = "Saving…";
    await saveProgress();
    behaviorSaveBtn.disabled = false;
    behaviorSaveBtn.textContent = "Save";
    behaviorBackdrop.classList.remove("show");
  });
}

// ============================================
// VITALS
// ============================================
function renderVitalsPanel() {
  if (!vitalHungerEl || !bookData.vitals || !bookData.vitals.enabled) return;
  setVitalDisplay(vitalHungerEl, bookData.vitals.hunger);
  setVitalDisplay(vitalFatigueEl, bookData.vitals.fatigue);
  setVitalDisplay(vitalHealthEl, bookData.vitals.health);
  setVitalDisplay(vitalHygieneEl, bookData.vitals.hygiene);
}

function setVitalDisplay(el, value) {
  if (!el) return;
  const rounded = Math.round(value);
  el.textContent = `${rounded}%`;
  el.classList.toggle("vital-low", rounded <= VITAL_CRISIS_THRESHOLD);
}

// ============================================
// RELATIONSHIPS
// ============================================
// Each axis is a single center-oriented slider, -100..100, 0 = neutral.
const REL_AXES = [
  { key: "love", negLabel: "Hate", posLabel: "Love" },
  { key: "trust", negLabel: "Jealousy", posLabel: "Trust" },
  { key: "loyalty", negLabel: "Betrayal", posLabel: "Loyalty" }
];

function renderRelationshipsPanel() {
  const characters = bookData.characters || [];

  if (toggleRelationshipsBtn) {
    toggleRelationshipsBtn.style.display = characters.length ? "" : "none";
  }

  if (bookData.publicView) {
    relPublicViewEl.style.display = "";
    relPublicViewValueEl.textContent = bookData.publicView;
  } else if (relPublicViewEl) {
    relPublicViewEl.style.display = "none";
  }

  if (!relationshipsListEl) return;
  relationshipsListEl.innerHTML = "";

  if (!characters.length) {
    relationshipsListEl.innerHTML = `<div class="inv-empty">No characters in this story yet.</div>`;
    return;
  }

  characters.forEach((c) => {
    const card = document.createElement("div");
    card.className = "rel-card";

    const header = document.createElement("div");
    header.className = "rel-card__header";
    header.innerHTML = `
      <span class="rel-card__dot" style="background:${c.dialogueColor || "#8a5cf6"}"></span>
      <span class="rel-card__name">${escapeHtml(c.name)}</span>
      ${c.platonic ? `<span class="rel-card__badge">platonic only</span>` : ""}
    `;
    card.appendChild(header);

    REL_AXES.forEach((axis) => {
      const value = clampNum((c.stats && c.stats[axis.key]) ?? 0, -100, 100);
      const row = document.createElement("div");
      row.className = "rel-track-row";

      const labels = document.createElement("div");
      labels.className = "rel-track-row__labels";
      labels.innerHTML = `<span>${axis.negLabel}</span><span class="rel-track-row__value">${value > 0 ? "+" : ""}${value}</span><span>${axis.posLabel}</span>`;
      row.appendChild(labels);

      const track = document.createElement("div");
      track.className = "rel-track";
      const fill = document.createElement("div");
      fill.className = `rel-track__fill ${value >= 0 ? "rel-track__fill--pos" : "rel-track__fill--neg"}`;
      const leftPct = 50 + (Math.min(0, value) / 100) * 50;
      const widthPct = Math.abs(value) / 100 * 50;
      fill.style.left = `${leftPct}%`;
      fill.style.width = `${widthPct}%`;
      track.appendChild(fill);
      const mid = document.createElement("div");
      mid.className = "rel-track__mid";
      track.appendChild(mid);
      row.appendChild(track);

      card.appendChild(row);
    });

    relationshipsListEl.appendChild(card);
  });
}

function computeVitalDelta(result, hoursPassed) {
  const delta = {};
  ["hunger", "fatigue", "health", "hygiene"].forEach((k) => {
    const change = (result.vitalChanges && typeof result.vitalChanges[k] === "number") ? result.vitalChanges[k] : 0;
    delta[k] = change - (VITAL_DECAY_PER_HOUR[k] || 0) * hoursPassed;
  });
  return delta;
}

// Checks for a vital crossing into crisis territory. Only meant to run once
// per *real* turn (not per retry) — returns a short narration snippet to
// tack onto the page, and directly applies the "lose some belongings" penalty.
function checkVitalCrises() {
  if (!bookData.vitals || !bookData.vitals.enabled) return null;
  bookData.vitals._critical = bookData.vitals._critical || {};

  const labels = { hunger: "hunger", fatigue: "exhaustion", health: "your injuries", hygiene: "how unwashed you've gotten" };
  let triggeredKey = null;

  for (const k of ["hunger", "fatigue", "health", "hygiene"]) {
    const val = bookData.vitals[k];
    if (val <= VITAL_CRISIS_THRESHOLD && !bookData.vitals._critical[k]) {
      bookData.vitals._critical[k] = true;
      triggeredKey = k;
      break; // one crisis narrated at a time is plenty
    }
    if (val > VITAL_RECOVER_THRESHOLD) {
      bookData.vitals._critical[k] = false; // re-arm once recovered
    }
  }

  if (!triggeredKey) return null;

  // Penalty: lose 1-3 random inventory units and/or a chunk of currency.
  const lostBits = [];
  const pool = (bookData.inventory || []).filter(i => (i.qty || 0) > 0).slice();
  const lossCount = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
  for (let i = 0; i < lossCount && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const item = pool[idx];
    pool.splice(idx, 1);
    const real = bookData.inventory.find(x => x.name === item.name);
    if (!real || (real.qty || 0) <= 0) continue;
    real.qty -= 1;
    lostBits.push(`${real.emoji || ""} ${real.name}`.trim());
  }
  bookData.inventory = (bookData.inventory || []).filter(i => (i.qty || 0) > 0);

  let coinsLost = 0;
  if ((bookData.coins || 0) > 0) {
    coinsLost = Math.max(0, Math.round(bookData.coins * (0.1 + Math.random() * 0.2)));
    bookData.coins = Math.max(0, bookData.coins - coinsLost);
  }

  const currencyName = (bookData.keywords && bookData.keywords.currency && bookData.keywords.currency.name) || "coins";
  const lossParts = [];
  if (lostBits.length) lossParts.push(`you lose ${lostBits.join(", ")} from your bag`);
  if (coinsLost > 0) lossParts.push(`${coinsLost} ${currencyName} go missing`);
  const lossText = lossParts.length ? ` While you're out, ${lossParts.join(" and ")}.` : "";

  return `\n\n*(Your ${labels[triggeredKey]} finally catches up with you and you collapse for a while.${lossText})*`;
}

// ============================================
// INVENTORY ITEM USAGE
// ============================================
function totalSelectedCount() {
  return Object.values(pendingInventorySelection).reduce((sum, s) => sum + s.qty, 0);
}

function renderInventoryList() {
  const inv = bookData.inventory || [];

  if (invCountBadgeEl) invCountBadgeEl.textContent = `${totalSelectedCount()}/${MAX_INVENTORY_SELECTION}`;

  if (!inventoryListEl) return;

  if (!inv.length) {
    inventoryListEl.innerHTML = "<li class='inv-empty'>Empty</li>";
    return;
  }

  inventoryListEl.innerHTML = "";
  inv.forEach((item) => {
    const sel = pendingInventorySelection[item.name];
    const li = document.createElement("li");
    li.className = "inv-item" + (sel ? " selected" : "");

    li.innerHTML = `
      <button type="button" class="inv-item__btn">
        <span class="inv-item__qty">${item.qty || 1}x</span>
        <span class="inv-item__name">${escapeHtml(item.name)}</span>
        <span class="inv-item__emoji">${item.emoji || ""}</span>
        ${sel ? `<span class="inv-item__selcount">using ${sel.qty}</span>` : ""}
      </button>
      ${sel ? `<textarea class="inv-item__action" placeholder="What do you do with it?">${escapeHtml(sel.action || "")}</textarea>` : ""}
    `;

    li.querySelector(".inv-item__btn").addEventListener("click", () => toggleInventorySelect(item));
    if (sel) {
      li.querySelector(".inv-item__action").addEventListener("input", (e) => {
        if (pendingInventorySelection[item.name]) {
          pendingInventorySelection[item.name].action = e.target.value;
        }
      });
    }
    inventoryListEl.appendChild(li);
  });
}

function toggleInventorySelect(item) {
  const existing = pendingInventorySelection[item.name];
  const already = existing ? existing.qty : 0;

  if (already >= (item.qty || 1)) {
    // Already selected every copy you own — tapping again clears the selection.
    delete pendingInventorySelection[item.name];
    renderInventoryList();
    return;
  }

  if (totalSelectedCount() >= MAX_INVENTORY_SELECTION) {
    showStatus("You can only use up to 5 items in one turn.");
    return;
  }

  if (!existing) {
    // singleUse defaults to true for older items created before this
    // feature existed (they were never marked reusable).
    pendingInventorySelection[item.name] = {
      qty: 1,
      action: "",
      emoji: item.emoji || "",
      singleUse: item.singleUse !== false
    };
  } else {
    existing.qty += 1;
  }
  renderInventoryList();
}

if (invCountBadgeEl) {
  invCountBadgeEl.addEventListener("click", () => {
    const entries = Object.entries(pendingInventorySelection);
    if (!entries.length || !invCountPopoverEl) return;
    invCountPopoverEl.innerHTML = entries
      .map(([name, s]) => `<div>${s.emoji || ""} ${escapeHtml(name)} — ${s.qty}</div>`)
      .join("");
    invCountPopoverEl.classList.toggle("show");
  });
}

if (invConfirmBtn) {
  invConfirmBtn.addEventListener("click", () => {
    const entries = Object.entries(pendingInventorySelection);
    if (entries.length) {
      activeInventoryActions = entries.map(([name, sel]) => ({
        name,
        qty: sel.qty,
        action: (sel.action || "").trim(),
        emoji: sel.emoji,
        singleUse: sel.singleUse
      }));
    }
    pendingInventorySelection = {};
    renderInventoryList();
    if (invCountPopoverEl) invCountPopoverEl.classList.remove("show");
    if (inventoryPanelEl) inventoryPanelEl.classList.remove("show");
    renderPendingInventoryNote();
  });
}

if (invCancelBtn) {
  invCancelBtn.addEventListener("click", () => {
    pendingInventorySelection = {};
    renderInventoryList();
    if (invCountPopoverEl) invCountPopoverEl.classList.remove("show");
    if (inventoryPanelEl) inventoryPanelEl.classList.remove("show");
  });
}

function renderPendingInventoryNote() {
  if (!invPendingNoteEl) return;
  if (!activeInventoryActions.length) {
    invPendingNoteEl.classList.remove("show");
    invPendingNoteEl.innerHTML = "";
    return;
  }
  const parts = activeInventoryActions.map(a =>
    `${a.emoji || ""} ${escapeHtml(a.name)}${a.qty > 1 ? ` ×${a.qty}` : ""}${a.action ? ` — ${escapeHtml(a.action)}` : ""}`
  );
  invPendingNoteEl.innerHTML = `🔖 Using this turn: ${parts.join("; ")} <button type="button" id="inv-clear-pending">✕</button>`;
  invPendingNoteEl.classList.add("show");
  document.getElementById("inv-clear-pending").addEventListener("click", () => {
    activeInventoryActions = [];
    renderPendingInventoryNote();
  });
}

// Only single-use (consumable) items actually lose quantity. Reusable
// items (tools/tech/key items) are used but stick around.
function consumeInventoryActions(actions) {
  if (!actions || !actions.length) return;
  actions.forEach((a) => {
    if (!a.singleUse) return;
    const item = (bookData.inventory || []).find(i => i.name === a.name);
    if (!item) return;
    item.qty = Math.max(0, (item.qty || 1) - a.qty);
  });
  bookData.inventory = (bookData.inventory || []).filter(i => (i.qty || 0) > 0);
}

// -------- taking a turn --------
customBtn.addEventListener("click", () => {
  const val = customInput.value.trim();
  if (val) {
    takeTurn(val, true);
    customInput.value = "";
    if (window.autoGrowTextarea) window.autoGrowTextarea(customInput);
  }
});

customInput.addEventListener("keydown", (e) => {
  // Enter submits like before; Shift+Enter drops a newline for anyone
  // writing a longer, multi-line turn.
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    customBtn.click();
  }
});

async function takeTurn(turnText, isCustom = false) {
  if (isBusy) return;

  const settings = getAISettings();
  if (!settings.apiKey) {
    showStatus("Add your AI API key in settings (⚙️) first.");
    return;
  }

  // Starting a fresh turn resets the retry/preview state
  pendingVariants = [];
  pendingVariantIndex = 0;
  lastTurnContext = { turnText, isCustom, inventoryActions: activeInventoryActions.slice() };

  await generateVariant(false);
}

async function generateVariant(isRetry) {
  if (isBusy) return;
  if (isRetry && pendingVariants.length >= MAX_RETRIES) return;

  const settings = getAISettings();
  isBusy = true;
  setControlsDisabled(true);
  showStatus(isRetry ? "Writing a different take…" : "The story is writing itself…");

  try {
    const prompt = buildTurnPrompt(lastTurnContext.turnText, lastTurnContext.isCustom, isRetry);
    const result = await callAI({
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user
    });

    const newPage = {
      id: crypto.randomUUID(),
      basePage: false,
      text: result.text,
      turnOptions: Array.isArray(result.options) ? result.options : [],
      dialogue: Array.isArray(result.dialogue) ? result.dialogue : [],
      turnTaken: { text: lastTurnContext.turnText, isCustom: lastTurnContext.isCustom }
    };

    // Revert whichever variant was previously active before switching to the new one
    if (pendingVariants.length > 0) {
      revertSideEffects(pendingVariants[pendingVariantIndex]);
    } else {
      // First generation for this turn — push a real new page
      currentPages().push(newPage);
      currentPageIdx = currentPages().length - 1;
    }

    const variant = { page: newPage, result, memoryPushed: false };
    pendingVariants.push(variant);
    pendingVariantIndex = pendingVariants.length - 1;

    applySideEffects(variant);

    // Vitals crisis + inventory consumption only happen once per *real*
    // turn — not on every retry, since retries are alternate takes of the
    // same moment, not additional time passing.
    if (!isRetry) {
      const crisisText = checkVitalCrises();
      if (crisisText) newPage.text += crisisText;
      consumeInventoryActions(lastTurnContext.inventoryActions);
      activeInventoryActions = [];
    }

    currentPages()[currentPageIdx] = newPage;

    bookData.progress = { chapterIdx: currentChapterIdx, episodeIdx: currentEpisodeIdx, pageIdx: currentPageIdx };
    viewPageIdx = currentPageIdx;

    renderCurrentPage(true);
    renderSidePanels();
    renderPendingInventoryNote();
    renderRetryControls();
    clearStatus();
    await saveProgress();
    maybeUpdateEpisodeSummary(); // fire-and-forget, non-blocking
  } catch (err) {
    showStatus(err.message || "Something went wrong reaching the AI.");
    console.error(err);
  } finally {
    isBusy = false;
    setControlsDisabled(false);
  }
}

function switchVariant(newIndex) {
  if (isBusy || newIndex < 0 || newIndex >= pendingVariants.length || newIndex === pendingVariantIndex) return;
  revertSideEffects(pendingVariants[pendingVariantIndex]);
  pendingVariantIndex = newIndex;
  const variant = pendingVariants[pendingVariantIndex];
  applySideEffects(variant);
  currentPages()[currentPageIdx] = variant.page;
  viewPageIdx = currentPageIdx;
  renderCurrentPage(true);
  renderSidePanels();
  renderRetryControls();
  saveProgress();
}

function applySideEffects(variant) {
  const result = variant.result;

  if (result.statChanges) {
    for (const [charName, changes] of Object.entries(result.statChanges)) {
      const character = (bookData.characters || []).find(c => c.name.toLowerCase() === charName.toLowerCase());
      if (!character) continue;
      character.stats = character.stats || { love: 0, trust: 0, loyalty: 0 };
      for (const [statName, delta] of Object.entries(changes)) {
        const current = character.stats[statName] ?? 0;
        character.stats[statName] = Math.max(-100, Math.min(100, current + delta));
      }
    }
  }

  // publicViewUpdate is a plain replacement (not a delta) — it's a snapshot
  // epithet, only stored when the AI actually sent a new one this turn.
  if (typeof result.publicViewUpdate === "string" && result.publicViewUpdate.trim()) {
    variant.prevPublicView = bookData.publicView || "";
    bookData.publicView = result.publicViewUpdate.trim();
  }

  if (Array.isArray(result.inventoryChanges)) {
    bookData.inventory = bookData.inventory || [];
    result.inventoryChanges.forEach((change) => {
      const existing = bookData.inventory.find(i => i.name.toLowerCase() === change.name.toLowerCase());
      if (existing) {
        existing.qty = Math.max(0, (existing.qty || 1) + (change.qtyDelta || 0));
      } else if ((change.qtyDelta || 0) > 0) {
        bookData.inventory.push({ name: change.name, emoji: change.emoji || "", qty: change.qtyDelta, category: "misc", singleUse: true });
      }
    });
    bookData.inventory = bookData.inventory.filter(i => (i.qty || 0) > 0);
  }

  if (typeof result.coinsDelta === "number") {
    bookData.coins = Math.max(0, (bookData.coins || 0) + result.coinsDelta);
  }

  if (bookData.vitals && bookData.vitals.enabled) {
    const hoursPassed = clampNum(typeof result.hoursPassed === "number" ? result.hoursPassed : 0.25, 0, 24);
    const delta = computeVitalDelta(result, hoursPassed);
    variant.vitalDelta = delta;
    ["hunger", "fatigue", "health", "hygiene"].forEach((k) => {
      bookData.vitals[k] = clampNum((bookData.vitals[k] ?? 100) + delta[k], 0, 100);
    });
  }

  if (result.memoryNote) {
    bookData.memoryNotes = bookData.memoryNotes || [];
    bookData.memoryNotes.push(result.memoryNote);
    variant.memoryPushed = true;
  }
}

function revertSideEffects(variant) {
  const result = variant.result;

  if (result.statChanges) {
    for (const [charName, changes] of Object.entries(result.statChanges)) {
      const character = (bookData.characters || []).find(c => c.name.toLowerCase() === charName.toLowerCase());
      if (!character) continue;
      for (const [statName, delta] of Object.entries(changes)) {
        const current = character.stats[statName] ?? 0;
        character.stats[statName] = Math.max(-100, Math.min(100, current - delta));
      }
    }
  }

  if (variant.prevPublicView !== undefined) {
    bookData.publicView = variant.prevPublicView;
  }

  if (Array.isArray(result.inventoryChanges)) {
    result.inventoryChanges.forEach((change) => {
      const existing = bookData.inventory.find(i => i.name.toLowerCase() === change.name.toLowerCase());
      if (existing) existing.qty = Math.max(0, (existing.qty || 1) - (change.qtyDelta || 0));
    });
    bookData.inventory = (bookData.inventory || []).filter(i => (i.qty || 0) > 0);
  }

  if (typeof result.coinsDelta === "number") {
    bookData.coins = Math.max(0, (bookData.coins || 0) - result.coinsDelta);
  }

  if (bookData.vitals && bookData.vitals.enabled && variant.vitalDelta) {
    ["hunger", "fatigue", "health", "hygiene"].forEach((k) => {
      bookData.vitals[k] = clampNum((bookData.vitals[k] ?? 100) - variant.vitalDelta[k], 0, 100);
    });
  }

  if (variant.memoryPushed) {
    const idx = bookData.memoryNotes.lastIndexOf(result.memoryNote);
    if (idx !== -1) bookData.memoryNotes.splice(idx, 1);
    variant.memoryPushed = false;
  }
}

function renderRetryControls() {
  if (pendingVariants.length === 0 || !isLatestPage()) {
    retryControlsEl.classList.remove("show");
    return;
  }
  retryControlsEl.classList.add("show");
  retryPrevBtn.disabled = pendingVariantIndex === 0;
  retryNextBtn.disabled = pendingVariantIndex === pendingVariants.length - 1;
  retryGenBtn.disabled = pendingVariants.length >= MAX_RETRIES;
  retryLabelEl.textContent = `Take ${pendingVariantIndex + 1} of ${pendingVariants.length}`;
  retryGenBtn.textContent = pendingVariants.length >= MAX_RETRIES
    ? "No retries left"
    : `🎲 Retry (${MAX_RETRIES - pendingVariants.length} left)`;
}

retryPrevBtn.addEventListener("click", () => switchVariant(pendingVariantIndex - 1));
retryNextBtn.addEventListener("click", () => switchVariant(pendingVariantIndex + 1));
retryGenBtn.addEventListener("click", () => generateVariant(true));

// swipe gesture support on the page itself
(function enableSwipe() {
  const wrap = document.querySelector(".page-wrap");
  let startX = null;
  wrap.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50 && pendingVariants.length > 1) {
      if (dx > 0) switchVariant(pendingVariantIndex - 1);
      else switchVariant(pendingVariantIndex + 1);
    }
    startX = null;
  });
})();

// -------- episode summaries (background, non-blocking) --------
async function maybeUpdateEpisodeSummary() {
  const episode = bookData.chapters[currentChapterIdx].episodes[currentEpisodeIdx];
  const pages = episode.pages;
  if (pages.length < 4 || pages.length % 4 !== 0) return;

  const settings = getAISettings();
  if (!settings.apiKey) return;

  try {
    const allText = pages.map(p => p.text).join("\n\n").slice(0, 6000);
    const result = await callAI({
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      systemPrompt: `Summarize this episode of an interactive story in 2-3 concise sentences for a chapter map overview. Respond with ONLY JSON: {"summary": "..."}`,
      userPrompt: allText
    });
    if (result.summary) {
      episode.summary = result.summary;
      await saveProgress();
    }
  } catch (err) {
    console.warn("Episode summary generation failed silently:", err);
  }
}

async function saveProgress() {
  const { error } = await supabase
    .from("books")
    .update({ data: bookData, updated_at: new Date().toISOString() })
    .eq("id", bookId);
  if (error) {
    console.error("Save failed:", error);
    showStatus("Couldn't save — check your connection.");
    return;
  }
  flashSaved();
}

function flashSaved() {
  savedIndicatorEl.classList.add("show");
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => savedIndicatorEl.classList.remove("show"), 1400);
}

// Note: saves already happen automatically after every generated turn and
// every retry/swipe (see saveProgress() calls above) — that's the real
// autosave safety net, since a page-unload save can't carry the auth
// headers Supabase requires anyway.

function buildTurnPrompt(turnText, isCustom, isRetry = false) {
  const identity = bookData.identity || {};
  const protagonist = bookData.protagonist || {};
  const persona = bookData.persona || {};
  const characters = bookData.characters || [];
  const world = bookData.world || book.world || {};
  const keywords = bookData.keywords || {};
  const choiceMechanics = bookData.choiceMechanics || { successRateEnabled: false, turnsPerPage: 3 };
  const recentText = currentPage().text;
  const memoryNotes = (bookData.memoryNotes || []).slice(-6).join("\n");
  const vitalsOn = !!(bookData.vitals && bookData.vitals.enabled);

  const perspectiveLine = {
    first: 'Write in first person ("I").',
    second: 'Write in second person ("You").',
    third: 'Write in third person ("They/He/She").'
  }[identity.perspective] || 'Write in second person ("You").';

  const directorLine = typeof identity.directorSlider === "number"
    ? `Balance action versus description at ${identity.directorSlider}/100 (0 = fast, action-heavy; 100 = slow, rich description).`
    : "";

  const optionsSchema = choiceMechanics.successRateEnabled
    ? `"options": [{ "text": "short choice", "successChance": number (0-100, based on the protagonist's stats and how risky the action is) }, ...]`
    : `"options": ["short choice", ...]`;

  const vitalsSchemaField = vitalsOn
    ? `,\n  "hoursPassed": number (how much in-story time this turn covers — 0.1 for a quick action, 1-4+ for travel, labor, or resting),\n  "vitalChanges": { "hunger": number, "fatigue": number, "health": number, "hygiene": number } (OPTIONAL deltas from things that happen this turn — eating restores hunger, a nap restores fatigue, an injury lowers health, bathing raises hygiene. Omit any that don't apply. Do NOT try to account for passive time drain here, that's handled separately.)`
    : "";

  const vitalsStatusLine = vitalsOn
    ? `\nCurrent vitals (100 = best, 0 = worst): Hunger ${Math.round(bookData.vitals.hunger)}%, Fatigue ${Math.round(bookData.vitals.fatigue)}%, Health ${Math.round(bookData.vitals.health)}%, Hygiene ${Math.round(bookData.vitals.hygiene)}%.`
    : "";

  const inventoryActions = (lastTurnContext && lastTurnContext.inventoryActions) || [];
  const inventoryActionsLine = inventoryActions.length
    ? `\nThe reader is also using these items as part of this turn:\n${inventoryActions.map(a => `- ${a.qty}x ${a.name}${a.action ? `: ${a.action}` : " (used, no specific description given)"}`).join("\n")}`
    : "";

  const system = `
You are the storyteller for a personal, private interactive fiction app. ${perspectiveLine} ${directorLine}
${identity.genre ? "Genre / tone: " + identity.genre + "." : ""}

You must always respond with ONLY a JSON object matching this exact shape, no markdown fences, no extra text:

{
  "plausible": boolean,
  "text": "the next page of story text (or a short redirect if not plausible)",
  "dialogue": [{ "speaker": "character name, exactly as listed below", "line": "the exact quoted sentence spoken, copied verbatim character-for-character from \\"text\\" including the quotation marks" }],
  ${optionsSchema},
  "statChanges": { "characterName": { "love": number, "trust": number, "loyalty": number } },
  "publicViewUpdate": "OPTIONAL — a short epithet (2-6 words) for how the world/cast now sees the protagonist, e.g. \\"a reckless daredevil\\" or \\"a quiet hermit\\". Only include this when the reader's recent choices have clearly shifted their reputation; omit otherwise.",
  "inventoryChanges": [{ "name": string, "emoji": string, "qtyDelta": number }],
  "coinsDelta": number${vitalsSchemaField},
  "memoryNote": "a short note (1 sentence) capturing where the story is headed or the reader's apparent taste, for future context"
}

Rules:
- "plausible" is false ONLY if the reader's turn genuinely breaks the established world/setting (e.g. a ray gun in a medieval setting) or the protagonist's stats can't support it (e.g. very low strength attempting to lift something enormous). If false, do not narrate the turn as having happened — instead write a brief in-world redirect and set "options" to fresh, fitting choices.
- Offer exactly ${choiceMechanics.turnsPerPage || 3} options.
- Only include characters/stats that actually change in "statChanges". Each of "love", "trust", and "loyalty" is a signed delta on a single center-oriented axis that runs -100 to 100 (0 = neutral, starting point). They are NOT independent stats — each is one slider with two opposite poles:
  - "love": negative deltas push toward hate, positive deltas push toward love.
  - "trust": negative deltas push toward jealousy, positive deltas push toward trust.
  - "loyalty": negative deltas push toward betrayal (this character turning on the protagonist), positive deltas push toward loyalty.
  Send a signed delta (e.g. -8 or +12), not an absolute value.
- Keep "text" to one page's worth of prose (roughly 120-220 words).
- Whenever a named character (not the protagonist) speaks in "text", add one entry to "dialogue" per spoken line: "speaker" must exactly match that character's name as listed below, and "line" must be copied verbatim, character-for-character, straight out of "text" (quotation marks included) so it can be located and colored for the reader. Do not paraphrase or retype it — copy it exactly. Skip narration and the protagonist's own speech. If nobody named speaks this turn, use an empty array.
- Never break character or mention that you are an AI.
- Always follow these "never-forget" rules no matter what: ${identity.neverForgetRules?.length ? identity.neverForgetRules.join("; ") : "(none set)"}
${protagonist.behavior ? `\nProtagonist's behavior & personality (CRITICAL — follow exactly): ${protagonist.behavior}` : ""}
- CRITICAL: only narrate actions, reactions, dialogue, or emotions for the protagonist that their turn explicitly states, or that clearly and directly follow from the behavior/personality described above. Never invent extra impulsive actions or emotional reactions for the protagonist beyond that — for example, if their turn was only to run away, don't also have them yell at or attack someone unless their turn or their stated behavior says they would.
${vitalsOn ? '- Always report "hoursPassed" honestly based on how much time the action would realistically take.' : ""}
- "publicViewUpdate" reflects the wider world's read on the protagonist based on their pattern of choices over time (not any one character's private feelings) — update it occasionally, not every turn, and only when there's been a real shift.

World & setting:
${world.baseMedia ? "Base setting: " + world.baseMedia : ""}
${world.auEnabled ? "This story runs in AU (alternate universe) mode. AU flavor notes: " + (world.auFlavorNotes || "") : ""}
${world.lore ? "Lore:\n" + world.lore : ""}

The protagonist is called "${protagonist.name || persona.displayName || "the reader"}" — age ${protagonist.age || "unspecified"}, appearance: ${protagonist.appearance || "unspecified"}. Background: ${protagonist.background || "unspecified"}. You should always think of them internally as USER — the actual person playing.
Protagonist stats: ${JSON.stringify(protagonist.stats || {})}
${vitalsStatusLine}
${bookData.publicView ? `\nHow the wider world currently sees the protagonist: ${bookData.publicView}` : ""}

Characters:
${characters.map(c => `- ${c.name}: ${c.appearance || ""}. Backstory: ${c.backstory || ""}. Behavior: ${c.behavior || ""}. Starting relationship to protagonist: ${c.startingRelationship || "Stranger"}. Never-forget trait: ${c.neverForgetTrait || "none"}.${c.platonic ? " PLATONIC ONLY: this character and the protagonist can never become romantically or sexually involved, no matter what — as their love score rises, write it as warmer, softer, more open PLATONIC affection (deep care, devotion, protectiveness), never romantic or sexual framing." : ""} Current feelings toward protagonist (each -100 to 100, 0 = neutral): love/hate ${c.stats?.love ?? 0} (${(c.stats?.love ?? 0) >= 0 ? "leaning love" : "leaning hate"}), trust/jealousy ${c.stats?.trust ?? 0} (${(c.stats?.trust ?? 0) >= 0 ? "leaning trust" : "leaning jealousy"}), loyalty/betrayal ${c.stats?.loyalty ?? 0} (${(c.stats?.loyalty ?? 0) >= 0 ? "leaning loyalty" : "leaning betrayal"}).`).join("\n")}

Currency: ${keywords.currency?.name || "coins"} (${keywords.currency?.icon || "🪙"})
Key lore words to weave in naturally where relevant: ${(keywords.loreWords || []).map(w => w.word).join(", ") || "(none)"}

Recent story memory notes:
${memoryNotes || "(none yet)"}
`.trim();

  const user = `
Current page:
"""
${recentText}
"""

The reader's turn: ${isCustom ? `(freely written) "${turnText}"` : `chose the option "${turnText}"`}
${inventoryActionsLine}

Continue the story accordingly, following the JSON format exactly.
${isRetry ? "\nThe reader asked for a retry — write a meaningfully different take this time (different tone, different specific events, or a different angle), not a near-duplicate of a previous attempt." : ""}
`.trim();

  return { system, user };
}

function setControlsDisabled(disabled) {
  document.querySelectorAll(".turn-option, .custom-turn-row button, .custom-turn-row textarea")
    .forEach(el => el.disabled = disabled);
  if (pagePrevBtn) pagePrevBtn.disabled = disabled || viewPageIdx <= 0;
  if (pageNextBtn) pageNextBtn.disabled = disabled;
  if (disabled) {
    document.querySelectorAll(".retry-controls button").forEach(el => el.disabled = true);
    if (redoTurnRowEl) redoTurnRowEl.style.display = "none";
  } else {
    renderRetryControls(); // re-derives correct enabled/disabled state per button
    renderPageNav();
    renderRedoRow();
  }
}

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.classList.add("show");
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.classList.remove("show");
}

init();

