// ============================================
// AI PROVIDER — supports Gemini, Groq, and OpenAI.
// Every function returns the parsed JSON the model replied with.
// ============================================

async function callAI({ provider, apiKey, model, systemPrompt, userPrompt }) {
  if (provider === "gemini") {
    return await callGemini({ apiKey, model, systemPrompt, userPrompt });
  }
  if (provider === "groq") {
    return await callOpenAICompatible({
      apiKey, model, systemPrompt, userPrompt,
      url: "https://api.groq.com/openai/v1/chat/completions",
      defaultModel: "openai/gpt-oss-120b",
      providerLabel: "Groq"
    });
  }
  if (provider === "openai") {
    return await callOpenAICompatible({
      apiKey, model, systemPrompt, userPrompt,
      url: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
      providerLabel: "OpenAI"
    });
  }
  throw new Error(`Provider "${provider}" isn't set up yet.`);
}

// Groq and OpenAI both speak the same chat-completions shape, so one
// function handles both — just point it at a different URL/default model.
async function callOpenAICompatible({ apiKey, model, systemPrompt, userPrompt, url, defaultModel, providerLabel }) {
  const chosenModel = model || defaultModel;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.9,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${providerLabel} error (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${providerLabel} returned an empty response.`);

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Couldn't parse the AI's response as JSON. Try again.");
  }
}

async function callGemini({ apiKey, model, systemPrompt, userPrompt }) {
  // preferred default
  let chosenModel = model || "gemini-3.6-flash";

  // attempt the call with a given model; if we get a 404 telling us
  // the model is no longer available, retry once with gemini-3.6-flash
  async function attempt(modelToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.9
      }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      // If it's a 404 that says the model is no longer available to new users,
      // retry once with gemini-3.6-flash and try to persist that choice to localStorage.
      if (res.status === 404 && /no longer available/i.test(errText) && modelToTry !== "gemini-3.6-flash") {
        console.warn(`Gemini model "${modelToTry}" unavailable: retrying with gemini-3.6-flash`);
        // Try to update local settings so UI won't keep picking the deprecated model.
        try {
          const key = "storybound_ai_settings";
          const raw = localStorage.getItem(key);
          if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && cfg.provider === "gemini") {
              cfg.model = "gemini-3.6-flash";
              localStorage.setItem(key, JSON.stringify(cfg));
            }
          }
        } catch (e) {
          // Not critical; continue anyway
          console.warn("Failed to persist AI settings update:", e);
        }
        return attempt("gemini-3.6-flash");
      }
      throw new Error(`Gemini error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned an empty response.");

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Couldn't parse the AI's response as JSON. Try again.");
    }
  }

  return attempt(chosenModel);
}
