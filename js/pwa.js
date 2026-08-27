// ============================================
// PWA REGISTRATION — include on every page
// ============================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

// ============================================
// SHARED TEXT-FIELD UX FIXES (every page)
// 1. Textareas grow taller as you type instead of squeezing text down
//    to one line. Each textarea can cap how tall it'll get via a CSS
//    max-height; past that it scrolls internally like normal.
// 2. When the on-screen keyboard opens, whatever's focused gets
//    scrolled back into view instead of staying hidden behind it.
// ============================================
window.autoGrowTextarea = function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  const maxHeight = parseFloat(getComputedStyle(el).maxHeight);
  if (!isNaN(maxHeight) && el.scrollHeight > maxHeight) {
    el.style.height = maxHeight + "px";
    el.style.overflowY = "auto";
  } else {
    el.style.height = el.scrollHeight + "px";
    el.style.overflowY = "hidden";
  }
};

document.addEventListener("input", (e) => {
  if (e.target && e.target.tagName === "TEXTAREA") window.autoGrowTextarea(e.target);
});

document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (!el || !el.matches || !el.matches("input, textarea")) return;
  if (el.tagName === "TEXTAREA") window.autoGrowTextarea(el);
  // Give the keyboard a moment to finish animating in before scrolling —
  // scrolling immediately gets fought by the viewport resize itself.
  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const active = document.activeElement;
    if (active && active.matches && active.matches("input, textarea")) {
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}
