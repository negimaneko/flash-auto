export async function requestGroqChat({ prompt, maxTokens = 1024, systemPrompt, temperature }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: maxTokens,
      temperature: temperature ?? 0.7,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    const errMsg = data.error?.message || "Groq request failed";
    console.error("[Groq API] error:", response.status, errMsg);
    throw new Error(errMsg);
  }

  const text = data.choices?.[0]?.message?.content || "";
  if (!text) {
    throw new Error("AI returned an empty response");
  }

  return text;
}
