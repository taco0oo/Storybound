/**
 * story-schema.js
 * ----------------
 * Defines the shape of every data object used across the app:
 * books, chapters, episodes, pages, characters, stats, keywords,
 * inventory, and currency.
 *
 * Nothing in here talks to the AI, Supabase, or the DOM — it's pure
 * data + factory functions. Every other file (story-engine.js,
 * ui-library.js, ui-book.js, ui-create.js) should create objects
 * using these functions instead of hand-rolling plain objects, so
 * the shape stays consistent everywhere.
 *
 * All factory functions accept an "overrides" object so you can do:
 *   createCharacter({ name: "Kael", appearance: "..." })
 * and get back a full object with sensible defaults filled in.
 */

// ---------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------

/** Generates a reasonably unique id for local objects (books, chapters, etc). */
function generateId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------
// Stats (character feeling stats + protagonist base stats)
// ---------------------------------------------------------------

/**
 * Default feeling stats tracked between the user and a character.
 * Three center-oriented axes, each -100..100 starting at 0 — the two
 * ends of each axis are opposite poles of the same slider, not separate
 * stats:
 *   love:    -100 hate      <-> +100 love
 *   trust:   -100 jealousy  <-> +100 trust
 *   loyalty: -100 betrayal  <-> +100 loyalty
 */
function createFeelingStats(overrides = {}) {
  return {
    love: 0,
    trust: 0,
    loyalty: 0,
    ...overrides,
  };
}

/**
 * Default base stats for the protagonist (and optionally NPCs).
 * Values are 0-100. These gate what actions/turns are plausible
 * (e.g. low strength can't wield a giant axe).
 */
