// ============================================
// LIBRARY / SHELF VIEW
// ============================================

const greetingEl = document.getElementById("greeting");
const shelvesEl = document.getElementById("shelves");
const addBookBtn = document.getElementById("add-book-btn");

const bookMenuBackdrop = document.getElementById("book-menu-backdrop");
const bookMenuPinBtn = document.getElementById("book-menu-pin");
const bookMenuPinLabel = document.getElementById("book-menu-pin-label");
const bookMenuEditBtn = document.getElementById("book-menu-edit");
const bookMenuDeleteBtn = document.getElementById("book-menu-delete");
const bookMenuCancelBtn = document.getElementById("book-menu-cancel");

const BOOKS_PER_SHELF = 6;
const LONG_PRESS_MS = 450;
let menuBookId = null;
let menuBookPinned = false;

async function init() {
  try {
    // FIX: previously only checked `typeof supabase === "undefined"`.
    // If the Supabase CDN script loaded but createClient() failed
    // (bad URL/key, or the client object came back malformed), `supabase`
    // exists but `supabase.auth` does not — and the old check let that
    // slip through, causing "Cannot read properties of undefined
    // (reading 'getSession')" a few lines down. Checking both here means
    // a real, readable error shows up instead of a browser TypeError.
    if (typeof supabase === "undefined" || !supabase.auth) {
      throw new Error(
        "Couldn't connect to Supabase. This usually means either: " +
        "(1) your Supabase project is paused — check the Supabase dashboard, " +
        "(2) the SUPABASE_URL or SUPABASE_ANON_KEY in supabase-client.js is wrong/stale, or " +
        "(3) the Supabase CDN script (in index.html <head>) failed to load — check your network tab."
      );
    }

    // Auth guard — bounce to login if not signed in
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }

    const user = session.user;

    // Greeting — pull username from profiles, fall back to email prefix
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    greetingEl.innerHTML = `Welcome back, <span class="name">${escapeHtml(profile?.username || user.email.split("@")[0])}</span>`;

    await loadBooks(user.id);
  } catch (err) {
    console.error("Library init failed:", err);
    shelvesEl.innerHTML = `<div class="loading-line">${escapeHtml(err.message || String(err))}</div>`;
  }
}

async function loadBooks(userId) {
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, cover_config, updated_at, pinned")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    shelvesEl.innerHTML = `<div class="loading-line">Couldn't load your shelf — try refreshing.</div>`;
    console.error(error);
    return;
  }

  if (!books || books.length === 0) {
    shelvesEl.innerHTML = `
      <div class="empty-shelf">
        <h2>Your shelf is empty</h2>
        <p>Tap the + below to write your first book.</p>
      </div>`;
    return;
  }

  shelvesEl.innerHTML = "";
  for (let i = 0; i < books.length; i += BOOKS_PER_SHELF) {
    const rowBooks = books.slice(i, i + BOOKS_PER_SHELF);
    const row = document.createElement("div");
    row.className = "shelf-row";

    const booksWrap = document.createElement("div");
    booksWrap.className = "shelf-books";

    rowBooks.forEach((book, idx) => {
      booksWrap.appendChild(renderBook(book, idx));
    });

    row.appendChild(booksWrap);
    shelvesEl.appendChild(row);
  }
}

function renderBook(book, animIndex) {
  const cfg = book.cover_config || {};
  const color = cfg.color || "#4a3f6b";
  const stamp = cfg.stamp || "";

  const el = document.createElement("div");
  el.className = "book";
  el.style.background = color;
  el.style.animationDelay = `${animIndex * 40}ms`;
  el.innerHTML = `
    <span class="book__title">${escapeHtml(book.title || "Untitled")}</span>
    ${stamp ? `<span class="book__stamp">${escapeHtml(stamp)}</span>` : ""}
    ${book.pinned ? `<span class="book__pin">📌</span>` : ""}
  `;

  // Tap opens the book. Long-press (or right-click on desktop) opens
  // the edit / pin / delete menu instead.
  let pressTimer = null;
  let longPressFired = false;

  const startPress = () => {
    longPressFired = false;
    pressTimer = setTimeout(() => {
      longPressFired = true;
      openBookMenu(book);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer);

  el.addEventListener("touchstart", startPress, { passive: true });
  el.addEventListener("touchend", cancelPress);
  el.addEventListener("touchmove", cancelPress);
  el.addEventListener("mousedown", startPress);
  el.addEventListener("mouseup", cancelPress);
  el.addEventListener("mouseleave", cancelPress);
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openBookMenu(book);
  });

  el.addEventListener("click", () => {
    if (longPressFired) return; // the long-press already handled this tap
    window.location.href = `book.html?id=${book.id}`;
  });

  return el;
}

function openBookMenu(book) {
  menuBookId = book.id;
  menuBookPinned = !!book.pinned;
  bookMenuPinLabel.textContent = menuBookPinned ? "Unpin" : "Pin";
  bookMenuBackdrop.classList.add("show");
}

function closeBookMenu() {
  bookMenuBackdrop.classList.remove("show");
  menuBookId = null;
}

bookMenuCancelBtn.addEventListener("click", closeBookMenu);
bookMenuBackdrop.addEventListener("click", (e) => {
  if (e.target === bookMenuBackdrop) closeBookMenu();
});

bookMenuPinBtn.addEventListener("click", async () => {
  if (!menuBookId) return;
  const newPinned = !menuBookPinned;
  const { error } = await supabase.from("books").update({ pinned: newPinned }).eq("id", menuBookId);
  closeBookMenu();
  if (error) {
    alert("Couldn't update pin status: " + error.message);
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await loadBooks(session.user.id);
});

bookMenuEditBtn.addEventListener("click", () => {
  // Send them into the creation wizard, pre-filled with this book's data.
  if (menuBookId) window.location.href = `create.html?edit=${menuBookId}`;
});

bookMenuDeleteBtn.addEventListener("click", async () => {
  if (!menuBookId) return;
  const id = menuBookId;
  closeBookMenu();
  if (!confirm("Delete this book? This can't be undone.")) return;
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) {
    alert("Couldn't delete: " + error.message);
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await loadBooks(session.user.id);
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

addBookBtn.addEventListener("click", () => {
  window.location.href = "create.html";
});

init();
