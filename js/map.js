// ============================================
// CHAPTER MAP — bookmark view
// A simplified node-style layout for now (a connected
// chain of episode nodes per chapter). A fully draggable
// visual canvas is a planned upgrade on top of this same data.
// ============================================

const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");

const titleEl = document.getElementById("map-title");
const chaptersEl = document.getElementById("chapters");
const detailPanel = document.getElementById("detail-panel");
const detailTitle = document.getElementById("detail-title");
const detailSummary = document.getElementById("detail-summary");
const jumpBtn = document.getElementById("jump-btn");
const backBtn = document.getElementById("back-btn");

let book, bookData;
let selected = null; // { chapterIdx, episodeIdx }

backBtn.addEventListener("click", () => {
  window.location.href = `book.html?id=${bookId}`;
});

async function init() {
  const { data, error } = await supabase.from("books").select("*").eq("id", bookId).single();
  if (error || !data) {
    chaptersEl.innerHTML = "<p style='color:var(--parchment-dim)'>Couldn't load this book.</p>";
    return;
  }
  book = data;
  bookData = book.data;
  titleEl.textContent = book.title;
  renderChapters();
}

function renderChapters() {
  chaptersEl.innerHTML = "";
  (bookData.chapters || []).forEach((chapter, chapterIdx) => {
    const block = document.createElement("div");
    block.className = "chapter-block";

    const title = document.createElement("div");
    title.className = "chapter-block__title";
    title.textContent = chapter.title || `Chapter ${chapterIdx + 1}`;
    block.appendChild(title);

    const chain = document.createElement("div");
    chain.className = "node-chain";

    chapter.episodes.forEach((episode, episodeIdx) => {
      const node = document.createElement("div");
      node.className = "episode-node";

      const card = document.createElement("button");
      card.type = "button";
      card.className = "episode-node__card";
      card.innerHTML = `
        <div class="episode-node__title">${escapeHtml(episode.title || `Episode ${episodeIdx + 1}`)}</div>
        <div class="episode-node__summary ${episode.summary ? "" : "empty"}">
          ${episode.summary ? escapeHtml(episode.summary) : "No summary yet — keep reading to generate one."}
        </div>
      `;
      card.addEventListener("click", () => selectEpisode(chapterIdx, episodeIdx, chapter, episode));
      node.appendChild(card);
      chain.appendChild(node);
    });

    block.appendChild(chain);
    chaptersEl.appendChild(block);
  });
}

function selectEpisode(chapterIdx, episodeIdx, chapter, episode) {
  selected = { chapterIdx, episodeIdx };
  detailTitle.textContent = `${chapter.title} — ${episode.title}`;
  detailSummary.textContent = episode.summary || "No summary written yet for this episode.";
  detailPanel.classList.add("show");
  detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

jumpBtn.addEventListener("click", async () => {
  if (!selected) return;
  bookData.progress = {
    chapterIdx: selected.chapterIdx,
    episodeIdx: selected.episodeIdx,
    pageIdx: 0
  };
  await supabase.from("books").update({ data: bookData }).eq("id", bookId);
  window.location.href = `book.html?id=${bookId}`;
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
