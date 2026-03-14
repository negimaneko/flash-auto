import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// グローバル fetch をモックする
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// テストごとに環境変数とモックをリセット
beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
  process.env.GEMINI_API_KEY = "test-gemini-key-123";
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

// ====================================================================
// requestGeminiChat
// ====================================================================
describe("requestGeminiChat", () => {
  async function loadModule() {
    const mod = await import("../_shared/gemini.js");
    return mod.requestGeminiChat;
  }

  it("GEMINI_API_KEY が未設定なら例外を投げる", async () => {
    delete process.env.GEMINI_API_KEY;
    const requestGeminiChat = await loadModule();
    await expect(requestGeminiChat({ prompt: "test" })).rejects.toThrow("GEMINI_API_KEY not configured");
  });

  it("正常レスポンスからテキストを取得できる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "生成されたテキスト" }] } }],
      }),
    });

    const requestGeminiChat = await loadModule();
    const result = await requestGeminiChat({ prompt: "テスト" });
    expect(result).toBe("生成されたテキスト");
  });

  it("API呼び出しに正しいパラメータが渡される", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
      }),
    });

    const requestGeminiChat = await loadModule();
    await requestGeminiChat({
      prompt: "テストプロンプト",
      maxTokens: 512,
      systemPrompt: "あなたはテスト用AIです",
      temperature: 0.3,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    // URL に正しいモデルとAPIキーが含まれる
    expect(url).toContain("gemini-2.5-flash-lite");
    expect(url).toContain("key=test-gemini-key-123");

    // リクエストボディ
    const body = JSON.parse(options.body);
    expect(body.contents[0].parts[0].text).toBe("テストプロンプト");
    expect(body.generationConfig.maxOutputTokens).toBe(512);
    expect(body.generationConfig.temperature).toBe(0.3);
    expect(body.system_instruction.parts[0].text).toBe("あなたはテスト用AIです");
  });

  it("systemPrompt なしでも動作する", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
      }),
    });

    const requestGeminiChat = await loadModule();
    await requestGeminiChat({ prompt: "テスト" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system_instruction).toBeUndefined();
  });

  it("デフォルト値が正しく適用される（maxTokens=1024, temperature=0.7）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
      }),
    });

    const requestGeminiChat = await loadModule();
    await requestGeminiChat({ prompt: "テスト" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
    expect(body.generationConfig.temperature).toBe(0.7);
  });

  it("APIエラー時に例外を投げる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Rate limit exceeded" } }),
    });

    const requestGeminiChat = await loadModule();
    await expect(requestGeminiChat({ prompt: "テスト" })).rejects.toThrow("Rate limit exceeded");
  });

  it("空レスポンス時に例外を投げる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "" }] } }],
      }),
    });

    const requestGeminiChat = await loadModule();
    await expect(requestGeminiChat({ prompt: "テスト" })).rejects.toThrow("AI returned an empty response");
  });

  it("candidates が空の場合に例外を投げる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] }),
    });

    const requestGeminiChat = await loadModule();
    await expect(requestGeminiChat({ prompt: "テスト" })).rejects.toThrow("AI returned an empty response");
  });
});
