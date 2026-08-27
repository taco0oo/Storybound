// ============================================
// BOOK CREATION WIZARD (v2 — full spec)
// Also doubles as the EDIT wizard: create.html?edit=<bookId>
// pre-fills every field from the existing book and saves with an
// UPDATE instead of creating a new row. The "First Episode" step is
// skipped in edit mode — rewriting the opening page would silently
// wipe out chapters/pages the reader has already played through.
// ============================================

const params = new URLSearchParams(window.location.search);
const editBookId = params.get("edit");
let editingBook = null; // full Supabase row, set once loaded in edit mode

let steps = Array.from(document.querySelectorAll(".wizard-step"));
let stepNames = [
  "Book Identity", "Protagonist", "World & AU", "Character Roster",
  "Keywords & Inventory", "Choice Mechanics", "First Episode", "Visual Studio"
];

if (editBookId) {
  // Drop the "First Episode" step (data-step="6") entirely — its fields
  // (opening page / chapter & episode title) only make sense once, at
  // creation time.
  const firstEpisodeStep = steps.find((s) => s.dataset.step === "6");
  if (firstEpisodeStep) firstEpisodeStep.style.display = "none";
  steps = steps.filter((s) => s.dataset.step !== "6");
  stepNames = stepNames.filter((_, i) => i !== 6);
}

const totalSteps = steps.length;
let currentStep = 0;

const progressLabel = document.getElementById("progress-label");
const progressFill = document.getElementById("progress-fill");
const backBtn = document.getElementById("back-btn");
const nextBtn = document.getElementById("next-btn");
const finishBtn = document.getElementById("finish-btn");
const form = document.getElementById("wizard-form");
const editModeBanner = document.getElementById("edit-mode-banner");

function renderStep() {
  steps.forEach((s, i) => { s.style.display = i === currentStep ? "block" : "none"; });
  progressLabel.textContent = `Step ${currentStep + 1} of ${totalSteps} — ${stepNames[currentStep]}`;
  progressFill.style.width = `${((currentStep + 1) / totalSteps) * 100}%`;
  backBtn.style.display = currentStep === 0 ? "none" : "inline-block";
  nextBtn.style.display = currentStep === totalSteps - 1 ? "none" : "inline-block";
  finishBtn.style.display = currentStep === totalSteps - 1 ? "inline-block" : "none";
}

function validateCurrentStep() {
  const current = steps[currentStep];
  const requiredFields = current.querySelectorAll("[required]");
  for (const field of requiredFields) {
    if (!field.value.trim()) { field.focus(); return false; }
  }
  return true;
}

nextBtn.addEventListener("click", () => {
  if (!validateCurrentStep()) return;
  if (currentStep < totalSteps - 1) { currentStep++; renderStep(); }
});
backBtn.addEventListener("click", () => {
  if (currentStep > 0) { currentStep--; renderStep(); }
});

// -------- AI director slider --------
const directorSlider = document.getElementById("director-slider");
const directorValue = document.getElementById("director-value");
directorSlider.addEventListener("input", () => {
  directorValue.textContent = `${directorSlider.value} / 100`;
});

// -------- AU toggle --------
const auToggle = document.getElementById("au-toggle");
const auNotesWrap = document.getElementById("au-notes-wrap");
auToggle.addEventListener("change", () => {
  auNotesWrap.style.display = auToggle.checked ? "block" : "none";
});

// -------- protagonist stat sliders --------
const PROTAG_STATS = ["Strength", "Persuasion", "Intelligence", "Agility", "Perception"];
const protagStatsWrap = document.getElementById("protagonist-stats");
const statSliderTemplate = document.getElementById("stat-slider-template");

PROTAG_STATS.forEach((statName) => {
  const clone = statSliderTemplate.content.cloneNode(true);
  const group = clone.querySelector(".stat-slider");
  group.dataset.statName = statName.toLowerCase();
  const nameEl = clone.querySelector(".stat-slider__name");
  const valueEl = clone.querySelector(".stat-slider__value");
  const input = clone.querySelector(".stat-slider__input");
  nameEl.textContent = statName;
  input.addEventListener("input", () => { valueEl.textContent = input.value; });
  protagStatsWrap.appendChild(clone);
});

// -------- dynamic characters --------
const charactersList = document.getElementById("characters-list");
const characterTemplate = document.getElementById("character-template");
const addCharacterBtn = document.getElementById("add-character-btn");

