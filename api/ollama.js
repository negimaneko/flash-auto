const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3.5:9b";

async function resolveOllamaModel(baseUrl) {
  const configuredModel = String(process.env.OLLAMA_MODEL || "").trim();
  if (configuredModel) return configuredModel;

  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) return DEFAULT_OLLAMA_MODEL;

    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    const qwenModel = models.find((model) => /qwen/i.test(String(model?.name || "")));
    return qwenModel?.name || DEFAULT_OLLAMA_MODEL;
  } catch {
    return DEFAULT_OLLAMA_MODEL;
  }
}

export async function handleOllamaRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, maxTokens } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  const baseUrl = String(process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  const model = await resolveOllamaModel(baseUrl);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: maxTokens || 1024,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || "Ollama request failed",
      });
    }

    const text = String(data.response || "").trim();
    if (!text) {
      return res.status(502).json({ error: "Ollama returned an empty response" });
    }

    return res.status(200).json({ text, model });
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : "Ollama is unavailable",
    });
  }
}

export default async function handler(req, res) {
  return handleOllamaRequest(req, res);
}
