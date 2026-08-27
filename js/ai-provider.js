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
  const chosenModel = model || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;

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
