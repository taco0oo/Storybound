// ============================================
// AI SETTINGS — provider, model, API key
// Stored in localStorage (per-device, per-browser).
// ============================================

const AI_SETTINGS_KEY = "storybound_ai_settings";

const DEFAULT_MODELS = {
  gemini: "gemini-3.6-flash",
  groq: "openai/gpt-oss-120b",
  openai: "gpt-4o-mini"
};

const MODEL_OPTIONS = {
  gemini: [
    { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash — recommended, free" },
    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash — free" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash — free" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite — fastest, free" }
  ],
  groq: [
    { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B — recommended, free" },
    { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B — smaller & faster, free" },
    { value: "qwen/qwen3.6-27b", label: "Qwen3.6 27B — free" }
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini — cheap, not free" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini — cheap, not free" }
  ]
};

function getAISettings() {
  try {
    return JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)) || {
      provider: "gemini",
      model: DEFAULT_MODELS.gemini,
      apiKey: ""
    };
  } catch {
    return { provider: "gemini", model: DEFAULT_MODELS.gemini, apiKey: "" };
  }
}

function saveAISettings(settings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

function initSettingsModal() {
  const backdrop = document.getElementById("settings-backdrop");
  const openBtn = document.getElementById("settings-btn");
  const closeBtn = document.getElementById("settings-close-btn");
  const saveBtn = document.getElementById("settings-save-btn");
  const providerSelect = document.getElementById("settings-provider");
  const modelInput = document.getElementById("settings-model");
  const keyInput = document.getElementById("settings-key");

  function populateModelOptions(provider, selectedValue) {
    modelInput.innerHTML = "";
    (MODEL_OPTIONS[provider] || []).forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      modelInput.appendChild(o);
    });
    modelInput.value = selectedValue || DEFAULT_MODELS[provider];
  }

  function open() {
    const current = getAISettings();
    providerSelect.value = current.provider;
    populateModelOptions(current.provider, current.model);
    keyInput.value = current.apiKey;
    backdrop.classList.add("show");
  }

  function close() {
    backdrop.classList.remove("show");
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  providerSelect.addEventListener("change", () => {
    populateModelOptions(providerSelect.value);
  });

  saveBtn.addEventListener("click", () => {
    const provider = providerSelect.value;
    saveAISettings({
      provider,
      model: modelInput.value || DEFAULT_MODELS[provider] || "",
      apiKey: keyInput.value.trim()
    });
    close();
  });

  // Auto-open if no key saved yet
  if (!getAISettings().apiKey) {
    open();
  }
}

initSettingsModal();