function addCharacterCard(data) {
  const clone = characterTemplate.content.cloneNode(true);
  const card = clone.querySelector(".character-card");
  card.querySelector(".dynamic-card__remove").addEventListener("click", () => card.remove());
  if (data) {
    card.querySelector(".char-name").value = data.name || "";
    card.querySelector(".char-appearance").value = data.appearance || "";
    card.querySelector(".char-backstory").value = data.backstory || "";
    card.querySelector(".char-behavior").value = data.behavior || "";
    if (data.startingRelationship) card.querySelector(".char-relationship").value = data.startingRelationship;
    card.querySelector(".char-color").value = data.dialogueColor || "#c9a04c";
    card.querySelector(".char-never-forget").value = data.neverForgetTrait || "";
  }
  charactersList.appendChild(clone);
}
addCharacterBtn.addEventListener("click", () => addCharacterCard());
addCharacterCard();

// -------- dynamic inventory items --------
const inventoryList = document.getElementById("inventory-list");
const inventoryItemTemplate = document.getElementById("inventory-item-template");

function addInventoryRow(data) {
  const clone = inventoryItemTemplate.content.cloneNode(true);
  const row = clone.querySelector(".inventory-item-row");
  row.querySelector(".remove-keyword-row").addEventListener("click", () => row.remove());
  if (data) {
    row.querySelector(".inv-name").value = data.name || "";
    row.querySelector(".inv-emoji").value = data.emoji || "";
    row.querySelector(".inv-qty").value = data.qty ?? 1;
    row.querySelector(".inv-color").value = data.color || "#8a3a3a";
    if (data.category) row.querySelector(".inv-category").value = data.category;
  }
  inventoryList.appendChild(clone);
}
document.getElementById("add-inventory-btn").addEventListener("click", () => addInventoryRow());

// -------- dynamic lore words --------
const lorewordsList = document.getElementById("lorewords-list");
const lorewordTemplate = document.getElementById("loreword-template");

function addLoreRow(data) {
  const clone = lorewordTemplate.content.cloneNode(true);
  const row = clone.querySelector(".loreword-row");
  row.querySelector(".remove-keyword-row").addEventListener("click", () => row.remove());
  if (data) {
    row.querySelector(".lore-word").value = data.word || "";
    row.querySelector(".lore-color").value = data.color || "#7c8c6b";
  }
  lorewordsList.appendChild(clone);
}
document.getElementById("add-loreword-btn").addEventListener("click", () => addLoreRow());

// -------- collectors --------
function collectProtagonistStats() {
  const stats = {};
  document.querySelectorAll(".stat-slider").forEach((el) => {
    stats[el.dataset.statName] = parseInt(el.querySelector(".stat-slider__input").value, 10) || 0;
  });
  return stats;
}

// existingCharacters (edit mode) lets us keep a character's in-progress
// feeling stats (love/trust/fear/jealousy/loyalty) when the reader just
// tweaks their appearance/backstory text rather than resetting them to 0.
function collectCharacters(existingCharacters = []) {
  const existingByName = new Map(existingCharacters.map((c) => [(c.name || "").toLowerCase(), c]));
  return Array.from(document.querySelectorAll(".character-card")).map((card) => {
    const name = card.querySelector(".char-name").value.trim();
    const existing = existingByName.get(name.toLowerCase());
    return {
      id: existing ? existing.id : crypto.randomUUID(),
      name,
      appearance: card.querySelector(".char-appearance").value.trim(),
      backstory: card.querySelector(".char-backstory").value.trim(),
      behavior: card.querySelector(".char-behavior").value.trim(),
      startingRelationship: card.querySelector(".char-relationship").value,
      dialogueColor: card.querySelector(".char-color").value,
      neverForgetTrait: card.querySelector(".char-never-forget").value.trim(),
      stats: existing && existing.stats ? existing.stats : { love: 0, trust: 0, fear: 0, jealousy: 0, loyalty: 0 }
    };
  }).filter((c) => c.name);
}

// Category decides whether an item gets consumed (single-use) or sticks
// around (reusable) when the reader uses it from the inventory panel.
const SINGLE_USE_CATEGORIES = new Set(["food", "misc"]);