function createBaseStats(overrides = {}) {
  return {
    strength: 50,
    persuasion: 50,
    intelligence: 50,
    agility: 50,
    perception: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Character
// ---------------------------------------------------------------

/**
 * A character in the story (including the protagonist, if you want
 * to model them the same way).
 */
function createCharacter(overrides = {}) {
  return {
    id: generateId("char"),
    name: "",
    appearance: "",
    backstory: "",
    attitude: "",
    // What makes this character flustered / feel needed / feel betrayed, etc.
    // Free text — feeds the AI's feeling% decisions during turns.
    actsOfService: "",
    // Optional notes and lore ties, per spec.
    importantNotes: "",
    tieToLore: "",
    // Dialogue text color for this character, shown in the reading view.
    dialogueColor: "#8a5cf6",
    // Starting relationship to the protagonist (e.g. "childhood friend").
    startingRelationship: "",
    // A single "never-forget" trait the AI must always keep consistent.
    neverForgetTrait: "",
    // Platonic-only: love can still rise, but the AI is told this
    // character can never become a romantic interest — high love reads
    // as warmer/softer platonic affection instead.
    platonic: false,
    feelingStats: createFeelingStats(),
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Keyword library (currency, inventory items, lore words)
// ---------------------------------------------------------------

/**
 * A single entry in the dynamic keyword library — currency names,
 * inventory item types, or lore terms. Each gets a highlight color
 * and optional icon/emoji so it renders consistently wherever it
 * appears in story text or the inventory panel.
 */
function createKeyword(overrides = {}) {
  return {
    id: generateId("kw"),
    term: "",
    type: "lore", // "currency" | "item" | "lore"
    color: "#f4a261",
    icon: "", // emoji or short symbol, e.g. "🥕"
    description: "",
    ...overrides,
  };
}

/** Default currency keyword (in-story coins). */
function createCurrency(overrides = {}) {
  return createKeyword({
    term: "Coins",
    type: "currency",
    icon: "🪙",
    color: "#e9c46a",
    ...overrides,
  });
}

/** A single inventory item the protagonist is carrying. */
function createInventoryItem(overrides = {}) {
  return {
    id: generateId("item"),
    name: "",
    icon: "",
    quantity: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Turns
// ---------------------------------------------------------------

/**
 * A single offered choice on a page (plus the always-available
 * custom typed option, which is handled separately in the engine —
 * not stored as a Turn itself).
 */
function createTurnOption(overrides = {}) {
  return {
    id: generateId("turn"),
    label: "", // e.g. "♡ kiss him"
    symbol: "", // e.g. "♡" — pulled from the book's custom turn symbols
    // Optional gold cost if this option is a "shop" style choice.
    cost: 0,
    // Optional success-rate estimate shown under the choice, derived
    // from protagonist stats — computed by story-engine.js, stored
    // here once calculated so the UI doesn't recompute it.
    successRate: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Pages, Episodes, Chapters
// ---------------------------------------------------------------

/** A single page of story text (one "screen" in the reading view). */
function createPage(overrides = {}) {
  return {
    id: generateId("page"),
    // Raw story text for this page.
    text: "",
    // True for the mandatory user-written first page of an episode.
    isUserWritten: false,
    // Turn options offered at the end of this page, if any.
    turnOptions: [],
    ...overrides,
  };
}

/**
 * An episode = one node in the chapter map. Starts with a mandatory
 * user-written first page, then the AI continues from there.
 */
function createEpisode(overrides = {}) {
  return {
    id: generateId("ep"),
    title: "",
    // Editable AI-generated summary, shown on the chapter map.
    summary: "",
    pages: [],
    ...overrides,
  };
}

/** A chapter groups one or more episodes. */
function createChapter(overrides = {}) {
  return {
    id: generateId("chap"),
    title: "",
    episodes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Book (top-level object)
// ---------------------------------------------------------------

/**
 * A book = one story. This is the big one — it nests everything else.
 * Grouped roughly to match the creation wizard: Foundations, Cast &
 * Dynamic Mechanics, Blueprint, Visual Studio.
 */
function createBook(overrides = {}) {
  return {
    id: generateId("book"),
    createdAt: Date.now(),
    updatedAt: Date.now(),

    // ---- Foundations ----
    foundations: {
      title: "",
      authorAlias: "",
      genre: "",
      aiTone: "",
      narrativePerspective: "second-person", // locked once set
      // 0 = pure description, 100 = pure action, per the "AI director" slider
      directorSlider: 50,
      neverForgetRules: [], // array of strings, global rules the AI must always follow
      isAlternateUniverse: false,
      auFlavorNotes: "",
      canonTweaks: "", // e.g. "they never met the villain"
      referenceLore: "", // pasted-in lore/reference info from existing media
      protagonist: {
        name: "",
        age: "",
        appearance: "",
        background: "",
        stats: createBaseStats(),
      },
      worldLore: "",
    },

    // ---- Cast & Dynamic Mechanics ----
    cast: {
      characters: [], // array of createCharacter()
      keywordLibrary: [], // array of createKeyword() (items, lore terms)
      currency: createCurrency(),
      // How many AI turn options are offered per page (custom typed
      // option is always additionally available, not counted here).
      turnOptionsPerPage: 3,
    },

    // ---- Blueprint (structure) ----
    blueprint: {
      chapters: [], // array of createChapter()
    },

    // ---- Visual Studio ----
    visual: {
      coverColor: "#3a2e2c",
      coverStamp: "",
      titleLettering: "default",
      pageTint: "#fdf6ec",
      textTheme: "sepia",
      customTurnSymbols: ["♡", "⚔", "✦"],
      pageDividerStyle: "default",
      borderStyle: "default",
      typewriterSpeed: 30, // ms per character
    },

    // ---- Generation controls (read-only info per spec, stored so
    // the engine can enforce it) ----
    generation: {
      maxRetriesPerTurn: 5,
      forcedVariationOnRetry: true,
    },

    // ---- Runtime state ----
    // How the wider world/cast currently sees the protagonist — a short
    // AI-generated epithet that drifts over time based on how the reader
    // plays (e.g. "a hermit", "a reckless daredevil"). Starts unset.
    publicView: "",
    inventory: [], // array of createInventoryItem()
    bookmark: {
      chapterId: null,
      episodeId: null,
      pageId: null,
    },

    ...overrides,
  };
}

// ---------------------------------------------------------------
// User "code name" (character.ai-style {user}/USER placeholder)
// ---------------------------------------------------------------

/**
 * The user's in-story identity. The AI is always told to address/
 * understand the user as this code name internally, regardless of
 * what display name the user goes by in the app UI.
 */
function createUserProfile(overrides = {}) {
  return {
    id: generateId("user"),
    displayName: "",
    codeName: "USER",
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Exports
// ---------------------------------------------------------------

export {
  generateId,
  createFeelingStats,
  createBaseStats,
  createCharacter,
  createKeyword,
  createCurrency,
  createInventoryItem,
  createTurnOption,
  createPage,
  createEpisode,
  createChapter,
  createBook,
  createUserProfile,
};
