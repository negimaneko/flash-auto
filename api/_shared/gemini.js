/**
 * Gemini API 共通モジュール
 * _shared/groq.js と同じインターフェース:
 *   requestGeminiChat({ prompt, maxTokens, systemPrompt, temperature }) => Promise<string>
 */

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export async function requestGeminiChat({ prompt, maxTokens = 1024, systemPrompt, temperature }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: temperature ?? 0.7,
    },
  };

  if (systemPrompt) {
    body.system_instruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    const errMsg = data.error?.message || "Gemini request failed";
    console.error("[Gemini API] error:", response.status, errMsg);
    throw new Error(errMsg);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) {
    throw new Error("AI returned an empty response");
  }

  return text;
}
