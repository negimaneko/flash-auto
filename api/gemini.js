import { requestGeminiChat } from "./_shared/gemini.js";
import { handlePreflight, setCors } from "./_shared/cors.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCors(req, res);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // GEMINI_API_KEY が未設定なら 404 を返す
  // → callAI のフォールバックチェーンで自動的にスキップされる
  if (!process.env.GEMINI_API_KEY) {
    return res.status(404).json({ error: "Gemini is not configured" });
  }

  const { prompt, maxTokens } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  if (typeof prompt !== "string" || prompt.length > 8000) return res.status(400).json({ error: "prompt is too long" });

  try {
    const text = await requestGeminiChat({ prompt, maxTokens: maxTokens || 1024 });
    return res.status(200).json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/gemini] error:", message);
    return res.status(500).json({ error: message });
  }
}