function collectInventory() {
  return Array.from(document.querySelectorAll(".inventory-item-row")).map((row) => {
    const category = row.querySelector(".inv-category")?.value || "misc";
    return {
      name: row.querySelector(".inv-name").value.trim(),
      emoji: row.querySelector(".inv-emoji").value.trim(),
      qty: parseInt(row.querySelector(".inv-qty").value, 10) || 1,
      color: row.querySelector(".inv-color").value,
      category,
      singleUse: SINGLE_USE_CATEGORIES.has(category)
    };
  }).filter((i) => i.name);
}

function collectLoreWords() {
  return Array.from(document.querySelectorAll(".loreword-row")).map((row) => ({
    word: row.querySelector(".lore-word").value.trim(),
    color: row.querySelector(".lore-color").value
  })).filter((w) => w.word);
}

function collectNeverForgetRules() {
  return document.getElementById("never-forget-rules").value
    .split("\n").map((s) => s.trim()).filter(Boolean);
}

function resetFinishButton() {
  finishBtn.disabled = false;
  finishBtn.textContent = editingBook ? "Save changes" : "Create my book";
}

// ============================================
// EDIT MODE — load the existing book and pre-fill every field
// ============================================
function addFieldNote(afterEl, text) {
  const note = document.createElement("div");
  note.className = "field-note";
  note.textContent = text;
  afterEl.insertAdjacentElement("afterend", note);
}

function populateForEdit(book) {
  const bd = book.data || {};

  document.getElementById("title").value = book.title || "";
  document.getElementById("author-alias").value = bd.identity?.authorAlias || "";
  document.getElementById("genre").value = bd.identity?.genre || "";

  const persp = bd.identity?.perspective || "second";
  const radio = document.querySelector(`input[name="perspective"][value="${persp}"]`);
  if (radio) radio.checked = true;

  directorSlider.value = bd.identity?.directorSlider ?? 50;
  directorValue.textContent = `${directorSlider.value} / 100`;
  document.getElementById("never-forget-rules").value = (bd.identity?.neverForgetRules || []).join("\n");

  document.getElementById("protag-name").value = bd.protagonist?.name || "";
  document.getElementById("protag-age").value = bd.protagonist?.age || "";
  document.getElementById("protag-appearance").value = bd.protagonist?.appearance || "";
  document.getElementById("protag-background").value = bd.protagonist?.background || "";
  document.getElementById("protag-behavior").value = bd.protagonist?.behavior || "";
  document.querySelectorAll(".stat-slider").forEach((el) => {
    const val = bd.protagonist?.stats?.[el.dataset.statName];
    if (typeof val === "number") {
      el.querySelector(".stat-slider__input").value = val;
      el.querySelector(".stat-slider__value").textContent = val;
    }
  });

  document.getElementById("base-media").value = bd.world?.baseMedia || "";
  document.getElementById("lore").value = bd.world?.lore || "";
  auToggle.checked = !!bd.world?.auEnabled;
  auNotesWrap.style.display = auToggle.checked ? "block" : "none";
  document.getElementById("au-notes").value = bd.world?.auFlavorNotes || "";

  charactersList.innerHTML = "";
  const existingCharacters = bd.characters || [];
  if (existingCharacters.length) {
    existingCharacters.forEach((c) => addCharacterCard(c));
  } else {
    addCharacterCard();
  }

  const currency = bd.keywords?.currency || {};
  document.getElementById("currency-name").value = currency.name || "";
  document.getElementById("currency-icon").value = currency.icon || "";
  document.getElementById("currency-color").value = currency.color || "#c9a04c";
  const currencyStartInput = document.getElementById("currency-start");
  currencyStartInput.value = currency.startingAmount ?? (bd.coins ?? 0);
  addFieldNote(currencyStartInput, "You're editing an existing book — this won't reset the coins you currently have.");

  inventoryList.innerHTML = "";
  (bd.keywords?.inventoryItems || []).forEach((i) => addInventoryRow(i));
  const inventoryNote = document.createElement("div");
  inventoryNote.className = "field-note";
  inventoryNote.style.marginBottom = "10px";
  inventoryNote.textContent = "This won't reset the items already in your bag — it's just kept for reference.";
  inventoryList.insertAdjacentElement("beforebegin", inventoryNote);

  lorewordsList.innerHTML = "";
  (bd.keywords?.loreWords || []).forEach((w) => addLoreRow(w));

  document.getElementById("success-rate-toggle").checked = bd.choiceMechanics?.successRateEnabled ?? true;
  document.getElementById("turns-per-page").value = bd.choiceMechanics?.turnsPerPage ?? 3;
  document.getElementById("vitals-toggle").checked = bd.vitals?.enabled ?? true;

  const cover = book.cover_config || {};
  document.getElementById("cover-color").value = cover.color || "#4a3f6b";
  document.getElementById("cover-accent").value = cover.accent || "#c9a04c";
  document.getElementById("stamp").value = cover.stamp || "";

  const design = book.design || {};
  document.getElementById("paper-color").value = design.paperColor || "#f3e8d0";
  document.getElementById("text-theme").value = design.textTheme || "lora";
  document.getElementById("border-style").value = design.borderStyle || "soft";
  document.getElementById("turn-symbol").value = design.turnSymbol || "";
  document.getElementById("divider-style").value = design.dividerStyle || "";
}

