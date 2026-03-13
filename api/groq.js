import { requestGroqChat } from "./_shared/groq.js";
import { handlePreflight, setCors } from "./_shared/cors.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCors(req, res);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, maxTokens } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  try {
    const text = await requestGroqChat({ prompt, maxTokens: maxTokens || 1024 });
    return res.status(200).json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/groq] error:", message);
    return res.status(500).json({ error: message });
  }
}