async function initEditMode() {
  if (editModeBanner) {
    editModeBanner.textContent = "Loading your book to edit…";
    editModeBanner.style.display = "block";
  }
  finishBtn.textContent = "Save changes";

  try {
    if (typeof supabase === "undefined" || !supabase.auth) {
      throw new Error("Couldn't connect to the account service — check your connection and reload.");
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "login.html"; return; }

    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("id", editBookId)
      .eq("user_id", session.user.id)
      .single();

    if (error || !data) {
      throw new Error("Couldn't find this book to edit.");
    }

    editingBook = data;
    populateForEdit(editingBook);

    if (editModeBanner) {
      editModeBanner.textContent = `Editing “${editingBook.title || "Untitled"}” — your written chapters are untouched.`;
    }
    document.title = `Storybound — Edit ${editingBook.title || "Book"}`;
  } catch (err) {
    console.error("Couldn't load book for editing:", err);
    alert("Couldn't load this book to edit: " + (err.message || String(err)));
    window.location.href = "index.html";
    return;
  }

  renderStep();
}

// -------- submit --------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateCurrentStep()) return;

  // FIX (redirect-to-step-1 bug): everything below used to run with no
  // try/catch. If the Supabase call ever *threw* instead of cleanly
  // returning { error } — e.g. the Supabase library never loaded, the
  // project is paused, you're offline, or a CORS/network error — the
  // promise died silently. The "Binding your book…" button stayed stuck
  // forever and the page never navigated to book.html. Reloading
  // create.html afterwards resets currentStep to 0, which looks exactly
  // like "it sent me back to Book Identity" even though nothing actually
  // redirected you — the book was just never created.
  //
  // Wrapping everything in try/catch means any failure now shows a real,
  // readable alert AND re-enables the button, instead of failing silently.
  finishBtn.disabled = true;
  finishBtn.textContent = editingBook ? "Saving changes…" : "Binding your book…";

  try {
    if (typeof supabase === "undefined" || !supabase.auth) {
      throw new Error(
        "Couldn't connect to the account service. This usually means the Supabase " +
        "CDN script failed to load, or your Supabase project is paused — check the " +
        "Supabase dashboard and your network connection, then reload the page."
      );
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "login.html"; return; }

    const title = document.getElementById("title").value.trim();

    const identity = {
      authorAlias: document.getElementById("author-alias").value.trim(),
      genre: document.getElementById("genre").value.trim(),
      perspective: document.querySelector('input[name="perspective"]:checked').value,
      directorSlider: parseInt(directorSlider.value, 10),
      neverForgetRules: collectNeverForgetRules()
    };

    const protagonist = {
      name: document.getElementById("protag-name").value.trim(),
      age: document.getElementById("protag-age").value.trim(),
      appearance: document.getElementById("protag-appearance").value.trim(),
      background: document.getElementById("protag-background").value.trim(),
      behavior: document.getElementById("protag-behavior").value.trim(),
      stats: collectProtagonistStats()
    };

    const persona = {
      displayName: protagonist.name,
      codeName: "USER" // fixed internal placeholder the AI is told to use for the player
    };

    const worldNotes = {
      baseMedia: document.getElementById("base-media").value.trim(),
      lore: document.getElementById("lore").value.trim(),
      auEnabled: auToggle.checked,
      auFlavorNotes: document.getElementById("au-notes").value.trim()
    };

    const keywords = {
      currency: {
        name: document.getElementById("currency-name").value.trim() || "Coins",
        icon: document.getElementById("currency-icon").value.trim() || "🪙",
        color: document.getElementById("currency-color").value,
        startingAmount: parseInt(document.getElementById("currency-start").value, 10) || 0
      },
      inventoryItems: collectInventory(),
      loreWords: collectLoreWords()
    };

    const vitalsEnabled = document.getElementById("vitals-toggle").checked;

    const choiceMechanics = {
      successRateEnabled: document.getElementById("success-rate-toggle").checked,
      turnsPerPage: parseInt(document.getElementById("turns-per-page").value, 10) || 3
    };

    const design = {
      paperColor: document.getElementById("paper-color").value,
      textTheme: document.getElementById("text-theme").value,
      borderStyle: document.getElementById("border-style").value,
      turnSymbol: document.getElementById("turn-symbol").value.trim(),
      dividerStyle: document.getElementById("divider-style").value.trim()
    };

    const coverConfig = {
      color: document.getElementById("cover-color").value,
      accent: document.getElementById("cover-accent").value,
      stamp: document.getElementById("stamp").value.trim()
    };

    if (editingBook) {
      // ---- EDIT: update the setup fields only. Deliberately untouched:
      // coins, inventory, chapters, memoryNotes, progress, and the
      // moment-to-moment vitals numbers — those belong to the story
      // already in progress, not to the setup wizard.
      const existingData = editingBook.data || {};
      const mergedBookData = {
        ...existingData,
        identity,
        protagonist,
        persona,
        world: worldNotes,
        characters: collectCharacters(existingData.characters),
        keywords,
        choiceMechanics,
        vitals: {
          ...(existingData.vitals || { hunger: 100, fatigue: 100, health: 100, hygiene: 100 }),
          enabled: vitalsEnabled
        }
      };

      const { error } = await supabase
        .from("books")
        .update({
          title,
          cover_config: coverConfig,
          design,
          world: worldNotes,
          data: mergedBookData,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingBook.id);

      if (error) {
        throw new Error(error.message || "Supabase rejected the update — check your RLS policies allow UPDATE on the books table for the logged-in user.");
      }

      window.location.href = `book.html?id=${editingBook.id}`;
      return;
    }

    // ---- CREATE: brand-new book ----
    const openingPageText = document.getElementById("opening-page").value.trim();
    const chapterTitle = document.getElementById("chapter-title").value.trim() || "Chapter 1";
    const episodeTitle = document.getElementById("episode-title").value.trim() || "Episode 1";

    const bookData = {
      identity,
      protagonist,
      persona,
      world: worldNotes,
      characters: collectCharacters(),
      keywords,
      choiceMechanics,
      vitals: {
        enabled: vitalsEnabled,
        hunger: 100,
        fatigue: 100,
        health: 100,
        hygiene: 100
      },
      coins: keywords.currency.startingAmount,
      inventory: keywords.inventoryItems.map((i) => ({
        name: i.name, emoji: i.emoji, qty: i.qty, category: i.category, singleUse: i.singleUse
      })),
      chapters: [
        {
          id: crypto.randomUUID(),
          title: chapterTitle,
          episodes: [
            {
              id: crypto.randomUUID(),
              title: episodeTitle,
              summary: "",
              pages: [
                { id: crypto.randomUUID(), basePage: true, text: openingPageText, turnOptions: [] }
              ]
            }
          ]
        }
      ],
      memoryNotes: [],
      progress: null
    };

    const { data: newBook, error } = await supabase
      .from("books")
      .insert({
        user_id: session.user.id,
        title,
        cover_config: coverConfig,
        design,
        world: worldNotes,
        data: bookData
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Supabase rejected the insert — check your RLS policies allow INSERT and SELECT on the books table for the logged-in user.");
    }

    if (!newBook || !newBook.id) {
      throw new Error("The book seemed to save, but no id came back — check your Supabase RLS SELECT policy on the books table (a missing SELECT policy after insert causes exactly this).");
    }

    // Success — go straight into reading it.
    window.location.href = `book.html?id=${newBook.id}`;
  } catch (err) {
    console.error(editingBook ? "Book update failed:" : "Book creation failed:", err);
    alert((editingBook ? "Couldn't save your changes: " : "Couldn't create your book: ") + (err.message || String(err)));
    resetFinishButton();
  }
});

if (editBookId) {
  initEditMode();
} else {
  renderStep();
}
