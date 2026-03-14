import { useState, useCallback, useRef, useEffect, Component } from "react";
import { getAnonymousUserId, trackEvent, isNewUser } from "./lib/tracking.js";

// --- ErrorBoundary: アプリ全体のクラッシュを防ぐ安全ネット ---
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught error:", error?.message || error);
    console.error("[ErrorBoundary] Component stack:", info?.componentStack || "unknown");
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleFullReset = () => {
    try { localStorage.removeItem("mnemox_decks"); } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#f0fdf4", fontFamily: "system-ui, sans-serif", padding: "20px",
        }}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "40px 32px",
            maxWidth: "480px", width: "100%", textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 8px", color: "#1a1a1a" }}>
              エラーが発生しました
            </h1>
            <p style={{ fontSize: "14px", color: "#666", margin: "0 0 24px", lineHeight: 1.6 }}>
              アプリの表示中に問題が起きました。<br/>
              下のボタンで復帰できます。
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={this.handleReset} style={{
                padding: "10px 24px", borderRadius: "10px", border: "none",
                background: "#16b981", color: "#fff", fontWeight: 700,
                fontSize: "14px", cursor: "pointer",
              }}>
                もう一度試す
              </button>
              <button onClick={this.handleFullReset} style={{
                padding: "10px 24px", borderRadius: "10px",
                border: "1.5px solid #e5e5e5", background: "#fff",
                color: "#666", fontWeight: 600, fontSize: "14px", cursor: "pointer",
              }}>
                アプリをリセット
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function normalizeLanguageValue(value, fallback = "ja") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  // If it's already a known code, return as-is
  if (LANGUAGES.some((lang) => lang.code === text)) return text;
  // If it's a label (e.g. "日本語"), convert to code
  const byLabel = LANGUAGES.find((lang) => lang.label === text);
  if (byLabel) return byLabel.code;
  return text;
}

const LANGUAGES = [
  { code: "en", label: "英語", native: "English" },
  { code: "technical", label: "🔬 専門用語" },
  { code: "zh", label: "中国語", native: "中文" },
  { code: "ko", label: "韓国語", native: "한국어" },
  { code: "fr", label: "フランス語", native: "Français" },
  { code: "de", label: "ドイツ語", native: "Deutsch" },
  { code: "es", label: "スペイン語", native: "Español" },
  { code: "it", label: "イタリア語", native: "Italiano" },
  { code: "pt", label: "ポルトガル語", native: "Português" },
  { code: "ru", label: "ロシア語", native: "Русский" },
  { code: "ar", label: "アラビア語", native: "العربية" },
  { code: "hi", label: "ヒンディー語", native: "हिन्दी" },
  { code: "th", label: "タイ語", native: "ไทย" },
  { code: "vi", label: "ベトナム語", native: "Tiếng Việt" },
  { code: "id", label: "インドネシア語", native: "Bahasa Indonesia" },
  { code: "ms", label: "マレー語", native: "Bahasa Melayu" },
  { code: "tl", label: "タガログ語", native: "Tagalog" },
  { code: "nl", label: "オランダ語", native: "Nederlands" },
  { code: "sv", label: "スウェーデン語", native: "Svenska" },
  { code: "da", label: "デンマーク語", native: "Dansk" },
  { code: "no", label: "ノルウェー語", native: "Norsk" },
  { code: "fi", label: "フィンランド語", native: "Suomi" },
  { code: "pl", label: "ポーランド語", native: "Polski" },
  { code: "cs", label: "チェコ語", native: "Čeština" },
  { code: "hu", label: "ハンガリー語", native: "Magyar" },
  { code: "ro", label: "ルーマニア語", native: "Română" },
  { code: "uk", label: "ウクライナ語", native: "Українська" },
  { code: "el", label: "ギリシャ語", native: "Ελληνικά" },
  { code: "tr", label: "トルコ語", native: "Türkçe" },
  { code: "he", label: "ヘブライ語", native: "עברית" },
  { code: "fa", label: "ペルシャ語", native: "فارسی" },
  { code: "bn", label: "ベンガル語", native: "বাংলা" },
  { code: "ta", label: "タミル語", native: "தமிழ்" },
  { code: "te", label: "テルグ語", native: "తెలుగు" },
  { code: "ur", label: "ウルドゥー語", native: "اردو" },
  { code: "sw", label: "スワヒリ語", native: "Kiswahili" },
  { code: "my", label: "ミャンマー語", native: "မြန်မာ" },
  { code: "km", label: "クメール語", native: "ខ្មែរ" },
  { code: "lo", label: "ラオ語", native: "ລາວ" },
  { code: "mn", label: "モンゴル語", native: "Монгол" },
  { code: "ka", label: "ジョージア語", native: "ქართული" },
  { code: "hy", label: "アルメニア語", native: "Հայերეն" },
  { code: "la", label: "ラテン語", native: "Latina" },
  { code: "ja", label: "日本語", native: "日本語" },
];
const getLangLabel = (code) => {
  const normalized = normalizeLanguageValue(code, "");
  return LANGUAGES.find((lang) => lang.code === normalized)?.label ?? normalized;
};
const toLanguageInputValue = (value, fallback = "ja") =>
  getLangLabel(normalizeLanguageValue(value, fallback));
const AI_GENERATE_DAILY_LIMIT = 3;

const DETAIL_LEVELS = [
  { id: 1, label: "短め", desc: "短い1文" },
  { id: 2, label: "標準", desc: "2〜3文" },
  { id: 3, label: "詳しく", desc: "例や文脈を含む" },
];
const WORD_COUNTS = [
  { id: 1, label: "少なめ", desc: "10〜20語", min: 10, max: 20 },
  { id: 2, label: "標準", desc: "20〜30語", min: 20, max: 30 },
  { id: 3, label: "多め", desc: "30〜50語", min: 30, max: 50 },
];

const SPLASH_DURATION_MS = 2000;
const SPLASH_LOGO_SRC = "/icon.png";
const SPLASH_LOGO_ALT = "flash auto";

function getDeckTheme(deck) {
  const h = [deck.name, ...(deck.tags || [])].join(" ");
  if (/IT|computer|CPU|API|tech|code|programming/i.test(h)) {
    return { bg: "linear-gradient(135deg,#0f172a,#1e3a5f)", icon: "IT", accent: "#38bdf8" };
  }
  if (/English|French|Spanish|German|language|TOEIC|TOEFL/i.test(h)) {
    return { bg: "linear-gradient(135deg,#1a1040,#2d1b69)", icon: "EN", accent: "#a78bfa" };
  }
  if (/science|physics|chemistry|biology/i.test(h)) {
    return { bg: "linear-gradient(135deg,#0c1a2e,#1a0e2e)", icon: "SCI", accent: "#818cf8" };
  }
  if (/finance|economics|investment/i.test(h)) {
    return { bg: "linear-gradient(135deg,#064e3b,#065f46)", icon: "FIN", accent: "#34d399" };
  }
  if (/history|philosophy|art|music/i.test(h)) {
    return { bg: "linear-gradient(135deg,#1a1000,#2d1e00)", icon: "ART", accent: "#fbbf24" };
  }
  return { bg: "linear-gradient(135deg,#0f2d2a,#134e4a)", icon: "DECK", accent: "#5eead4" };
}

const SEED_DECKS = [
  {
    id: "seed-1",
    name: "IT基礎",
    author: "サンプル",
    isPublic: true,
    wordLang: "technical",
    defLang: "ja",
    detailLevel: 2,
    tags: ["#IT", "#基礎", "#プログラミング"],
    cleared: false,
    masteredIds: [],
    favorited: false,
    favCount: 12,
    cards: [
      { id: "s1a", word: "CPU", definition: "計算や命令の実行を担当するコンピュータの中核部品。Central Processing Unitの略。" },
      { id: "s1b", word: "RAM", definition: "作業中のデータを一時的に保存するメモリ。電源を切ると内容は消える。" },
      { id: "s1c", word: "Algorithm", definition: "問題を解くための手順・規則のまとまり。プログラムの処理方法を定義する概念。" },
      { id: "s1d", word: "API", definition: "ソフトウェア同士が機能やデータをやり取りするための接続規約。" },
    ],
  },
  {
    id: "seed-2",
    name: "英語上級",
    author: "サンプル",
    isPublic: true,
    wordLang: "en",
    defLang: "ja",
    detailLevel: 2,
    tags: ["#英語", "#単語", "#TOEFL"],
    cleared: false,
    masteredIds: [],
    favorited: false,
    favCount: 8,
    cards: [
      { id: "s2a", word: "ephemeral", definition: "ごく短い時間しか続かないさま。一時的・はかないことを指す形容詞。" },
      { id: "s2b", word: "ubiquitous", definition: "どこにでも存在し、非常に広く見られる状態。遍在する。" },
      { id: "s2c", word: "paradigm", definition: "物事の見方や考え方の枠組み。ある時代・分野における支配的な思考モデル。" },
      { id: "s2d", word: "resilience", definition: "困難や失敗から立ち直る力。回復力・復元力を指す。" },
    ],
  },
  {
    id: "seed-3",
    name: "科学用語",
    author: "サンプル",
    isPublic: true,
    wordLang: "technical",
    defLang: "ja",
    detailLevel: 2,
    tags: ["#科学", "#基礎", "#学習"],
    cleared: false,
    masteredIds: [],
    favorited: false,
    favCount: 5,
    cards: [
      { id: "s3a", word: "Hypothesis", definition: "観察や実験によって検証すべき仮説。科学的探究の出発点となる命題。" },
      { id: "s3b", word: "Variable", definition: "変化しうる値や条件を表す要素。数式やプログラムで変動する量を指す。" },
      { id: "s3c", word: "Observation", definition: "対象を注意深く見て事実や変化を記録する行為。科学的手法の基本ステップ。" },
    ],
  },
];

const GARBLED_PATTERN = /(?:\?{3,}|[鬯繝郢譎驛鬩])/;
const SAMPLE_CARD_DEFINITIONS = Object.fromEntries(
  SEED_DECKS.flatMap((deck) => deck.cards.map((card) => [card.id, card.definition])),
);

function looksGarbled(value = "") {
  return GARBLED_PATTERN.test(String(value));
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (looksGarbled(text) && fallback && !looksGarbled(fallback)) return fallback;
  return text;
}

function normalizeCard(card) {
  const fallbackDefinition = SAMPLE_CARD_DEFINITIONS[card.id] || "";
  return {
    ...card,
    word: cleanText(card.word),
    definition: cleanText(card.definition, fallbackDefinition),
  };
}

function normalizeDeck(deck) {
  return {
    ...deck,
    name: cleanText(deck.name),
    author: cleanText(deck.author, "不明"),
    wordLang: normalizeLanguageValue(deck.wordLang),
    defLang: normalizeLanguageValue(deck.defLang),
    tags: (deck.tags || []).map((tag) => cleanText(tag)).filter(Boolean),
    cards: (deck.cards || []).map(normalizeCard),
  };
}

function normalizeDecks(decks = []) {
  return decks.map(normalizeDeck);
}

const uid = () => Math.random().toString(36).slice(2,9);
const shuffle = arr => [...arr].sort(()=>Math.random()-.5);

// AI API helper (prefer local Ollama, then fall back to hosted endpoints)
// 戻り値: { text: string, provider: string, fallbackUsed: boolean }
async function callAI(prompt, maxTokens = 1024) {
  const endpoints = [
    { url: "/api/ollama", provider: "ollama" },
    { url: "/api/groq",   provider: "groq"   },
    { url: "/api/gemini", provider: "gemini" },
  ];
  const errors = [];
  let attemptCount = 0;

  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, maxTokens }),
      });
      const isJson = (r.headers.get("content-type") || "").includes("application/json");
      const d = isJson ? await r.json() : { error: await r.text() };

      // 404 = エンドポイント未デプロイ → 次へフォールバック
      if (r.status === 404 && ep !== endpoints[endpoints.length - 1]) {
        errors.push({ provider: ep.provider, status: 404, message: "not deployed" });
        attemptCount++;
        continue;
      }
      // 429 = レート制限 → 次へフォールバック
      if (r.status === 429 && ep !== endpoints[endpoints.length - 1]) {
        errors.push({ provider: ep.provider, status: 429, message: d.error || "rate limited" });
        attemptCount++;
        continue;
      }
      // 503 = サーバー停止 → 次へフォールバック
      if (r.status === 503 && ep !== endpoints[endpoints.length - 1]) {
        errors.push({ provider: ep.provider, status: 503, message: d.error || "unavailable" });
        attemptCount++;
        continue;
      }
      if (!r.ok) {
        throw new Error(d.error || `AI request failed (${r.status})`);
      }
      if (!d.text) {
        throw new Error("AI returned an empty response");
      }
      return { text: d.text, provider: ep.provider, fallbackUsed: attemptCount > 0 };
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI request failed";
      errors.push({ provider: ep.provider, message });
      attemptCount++;
      if (ep === endpoints[endpoints.length - 1]) {
        console.error("[callAI] All providers failed:", JSON.stringify(errors));
        throw new Error("AIに接続できませんでした。しばらくしてから再試行してください。");
      }
    }
  }

  console.error("[callAI] Exhausted all endpoints:", JSON.stringify(errors));
  throw new Error("AIに接続できませんでした。しばらくしてから再試行してください。");
}

async function fetchDeckFromCacheOrGenerate(payload) {
  const response = await fetch("/api/deck-cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const result = isJson ? await response.json() : { error: await response.text() };

  if (!response.ok) {
    throw new Error(result.error || "単語帳の取得に失敗しました。");
  }

  return result;
}

// AI: single card definition
async function aiSuggest({term,wordLang,defLang,detailLevel,deckName,otherWords}) {
  const normalizedWordLang = normalizeLanguageValue(wordLang);
  const normalizedDefLang = normalizeLanguageValue(defLang);
  const wl = getLangLabel(normalizedWordLang);
  const dl = getLangLabel(normalizedDefLang);
  const lvl = DETAIL_LEVELS.find(l=>l.id===detailLevel) || DETAIL_LEVELS[1];
  const context = (otherWords || []).filter(Boolean).slice(0, 12).join(", ");
  const isTechnical = normalizedWordLang === "technical";
  const prompt = isTechnical
    ? [
        `Define the technical term "${term}" as it is commonly used in Japan, and write the definition in ${dl}.`,
        `Deck: ${deckName || "Untitled"}`,
        context ? `Related words: ${context}` : "",
        lvl.id === 1 ? "Return one short sentence." : lvl.id === 2 ? "Return 2-3 sentences." : "Return 4-6 sentences with examples.",
        `Use assertive, dictionary-style tone (断定・体言止め). Never use polite form (ですます調). Example: "〜すること。" "〜を指す。" "〜の手法。"`,
        `Do NOT start with the term name or "〜とは". Start directly with the definition content. For example, instead of "パーソンセンタードセラピーとは、カール・ロジャーズが..." write "カール・ロジャーズが..."`,
        "Return the definition only.",
      ].filter(Boolean).join("\n")
    : [
        `Translate the ${wl} word "${term}" into ${dl}.`,
        `Return only the translated word or short phrase in ${dl}. Do not add any explanation, examples, or extra sentences.`,
        context ? `Context (related words in this deck): ${context}` : "",
      ].filter(Boolean).join("\n");
  const maxTk = isTechnical
    ? (lvl.id===1 ? 80 : lvl.id===2 ? 200 : 500)
    : 30;
  const t0 = Date.now();
  try {
    const { text, provider, fallbackUsed } = await callAI(prompt, maxTk);
    trackEvent("generate_word", {
      input_word: term,
      generation_latency_ms: Date.now() - t0,
      generation_success: true,
      ai_provider: provider,
      fallback_used: fallbackUsed,
    });
    return text.trim();
  } catch (e) {
    trackEvent("generate_word", {
      input_word: term,
      generation_latency_ms: Date.now() - t0,
      generation_success: false,
      generation_error: e instanceof Error ? e.message : "Unknown error",
    });
    throw e;
  }
}

// AI: quiz evaluation
async function aiEval(term,correctDef,userAns,defLang) {
  try {
    const prompt = `Evaluate whether the learner answer matches the correct definition. Term: ${term}\nCorrect: ${correctDef}\nLearner: ${userAns}\nReturn JSON only: {"correct":true/false,"feedback":"short feedback in ${getLangLabel(normalizeLanguageValue(defLang))}"}`;
    const { text } = await callAI(prompt, 200);
    const cleaned = text.split("```json").join("").split("```").join("").trim();
    return JSON.parse(cleaned || '{"correct":false,"feedback":""}');
  } catch(e){ return {correct:false,feedback:"Could not evaluate the answer."}; }
}

// AI: mastery check
async function aiMastery(results) {
  try {
    const prompt = `Judge whether this study result means the learner mastered the deck. Result: ${JSON.stringify(results)}\nReturn JSON only: {"cleared":true/false,"message":"short message in Japanese"}`;
    const { text } = await callAI(prompt, 200);
    const cleaned = text.split("```json").join("").split("```").join("").trim();
    return JSON.parse(cleaned || '{"cleared":false,"message":""}');
  } catch(e){ return {cleared:false,message:"Mastery check could not be completed."}; }
}

function RichTextEditor({ value, onChange, placeholder, style, disabled }) {
  const taRef = useRef(null);

  const wrapSelection = (tag) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return;
    const before = value.substring(0, start);
    const selected = value.substring(start, end);
    const after = value.substring(end);
    const wrapped = `<${tag}>${selected}</${tag}>`;
    onChange(before + wrapped + after);

    setTimeout(() => {
      ta.focus();
      const newPos = start + wrapped.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <div className={`rt-container ${disabled ? "disabled" : ""}`} style={style}>
      <div className="rt-toolbar">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrapSelection("b"); }} className="rt-btn" title="太字"><b>B</b></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrapSelection("i"); }} className="rt-btn" title="斜体"><i>I</i></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrapSelection("u"); }} className="rt-btn" title="下線" style={{ textDecoration: "underline" }}>U</button>
      </div>
      <textarea
        ref={taRef}
        className="rt-textarea"
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

function LanguageInput({ value, onChange, includeSpecial = false }) {
  const filtered = includeSpecial ? LANGUAGES : LANGUAGES.filter((lang) => lang.code !== "technical");
  const options = includeSpecial ? filtered : [filtered.find((l) => l.code === "ja"), ...filtered.filter((l) => l.code !== "ja")];
  return (
    <select
      className="settings-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((lang) => (
        <option key={lang.code} value={lang.code}>{lang.native ? `${lang.label}(${lang.native})` : lang.label}</option>
      ))}
    </select>
  );
}

function SplashScreen() {
  const [logoFailed, setLogoFailed] = useState(false);
  const showImage = Boolean(SPLASH_LOGO_SRC) && !logoFailed;

  return (
    <div className="splash-screen" aria-label="flash auto スプラッシュスクリーン">
      <div className="splash-mark">
        {showImage ? (
          <>
            <img
              className="splash-logo-image"
              src={SPLASH_LOGO_SRC}
              alt={SPLASH_LOGO_ALT}
              onError={() => setLogoFailed(true)}
            />
            <span className="splash-logo-text">flash auto</span>
          </>
        ) : (
          <span className="splash-logo-text">flash auto</span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [decks, setDecks] = useState(() => {
    try {
      const saved = localStorage.getItem("mnemox_decks");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeDecks(parsed);
        }
      }
    } catch (e) {
      // データが壊れていた場合は無視してサンプルで起動
    }
    return normalizeDecks(SEED_DECKS);
  });
  const [view, setView] = useState("home");
  const [activeDeck, setActiveDeck] = useState(null);
  const [editDeck, setEditDeck] = useState(null);
  const [quizMode, setQuizMode] = useState("choice");
  const [toast, setToast] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [appCredits, setAppCredits] = useState(AI_GENERATE_DAILY_LIMIT);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const newUser = isNewUser();        // ID生成前に判定する
    const userId = getAnonymousUserId(); // 存在しなければここで生成
    if (!userId) return;
    if (newUser) {
      trackEvent("signup_guest");
    } else {
      trackEvent("return_visit");
    }
    trackEvent("app_open", { is_return: !newUser });
  }, []);

  useEffect(() => {
    const timerId = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timerId);
  }, []);

  // decksが変わるたびにlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem("mnemox_decks", JSON.stringify(decks));
    } catch (e) {
      // 容量オーバーなどで保存できなくても、アプリは止めない
    }
  }, [decks]);

  const showToast = useCallback((msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);},[]);
  const goHome = () => { setView("home"); setActiveDeck(null); setEditDeck(null); };
  const syncActive = (id) => normalizeDeck(decks.find(d=>d.id===id) || activeDeck);
  const openDetail = (deck) => { setActiveDeck(normalizeDeck(deck)); setView("detail"); };
  const startMode = (mode) => {
    if (mode==="flip") setView("flip");
    else if (mode==="quiz-choice") { setQuizMode("choice"); setView("quiz"); }
    else if (mode==="quiz-write")  { setQuizMode("write");  setView("quiz"); }
  };
  const saveDeck = (deck) => {
    const normalizedDeck = normalizeDeck(deck);
    setDecks(prev => {
      const ex = prev.find(d=>d.id===normalizedDeck.id);
      return ex ? prev.map(d=>d.id===normalizedDeck.id ? normalizedDeck : d) : [...prev, normalizedDeck];
    });
    showToast("保存しました"); goHome();
  };
  const saveGeneratedDeck = (deck) => {
    const normalizedDeck = normalizeDeck(deck);
    setDecks(prev=>[...prev, normalizedDeck]);
    setActiveDeck(normalizedDeck);
    setView("detail");
    showToast("単語帳を作成しました");
    trackEvent("save_deck", {
      deck_id: normalizedDeck.id,
      card_count: normalizedDeck.cards.length,
    });
  };
  const toggleFavorite = (id) => {
    setDecks(prev=>prev.map(d=>d.id===id
      ? {...d, favorited:!d.favorited, favCount:(d.favCount||0)+(d.favorited?-1:1)} : d));
  };
  const markCleared = (id) => setDecks(prev=>prev.map(d=>d.id===id?{...d,cleared:true}:d));
  const updateCard = (deckId, cardId, nw, nd) => {
    const patch = d => d.id===deckId ? normalizeDeck({...d,cards:d.cards.map(c=>c.id===cardId?{...c,word:nw,definition:nd}:c)}) : d;
    setDecks(prev=>prev.map(patch));
    setActiveDeck(prev=>prev&&prev.id===deckId ? patch(prev) : prev);
  };
  const addCard = (deckId, card) => {
    const patch = d => d.id===deckId ? normalizeDeck({...d,cards:[...d.cards,card]}) : d;
    setDecks(prev=>prev.map(patch));
    setActiveDeck(prev=>prev&&prev.id===deckId ? patch(prev) : prev);
  };
  const deleteCard = (deckId, cardId) => {
    const patch = d => d.id===deckId ? normalizeDeck({...d,cards:d.cards.filter(c=>c.id!==cardId)}) : d;
    setDecks(prev=>prev.map(patch));
    setActiveDeck(prev=>prev&&prev.id===deckId ? patch(prev) : prev);
  };
  const updateStreaks = (deckId, results) => {
    const patch = d => {
      if (d.id !== deckId) return d;
      const newCards = d.cards.map(c => {
        const r = results.find(x => x.id === c.id);
        if (!r) return c;
        return { ...c, streak: r.correct ? (c.streak || 0) + 1 : 0 };
      });
      const masteredIds = newCards.filter(c => (c.streak || 0) >= 2).map(c => c.id);
      return normalizeDeck({ ...d, cards: newCards, masteredIds });
    };
    setDecks(prev => prev.map(patch));
    setActiveDeck(prev => prev && prev.id === deckId ? patch(prev) : prev);
  };

  if (showSplash) {
    return (
      <div className="app">
        <Styles/>
        <SplashScreen/>
      </div>
    );
  }

  return (
    <div className="app">
      <Styles/>
      {toast && <Toast msg={toast.msg} type={toast.type}/>}
      <MobileDrawer open={menuOpen} onClose={()=>setMenuOpen(false)}
        credits={appCredits}
        onHome={()=>{goHome();setMenuOpen(false);}}
        onLibrary={()=>{setView("library");setMenuOpen(false);}}
        onGenerate={()=>{setView("generate");setMenuOpen(false);}}
        onNew={()=>{setEditDeck(null);setView("create");setMenuOpen(false);}}
        activeView={view}
      />
      {view==="home"      && <HomeView decks={decks} credits={appCredits} onOpenDetail={openDetail}
                               onNew={()=>{setEditDeck(null);setView("create");}}
                               onGenerate={()=>setView("generate")}
                               onLibrary={()=>setView("library")}
                               onToggleFav={toggleFavorite}
                               onEdit={d=>{setEditDeck(d);setView("create");}}
                               onDelete={id=>{setDecks(p=>p.filter(d=>d.id!==id));showToast("削除しました");}}
                               onMenuClick={()=>setMenuOpen(true)}
                               onSaveGeneratedDeck={saveGeneratedDeck}/>}
      {view==="library"   && <LibraryView decks={decks.filter(d=>d.isPublic)} onBack={goHome} onOpenDetail={openDetail} onToggleFav={toggleFavorite} onMenuClick={()=>setMenuOpen(true)} credits={appCredits}/>}
      {view==="generate"  && <GenerateView onSave={saveGeneratedDeck} onBack={goHome} showToast={showToast}/>}
      {view==="create"    && <CreateView initial={editDeck} onSave={saveDeck} onBack={goHome} showToast={showToast}/>}
      {view==="detail"    && activeDeck && <DetailView deck={syncActive(activeDeck.id)} onBack={goHome}
                               onStartMode={startMode}
                               onToggleFav={()=>toggleFavorite(activeDeck.id)}
                               onEdit={()=>{setEditDeck(syncActive(activeDeck.id));setView("create");}}
                               onDelete={()=>{setDecks(p=>p.filter(d=>d.id!==activeDeck.id));showToast("削除しました");goHome();}}
                               onUpdateCard={updateCard} onAddCard={addCard} onDeleteCard={deleteCard} showToast={showToast}/>}
      {view==="flip"      && activeDeck && <FlipView  deck={syncActive(activeDeck.id)} onBack={()=>{
        trackEvent("review_card", { deck_id: activeDeck.id, card_count: syncActive(activeDeck.id).cards.length, mode: "flip" });
        setView("detail");
      }}/>}
      {view==="quiz"      && activeDeck && <QuizView  deck={syncActive(activeDeck.id)} mode={quizMode} onBack={()=>setView("detail")} onCleared={markCleared} onUpdateStreaks={updateStreaks} showToast={showToast}/>}
      <FeedbackFab/>
    </div>
  );
}

// MOBILE DRAWER
function MobileDrawer({open,onClose,credits,onHome,onLibrary,onGenerate,onNew,activeView}) {
  const items = [
    { id:"home", label:"ホーム", icon:"🏠", action:onHome },
    { id:"my-library", label:"ライブラリ", icon:"📚", desc:"作成・保存した学習セット", action:onHome },
    { id:"library", label:"公開ライブラリ", icon:"🌐", action:onLibrary },
  ];
  return (
    <>
      <div className={`drawer-overlay ${open?"drawer-overlay-on":""}`} onClick={onClose}/>
      <nav className={`drawer ${open?"drawer-on":""}`}>
        <div className="drawer-header">
          <div className="sidebar-brand-mark">F</div>
          <div>
            <div className="sidebar-brand-title">Flash Auto</div>
            <div className="sidebar-brand-sub">学習セット</div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {items.map(item=>(
            <button key={item.id} className={`drawer-item ${activeView===item.id?"drawer-item-on":""}`} onClick={item.action}>
              <span className="drawer-item-icon">{item.icon}</span>
              <div>
                <div className="drawer-item-label">{item.label}</div>
                {item.desc && <div className="drawer-item-desc">{item.desc}</div>}
              </div>
            </button>
          ))}
          <div className="drawer-divider"/>
          <div className="drawer-credit">
            <svg className="credit-gem" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 10 12 22 22 10"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="12" y1="2" x2="7" y2="10"/><line x1="12" y1="2" x2="17" y2="10"/><line x1="7" y1="10" x2="12" y2="22"/><line x1="17" y1="10" x2="12" y2="22"/></svg>
            <span>クレジット残機: <strong>{credits}</strong></span>
          </div>
          <a className="drawer-feedback" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            💬 ご意見・不具合報告
          </a>
        </div>
      </nav>
    </>
  );
}

// FEEDBACK FAB
const FEEDBACK_FORM_URL = "https://forms.gle/6fggs7Ce7SoXBs9E8";

function FeedbackFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="feedback-fab" onClick={() => setOpen(true)} aria-label="フィードバック" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>ご意見</span>
      </button>
      {open && (
        <div className="feedback-overlay" onClick={() => setOpen(false)}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            <button className="feedback-close" onClick={() => setOpen(false)}>✕</button>
            <div className="feedback-modal-icon">💬</div>
            <h3 className="feedback-modal-title">ご意見・ご感想をお聞かせください</h3>
            <p className="feedback-modal-desc">
              Flash Autoをより良くするために、あなたの声を聞かせてください。<br/>
              使いやすさ・分かりにくかった点・不具合など、なんでもOKです。<br/>
              <strong>所要時間：約1分</strong>
            </p>
            <a
              className="nbtn accent feedback-modal-btn"
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              フィードバックを送る →
            </a>
            <button className="nbtn ghost feedback-modal-skip" onClick={() => setOpen(false)}>
              あとで
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// HOME
function AppSidebar({active,onHome,onLibrary,credits}) {
  const items = [
    { id: "home", label: "ホーム", icon: "🏠", action: onHome },
    { id: "my-library", label: "ライブラリ", icon: "📚", desc: "作成・保存した学習セット", action: onHome },
    { id: "library", label: "公開ライブラリ", icon: "🌐", action: onLibrary },
  ].filter((item)=>typeof item.action === "function");

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">F</div>
        <div>
          <div className="sidebar-brand-title">Flash Auto</div>
          <div className="sidebar-brand-sub">学習セット</div>
        </div>
      </div>

      <div className="sidebar-group">
        {items.map((item)=>(
          <button
            key={item.id}
            className={`sidebar-link ${active===item.id ? "sidebar-link-on" : ""}`}
            onClick={item.action}
            type="button"
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <div>
              <div>{item.label}</div>
              {item.desc && <div className="sidebar-link-desc">{item.desc}</div>}
            </div>
          </button>
        ))}
      </div>

      <div className="sidebar-credit-card">
        <svg className="credit-gem" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 10 12 22 22 10"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="12" y1="2" x2="7" y2="10"/><line x1="12" y1="2" x2="17" y2="10"/><line x1="7" y1="10" x2="12" y2="22"/><line x1="17" y1="10" x2="12" y2="22"/></svg>
        <span>クレジット残機: <strong>{credits !== undefined ? credits : "—"}</strong></span>
      </div>

      <a className="sidebar-feedback" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
        💬 ご意見・不具合報告
      </a>
    </aside>
  );
}

function HomeView({decks,credits,onOpenDetail,onNew,onGenerate,onLibrary,onToggleFav,onEdit,onDelete,onMenuClick,onSaveGeneratedDeck}) {
  const [filter,setFilter] = useState("all");
  const [quickTopic, setQuickTopic] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResult, setQuickResult] = useState(null);
  const [quickError, setQuickError] = useState("");
  const appOpenRef = useRef(Date.now());
  const QUICK_SAMPLES = ["AI入門", "量子力学の応用", "TOEFL初級", "経済学の応用", "心理学の基礎"];

  const handleQuickGenerate = async () => {
    if (!quickTopic.trim() || quickLoading) return;
    setQuickLoading(true);
    setQuickError("");
    setQuickResult(null);
    const t0 = Date.now();
    try {
      const userId = getAnonymousUserId();
      if (!userId) throw new Error("ユーザーIDを作成できませんでした。");
      const result = await fetchDeckFromCacheOrGenerate({
        action: "initial",
        topic: quickTopic.trim(),
        wordLang: "technical",
        defLang: "ja",
        detailLevel: 2,
        userId,
      });
      const cards = (result.deck?.cards || []).map(card => ({ id: uid(), word: card.word, definition: card.definition }));
      setQuickResult({
        id: "gen-" + uid(),
        name: result.deck?.deckName || quickTopic.trim(),
        author: "AIアシスタント",
        isPublic: false,
        wordLang: result.deck?.wordLang || "technical",
        defLang: result.deck?.defLang || "ja",
        detailLevel: result.deck?.detailLevel || 2,
        tags: result.deck?.tags || [],
        aiGenerated: true,
        cleared: false,
        masteredIds: [],
        favorited: false,
        favCount: 0,
        cards,
      });
      trackEvent("generate_theme_deck", {
        theme: quickTopic.trim(),
        deck_id: result.cacheId || null,
        generation_latency_ms: Date.now() - t0,
        time_to_first_generation: Date.now() - appOpenRef.current,
        generation_success: true,
        from_cache: result.source === "cache",
        action: "initial",
        source: "home_quick_generate",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成に失敗しました。";
      setQuickError(message);
      trackEvent("generate_theme_deck", {
        theme: quickTopic.trim(),
        generation_latency_ms: Date.now() - t0,
        generation_success: false,
        generation_error: message,
        action: "initial",
        source: "home_quick_generate",
      });
    } finally {
      setQuickLoading(false);
    }
  };

  const shown = filter==="fav" ? decks.filter(d=>d.favorited) : decks;
  const totalCards = decks.reduce((sum, deck)=>sum + deck.cards.length, 0);
  const favoriteCount = decks.filter((deck)=>deck.favorited).length;
  const publicCount = decks.filter((deck)=>deck.isPublic).length;
  return (
    <div className="page">
      <Navbar onMenuClick={onMenuClick} right={
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div className="credit-badge"><svg className="credit-gem" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 10 12 22 22 10"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="12" y1="2" x2="7" y2="10"/><line x1="12" y1="2" x2="17" y2="10"/><line x1="7" y1="10" x2="12" y2="22"/><line x1="17" y1="10" x2="12" y2="22"/></svg><span>{credits}</span></div>
          <button className="nbtn ai-btn" onClick={onGenerate}>✨ AI作成</button>
          <button className="nbtn primary" onClick={onNew}>手動作成</button>
        </div>
      }/>
      <div className="app-shell">
        <AppSidebar
          active="home"
          onHome={()=>setFilter("all")}
          onLibrary={onLibrary}
          credits={credits}
        />

        <main className="shell-main">
          <section className="dashboard-hero">
            <div className="section-kicker">AI単語帳</div>
            <h1 className="dashboard-title">何を学びたいですか？</h1>
            <p className="dashboard-copy">テーマを入力するだけで、AIが単語帳を自動生成します。</p>

            <div className="quick-gen-box">
              <div className="quick-gen-input-row">
                <input
                  className="quick-gen-input"
                  value={quickTopic}
                  onChange={e => setQuickTopic(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleQuickGenerate()}
                  placeholder="例：量子力学、TOEFL、経済学..."
                  disabled={quickLoading}
                />
                <button className="nbtn ai-btn quick-gen-btn" onClick={handleQuickGenerate} disabled={quickLoading || !quickTopic.trim()}>
                  {quickLoading ? "生成中..." : "✨ 生成"}
                </button>
              </div>
              <div className="quick-gen-samples">
                {QUICK_SAMPLES.map(s => (
                  <button key={s} className="sample-chip" onClick={() => setQuickTopic(s)} disabled={quickLoading}>{s}</button>
                ))}
              </div>
              {quickError && <div className="quick-gen-error">{quickError}</div>}
            </div>

            {quickResult && (
              <div className="quick-result-panel">
                <div className="quick-result-header">
                  <div>
                    <strong className="quick-result-name">{quickResult.name}</strong>
                    <span className="quick-result-meta"> · {quickResult.cards.length}語</span>
                  </div>
                  <button className="nbtn primary" onClick={() => onSaveGeneratedDeck(quickResult)}>この単語帳を保存</button>
                </div>
                <div className="quick-cards-grid">
                  {quickResult.cards.map(card => (
                    <div key={card.id} className="quick-card-item">
                      <div className="quick-card-word">{card.word}</div>
                      <div className="quick-card-def">{card.definition}</div>
                    </div>
                  ))}
                </div>
                <div className="quick-result-footer">
                  <button className="nbtn ghost" onClick={onGenerate}>詳細設定で再生成</button>
                  <button className="nbtn ghost" onClick={() => { setQuickResult(null); setQuickTopic(""); }}>クリア</button>
                </div>
              </div>
            )}

            <div className="dashboard-actions">
              <button className="nbtn ghost" onClick={onNew}>手動で作成する</button>
              <button className="nbtn ghost" onClick={onLibrary}>公開ライブラリを見る</button>
            </div>
            <div className="stats-row">
              <div className="stat-chip"><strong>{decks.length}</strong><span>セット</span></div>
              <div className="stat-chip"><strong>{totalCards}</strong><span>用語</span></div>
              <div className="stat-chip"><strong>{favoriteCount}</strong><span>お気に入り</span></div>
              <div className="stat-chip"><strong>{publicCount}</strong><span>公開中</span></div>
            </div>
          </section>

          <section className="set-section">
            <div className="section-head">
              <div>
                <div className="section-kicker">マイセット</div>
                <h2 className="section-heading">{filter==="fav" ? "お気に入りのセット" : "すべてのセット"}</h2>
              </div>
              <div className="filter-tabs">
                <button className={"ftab"+(filter==="all"?" ftab-on":"")} onClick={()=>setFilter("all")}>すべて</button>
                <button className={"ftab"+(filter==="fav"?" ftab-on":"")} onClick={()=>setFilter("fav")}>お気に入り</button>
              </div>
            </div>

            {shown.length===0 ? (
              <div className="empty-state empty-panel">
                <div className="empty-emoji">SET</div>
                <p>{filter==="fav" ? "お気に入りのセットはまだありません。" : "まだセットがありません。まずは1つ作成してください。"}</p>
                {filter==="all" && (
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
                    <button className="nbtn ai-btn" onClick={onGenerate}>✨ AI作成</button>
                    <button className="nbtn primary" onClick={onNew}>手動作成</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="set-feed">
                {shown.map((d)=>(
                  <DeckCard
                    key={d.id}
                    deck={d}
                    onClick={()=>onOpenDetail(d)}
                    onFav={(e)=>{e.stopPropagation();onToggleFav(d.id);}}
                    onEdit={(e)=>{e.stopPropagation();onEdit(d);}}
                    onDelete={(e)=>{e.stopPropagation();onDelete(d.id);}}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

// DECK CARD
function DeckCard({deck,onClick,onFav,onEdit,onDelete}) {
  const theme = getDeckTheme(deck);
  const previewWords = deck.cards.slice(0,3).map((card)=>card.word);
  return (
    <article className="study-set-card" onClick={onClick}>
      <div className="study-set-thumb" style={{background:theme.bg}}>
        <div className="tile-deco-a" style={{background:theme.accent}}/>
        <div className="tile-deco-b" style={{background:theme.accent}}/>
        <div className="study-set-icon">{theme.icon}</div>
        <div className="study-set-badges">
          {deck.aiGenerated && <span className="study-badge">AI</span>}
          {deck.cleared && <span className="study-badge">達成</span>}
        </div>
      </div>
      <div className="study-set-content">
        <div className="study-set-topline">
          <span className="study-set-type">{deck.author === "サンプル" ? "サンプルセット" : deck.isPublic ? "公開セット" : "マイセット"}</span>
          <div className="tile-fav-wrap">
            <button className={"fav-btn study-fav-btn"+(deck.favorited?" fav-on":"")} onClick={onFav}><svg width="28" height="28" viewBox="0 0 24 24" fill={deck.favorited?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
            {(deck.favCount||0)>0 && <span className="fav-count">{deck.favCount}</span>}
          </div>
        </div>
        <h3 className="study-set-title">{deck.name}</h3>
        <p className="study-set-meta">{deck.cards.length}語 ・ {getLangLabel(deck.wordLang)} → {getLangLabel(deck.defLang)} ・ 作成者 {deck.author || "あなた"}</p>
        <div className="study-set-preview">
          {previewWords.map((word)=>(
            <span key={word} className="study-preview-chip">{word}</span>
          ))}
        </div>
        {deck.tags&&deck.tags.length>0 && (
          <div className="tile-tags">{deck.tags.slice(0,3).map(t=><span key={t} className="tile-tag">{t}</span>)}</div>
        )}
        <div className="study-set-actions">
          <span className="study-set-link">セットを見る</span>
          {!deck.isPublic && (
            <div className="tile-actions">
            <button className="tile-act-btn" onClick={onEdit}>編集</button>
            <button className="tile-act-btn del" onClick={onDelete}>削除</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// AI GENERATE VIEW
function GenerateView({onSave,onBack,showToast}) {
  const [topic, setTopic] = useState("");
  const [wordLang, setWordLang] = useState("technical");
  const [defLang, setDefLang] = useState("ja");
  const [detailLevel, setDetailLevel] = useState(2);
  const [generated, setGenerated] = useState(null);
  const [generatedCacheId, setGeneratedCacheId] = useState(null);
  const [remainingCredits, setRemainingCredits] = useState(AI_GENERATE_DAILY_LIMIT);
  const [loading, setLoading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState("");
  const [newWord, setNewWord] = useState("");
  const [newDef, setNewDef] = useState("");

  const selectedDetail = DETAIL_LEVELS.find((item) => item.id === detailLevel) || DETAIL_LEVELS[1];

  const updateCard = (cardId, key, value) => {
    setGenerated((current) => {
      if (!current) return current;
      return {
        ...current,
        cards: current.cards.map((card) =>
          card.id === cardId ? { ...card, [key]: value } : card,
        ),
      };
    });
  };

  const deleteCard = (cardId) => {
    setGenerated((current) => {
      if (!current) return current;
      if (current.cards.length <= 1) {
        showToast("最後のカードは削除できません", "err");
        return current;
      }
      return {
        ...current,
        cards: current.cards.filter((card) => card.id !== cardId),
      };
    });
  };

  const addCard = () => {
    if (!newWord.trim() || !newDef.trim()) {
      showToast("単語と定義の両方を入力してください", "err");
      return;
    }
    setGenerated((current) => {
      if (!current) return current;
      return {
        ...current,
        cards: [
          ...current.cards,
          { id: uid(), word: newWord.trim(), definition: newDef.trim() },
        ],
      };
    });
    setNewWord("");
    setNewDef("");
  };

  const applyGeneratedDeckResult = (deck, cacheId, creditsLeft, fallbackDefLang) => {
    const cards = (deck?.cards || []).map((card) => ({
      id: uid(),
      word: card.word,
      definition: card.definition,
    }));

    setGenerated({
      id: "gen-" + uid(),
      name: deck?.deckName || topic.trim(),
      author: "AIアシスタント",
      isPublic: false,
      wordLang: deck?.wordLang || "technical",
      defLang: deck?.defLang || fallbackDefLang,
      detailLevel: deck?.detailLevel || detailLevel,
      tags: deck?.tags || [],
      aiGenerated: true,
      cleared: false,
      masteredIds: [],
      favorited: false,
      favCount: 0,
      cards,
    });
    setGeneratedCacheId(cacheId || null);
    if (typeof creditsLeft === "number") {
      setRemainingCredits(Math.max(0, creditsLeft));
    }
  };

  const startGenerate = async () => {
    if (!topic.trim()) {
      showToast("テーマを入力してください", "err");
      return;
    }

    setLoading(true);
    setError("");
    const t0 = Date.now();

    try {
      const normalizedDefLang = normalizeLanguageValue(defLang);
      const userId = getAnonymousUserId();
      if (!userId) {
        throw new Error("匿名ユーザーIDを作成できませんでした。");
      }

      const normalizedWordLang = normalizeLanguageValue(wordLang);
      const result = await fetchDeckFromCacheOrGenerate({
        action: "initial",
        topic: topic.trim(),
        wordLang: normalizedWordLang,
        defLang: normalizedDefLang,
        detailLevel,
        userId,
      });
      applyGeneratedDeckResult(result.deck, result.cacheId, result.remainingCredits, normalizedDefLang);
      trackEvent("generate_theme_deck", {
        theme: topic.trim(),
        deck_id: result.cacheId || null,
        generation_latency_ms: Date.now() - t0,
        generation_success: true,
        from_cache: result.source === "cache",
        action: "initial",
      });

      if (result.source === "cache") {
        showToast("既存の単語帳をキャッシュから表示しました");
      } else {
        showToast("新しい単語帳を生成しました");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成に失敗しました。";
      trackEvent("generate_theme_deck", {
        theme: topic.trim(),
        generation_latency_ms: Date.now() - t0,
        generation_success: false,
        generation_error: message,
        action: "initial",
      });
      setError(message);
      showToast(message, "err");
    } finally {
      setLoading(false);
    }
  };

  const continueGenerate = async () => {
    if (!generated) {
      showToast("先に単語帳を生成してください", "err");
      return;
    }

    setContinuing(true);
    setError("");
    const t0 = Date.now();

    try {
      const userId = getAnonymousUserId();
      if (!userId) {
        throw new Error("匿名ユーザーIDを作成できませんでした。");
      }

      const result = await fetchDeckFromCacheOrGenerate({
        action: "continue",
        cacheId: generatedCacheId,
        topic: topic.trim() || generated.name,
        defLang: generated.defLang,
        detailLevel: generated.detailLevel || detailLevel,
        userId,
        existingWords: generated.cards.map((card) => card.word),
      });

      const mergedDeck = {
        ...result.deck,
        deckName: result.deck?.deckName || generated.name,
        tags: result.deck?.tags || generated.tags,
        wordLang: result.deck?.wordLang || generated.wordLang,
        defLang: result.deck?.defLang || generated.defLang,
        detailLevel: result.deck?.detailLevel || generated.detailLevel,
        cards: result.deck?.deckName
          ? result.deck.cards
          : [...generated.cards.map(c => ({ word: c.word, definition: c.definition })), ...(result.deck?.cards || [])],
      };
      applyGeneratedDeckResult(mergedDeck, result.cacheId || generatedCacheId, result.remainingCredits, generated.defLang);
      trackEvent("generate_theme_deck", {
        theme: topic.trim() || generated.name,
        deck_id: result.cacheId || generatedCacheId || null,
        generation_latency_ms: Date.now() - t0,
        generation_success: true,
        added_count: result.addedCount || 0,
        action: "continue",
      });
      showToast(`${result.addedCount || 0}枚のカードを追加しました`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "続きの生成に失敗しました。";
      trackEvent("generate_theme_deck", {
        theme: topic.trim() || generated?.name,
        generation_latency_ms: Date.now() - t0,
        generation_success: false,
        generation_error: message,
        action: "continue",
      });
      setError(message);
      showToast(message, "err");
    } finally {
      setContinuing(false);
    }
  };

  const saveDeck = () => {
    if (!generated) return;
    onSave(generated);
  };

  return (
    <div className="page-shell">
      <Navbar
        left={<button className="nbtn ghost" onClick={onBack}>戻る</button>}
        center={<div className="nav-title">AI作成</div>}
      />

      <div className="hero-panel">
        <div className="section-title">学習単語帳を生成</div>
        <p style={{ color: "var(--text2)", marginTop: 8 }}>
          テーマを入力し、出力設定を選んで、生成されたカードを確認してから保存できます。
        </p>

        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span>テーマ</span>
            <input
              className="settings-select"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例：量子力学の入門（※1回につき10〜15枚のカードが生成されます）"
            />
            <span style={{ color: "var(--text3)", fontSize: 13 }}>
              例：量子力学の入門（※1回につき10〜15枚のカードが生成されます）
            </span>
          </label>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span>単語の言語</span>
              <LanguageInput value={wordLang} onChange={setWordLang} includeSpecial />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>定義の言語</span>
              <LanguageInput value={defLang} onChange={setDefLang} />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>説明の詳しさ</span>
              <select className="settings-select" value={detailLevel} onChange={(e) => setDetailLevel(Number(e.target.value))}>
                {DETAIL_LEVELS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ color: "var(--text3)", fontSize: 13, display: "grid", gap: 4 }}>
            <span>AI生成は基本10枚、必要なら超重要語句を最大5枚まで追加します / {selectedDetail.desc}</span>
            <span>匿名ユーザーごとに1日{AI_GENERATE_DAILY_LIMIT}クレジットです。キャッシュヒット時は消費せず、初回生成と続き追加が各1クレジットです。</span>
            {typeof remainingCredits === "number" && <span>残りクレジット: {remainingCredits}</span>}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="nbtn primary" onClick={startGenerate} disabled={loading}>
              {loading ? "生成中..." : "単語帳を生成"}
            </button>
            <button className="nbtn" onClick={onBack}>キャンセル</button>
          </div>

          {error && (
            <div style={{ color: "#b91c1c", background: "#fee2e2", padding: 12, borderRadius: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {generated && (
        <div className="hero-panel" style={{ marginTop: 18 }}>
          <div className="section-title">プレビュー</div>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            <strong>{generated.name}</strong>
            <div style={{ color: "var(--text2)", fontSize: 14 }}>
              {generated.cards.length}枚 / {getLangLabel(generated.defLang)}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {generated.cards.map((card, index) => (
              <div key={card.id} className="card-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>カード {index + 1}</strong>
                  <button className="nbtn danger" onClick={() => deleteCard(card.id)}>削除</button>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    className="settings-select"
                    value={card.word}
                    onChange={(e) => updateCard(card.id, "word", e.target.value)}
                    placeholder="単語"
                  />
                  <textarea
                    className="settings-select"
                    value={card.definition}
                    onChange={(e) => updateCard(card.id, "definition", e.target.value)}
                    placeholder="定義"
                    rows={4}
                    style={{ resize: "vertical" }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="card-card" style={{ marginTop: 16 }}>
            <strong>カードを追加</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <input
                className="settings-select"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="単語"
              />
              <textarea
                className="settings-select"
                value={newDef}
                onChange={(e) => setNewDef(e.target.value)}
                placeholder="定義"
                rows={3}
                style={{ resize: "vertical" }}
              />
              <div>
                <button className="nbtn" onClick={addCard}>カードを追加</button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button className="nbtn primary" onClick={saveDeck}>単語帳を保存</button>
            <button className="nbtn" onClick={startGenerate} disabled={loading}>再生成</button>
            <button className="nbtn" onClick={continueGenerate} disabled={continuing || loading || !generatedCacheId}>
              {continuing ? "追加生成中..." : "1クレジットで続きを5〜10枚追加"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function LibraryView({decks,onBack,onOpenDetail,onToggleFav,onMenuClick,credits}) {
  const [query,setQuery]=useState("");
  const [activeTag,setActiveTag]=useState(null);
  const allTags=[...new Set(decks.flatMap((deck)=>deck.tags||[]))].sort();
  const filtered=decks.filter((deck)=>{
    const q=query.toLowerCase().trim();
    const matchesQuery =
      !q ||
      deck.name.toLowerCase().includes(q) ||
      (deck.tags||[]).some((tag)=>tag.toLowerCase().includes(q));
    const matchesTag = !activeTag || (deck.tags||[]).includes(activeTag);
    return matchesQuery && matchesTag;
  });

  return (
    <div className="page">
      <Navbar onMenuClick={onMenuClick} right={<button className="nbtn ghost" onClick={onBack}>ホームへ戻る</button>} />

      <div className="app-shell">
        <AppSidebar
          active="library"
          onHome={onBack}
          onLibrary={()=>{}}
          credits={credits}
        />

        <main className="shell-main">
          <section className="dashboard-hero compact-hero">
            <div className="section-kicker">公開ライブラリ</div>
            <h1 className="dashboard-title">公開されている学習セットを探す</h1>
            <p className="dashboard-copy">人気タグで絞り込み、気になるセットを保存して自分の学習に取り込めます。</p>
            <div className="search-row">
              <input
                className="search-input"
                placeholder="単語帳名やタグで検索"
                value={query}
                onChange={(e)=>setQuery(e.target.value)}
              />
            </div>

            {allTags.length > 0 && (
              <div className="tag-row">
                <button className={`tag ${!activeTag ? "active" : ""}`} onClick={()=>setActiveTag(null)}>
                  すべて
                </button>
                {allTags.map((tag)=>(
                  <button
                    key={tag}
                    className={`tag ${activeTag===tag ? "active" : ""}`}
                    onClick={()=>setActiveTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="set-section">
            <div className="section-head">
              <div>
                <div className="section-kicker">検索結果</div>
                <h2 className="section-heading">{filtered.length}件のセット</h2>
              </div>
            </div>

            <div className="set-feed">
              {filtered.map((deck)=>(
                <DeckCard
                  key={deck.id}
                  deck={deck}
                  onClick={()=>onOpenDetail(deck)}
                  onFav={(e)=>{ e.stopPropagation(); onToggleFav(deck.id); }}
                  onEdit={(e)=>e.stopPropagation()}
                  onDelete={(e)=>e.stopPropagation()}
                />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function DetailView({deck,onBack,onStartMode,onToggleFav,onEdit,onDelete,onUpdateCard,onAddCard,onDeleteCard,showToast}) {
  const [editingId,setEditingId]=useState(null);
  const [editWord,setEditWord]=useState("");
  const [editDef,setEditDef]=useState("");
  const [newWord,setNewWord]=useState("");
  const [newDef,setNewDef]=useState("");
  const [generatingEdit,setGeneratingEdit]=useState(false);
  const [generatingNew,setGeneratingNew]=useState(false);

  const startEdit=(card)=>{
    setEditingId(card.id);
    setEditWord(card.word);
    setEditDef(card.definition);
  };

  const cancelEdit=()=>{
    setEditingId(null);
    setEditWord("");
    setEditDef("");
  };

  const saveEdit=()=>{
    if(!editWord.trim() || !editDef.trim()){
      showToast("単語と定義の両方を入力してください","err");
      return;
    }
    onUpdateCard(deck.id,editingId,editWord.trim(),editDef.trim());
    setEditingId(null);
    showToast("カードを更新しました");
  };

  const addCard=()=>{
    if(!newWord.trim() || !newDef.trim()){
      showToast("単語と定義の両方を入力してください","err");
      return;
    }
    onAddCard(deck.id,{id:uid(),word:newWord.trim(),definition:newDef.trim()});
    setNewWord("");
    setNewDef("");
    showToast("カードを追加しました");
  };

  const removeCard=(card)=>{
    if(deck.cards.length <= 1){
      showToast("最後のカードは削除できません","err");
      return;
    }
    onDeleteCard(deck.id,card.id);
    showToast(card.word + " を削除しました");
  };

  const generateEditDefinition = async () => {
    if (!editWord.trim()) {
      showToast("先に単語を入力してください", "err");
      return;
    }
    setGeneratingEdit(true);
    try {
      const definition = await aiSuggest({
        term: editWord.trim(),
        wordLang: deck.wordLang || "ja",
        defLang: deck.defLang || "ja",
        detailLevel: deck.detailLevel || 2,
        deckName: deck.name,
        otherWords: (deck.cards || [])
          .filter((card)=>card.id !== editingId)
          .map((card)=>card.word),
      });
      setEditDef(definition);
      showToast("定義を生成しました");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI生成に失敗しました", "err");
    } finally {
      setGeneratingEdit(false);
    }
  };

  const generateNewDefinition = async () => {
    if (!newWord.trim()) {
      showToast("先に単語を入力してください", "err");
      return;
    }
    setGeneratingNew(true);
    try {
      const definition = await aiSuggest({
        term: newWord.trim(),
        wordLang: deck.wordLang || "ja",
        defLang: deck.defLang || "ja",
        detailLevel: deck.detailLevel || 2,
        deckName: deck.name,
        otherWords: (deck.cards || []).map((card)=>card.word),
      });
      setNewDef(definition);
      showToast("定義を生成しました");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI生成に失敗しました", "err");
    } finally {
      setGeneratingNew(false);
    }
  };

  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewFlipped, setPreviewFlipped] = useState(false);

  const previewCard = deck.cards[previewIdx] || deck.cards[0];
  const previewPrev = () => { if (previewIdx > 0) { setPreviewFlipped(false); setPreviewIdx(i => i - 1); } };
  const previewNext = () => { if (previewIdx < deck.cards.length - 1) { setPreviewFlipped(false); setPreviewIdx(i => i + 1); } };

  const [testSubMenu, setTestSubMenu] = useState(false);
  const modes=[
    { id:"flip", label:"フラッシュカード", desc:"1枚ずつカードをめくって確認します。", color:"#22c55e" },
    { id:"quiz-choice", label:"4択クイズ", desc:"4つの選択肢から答えます。", color:"#0ea5e9" },
    { id:"quiz-write", label:"記述クイズ", desc:"答えを自分で入力します。", color:"#f97316" },
    { id:"test", label:"テスト", desc:"全問正解で単語帳クリア！形式を選べます。", color:"#8b5cf6" },
  ];
  const masteredCount = (deck.masteredIds || []).length;

  return (
    <div className="page detail-page">
      <Navbar
        left={<button className="nbtn ghost" onClick={onBack}>戻る</button>}
        center={<div className="study-deck-title">学習セット</div>}
        right={(
          <div style={{ display:"flex", gap:8 }}>
            <button className={"nbtn fav-heart-btn"+(deck.favorited?" fav-on":"")} onClick={onToggleFav}><svg width="24" height="24" viewBox="0 0 24 24" fill={deck.favorited?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
            <button className="nbtn" onClick={onEdit}>単語帳編集</button>
            <button className="nbtn danger" onClick={onDelete}>削除</button>
          </div>
        )}
      />

      <section className="set-header-card">
        <div className="set-header-main">
          <div className="section-kicker">{deck.author === "サンプル" ? "サンプルセット" : deck.isPublic ? "公開セット" : "マイセット"}</div>
          <h1 className="set-header-title">{deck.name}</h1>
          <p className="set-header-copy">セット概要を確認してから、フラッシュカードかクイズにすぐ入れる構成です。</p>
          <div className="set-meta-grid">
            <div className="set-meta-card"><span>用語数</span><strong>{deck.cards.length}</strong></div>
            <div className="set-meta-card"><span>保存数</span><strong>{deck.favCount || 0}</strong></div>
            <div className="set-meta-card"><span>習得済み</span><strong>{masteredCount}</strong></div>
            <div className="set-meta-card"><span>言語</span><strong>{getLangLabel(deck.wordLang)} → {getLangLabel(deck.defLang)}</strong></div>
          </div>
          {deck.tags?.length ? (
            <div className="tile-tags detail-tags">
              {deck.tags.map((tag)=><span key={tag} className="tile-tag">{tag}</span>)}
            </div>
          ) : null}
        </div>

        <div className="set-action-row">
          <button className="nbtn primary" onClick={()=>onStartMode("flip")}>フラッシュカード開始</button>
          <button className="nbtn ghost" onClick={()=>onStartMode("quiz-choice")}>4択クイズ</button>
          <button className="nbtn ghost" onClick={()=>onStartMode("quiz-write")}>記述クイズ</button>
          <button className="nbtn ghost" style={{ borderColor: "#8b5cf6", color: "#8b5cf6" }} onClick={()=>setTestSubMenu(true)}>テスト</button>
        </div>
      </section>

      <section className="set-section">
        <div className="section-head">
          <div>
            <div className="section-kicker">プレビュー</div>
            <h2 className="section-heading">単語カード</h2>
          </div>
        </div>
        <div className="detail-flip-area">
          <button
            type="button"
            className={"detail-flip-card" + (previewFlipped ? " flipped" : "")}
            onClick={() => setPreviewFlipped(v => !v)}
          >
            <div className="detail-flip-inner">
              <div className="detail-flip-face detail-flip-front">
                <div className="detail-flip-text">{previewCard?.word || "-"}</div>
              </div>
              <div className="detail-flip-face detail-flip-back">
                <div className="detail-flip-text">{previewCard?.definition || "-"}</div>
              </div>
            </div>
          </button>
          <div className="detail-flip-nav">
            <button
              className={"flip-arrow-btn" + (previewIdx === 0 ? " disabled" : "")}
              onClick={previewPrev}
              disabled={previewIdx === 0}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="flip-counter">{previewIdx + 1} / {deck.cards.length}</span>
            <button
              className={"flip-arrow-btn" + (previewIdx === deck.cards.length - 1 ? " disabled" : "")}
              onClick={previewNext}
              disabled={previewIdx === deck.cards.length - 1}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </section>

      <section className="set-section">
        <div className="section-head">
          <div>
            <div className="section-kicker">学習モード</div>
            <h2 className="section-heading">このセットの学習方法</h2>
          </div>
        </div>
        <div className="mode-grid">
          {modes.map((mode)=>(
            <button key={mode.id} className="mode-big-btn" style={{ "--mc": mode.color }} onClick={()=>{
              if (mode.id === "test") { setTestSubMenu(true); } else { onStartMode(mode.id); }
            }}>
              <strong>{mode.label}</strong>
              <span>{mode.desc}</span>
            </button>
          ))}
        </div>

        {testSubMenu && (
          <div className="test-submenu-overlay" onClick={() => setTestSubMenu(false)}>
            <div className="test-submenu-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>テスト形式を選択</h3>
              <p style={{ margin: "0 0 16px", color: "var(--text3)", fontSize: 14 }}>全問正解すると単語帳をクリアできます。</p>
              <div style={{ display: "grid", gap: 10 }}>
                <button className="mode-big-btn" style={{ "--mc": "#0ea5e9" }} onClick={() => { setTestSubMenu(false); onStartMode("quiz-choice"); }}>
                  <strong>選択式テスト</strong>
                  <span>4つの選択肢から正しい定義を選びます。</span>
                </button>
                <button className="mode-big-btn" style={{ "--mc": "#f97316" }} onClick={() => { setTestSubMenu(false); onStartMode("quiz-write"); }}>
                  <strong>記述式テスト</strong>
                  <span>定義を自分で書いて答えます。</span>
                </button>
              </div>
              <button className="nbtn ghost" style={{ marginTop: 12, width: "100%" }} onClick={() => setTestSubMenu(false)}>キャンセル</button>
            </div>
          </div>
        )}
      </section>

      <div className="detail-layout">
        <section className="terms-panel">
          <div className="section-head">
            <div>
              <div className="section-kicker">用語一覧</div>
              <h2 className="section-heading">セット内容</h2>
            </div>
          </div>
          <div className="terms-list">
          {deck.cards.map((card,index)=>{
            const isEditing = editingId===card.id;
            return (
              <div key={card.id} className={`term-row ${isEditing ? "term-row-editing" : ""}`}>
                <div className="term-index">{index + 1}</div>
                {isEditing ? (
                  <div className="term-edit-panel">
                    <div className="term-edit-grid">
                      <input className="settings-select" value={editWord} onChange={(e)=>setEditWord(e.target.value)} placeholder="単語" />
                      <textarea
                        className="settings-select"
                        value={editDef}
                        onChange={(e)=>setEditDef(e.target.value)}
                        placeholder="定義"
                        rows={4}
                        style={{ resize:"vertical" }}
                      />
                    </div>
                    <div className="term-actions">
                      <button className="nbtn" onClick={generateEditDefinition} disabled={generatingEdit}>
                        {generatingEdit ? "生成中..." : "定義を生成"}
                      </button>
                      <button className="nbtn primary" onClick={saveEdit}>保存</button>
                      <button className="nbtn ghost" onClick={cancelEdit}>キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="term-cell">
                      <span className="term-label">単語</span>
                      <div className="term-value">{card.word}</div>
                    </div>
                    <div className="term-cell">
                      <span className="term-label">定義</span>
                      <div className="term-value">{card.definition}</div>
                    </div>
                    <div className="term-actions">
                      <button className="nbtn ghost icon-btn" onClick={()=>startEdit(card)} title="編集">&#9998;</button>
                      <button className="nbtn danger icon-btn" onClick={()=>removeCard(card)} title="削除">&#128465;</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          </div>
        </section>

      </div>
    </div>
  );
}

function AutoTextarea({value, ...props}) {
  const ref = useRef(null);
  useEffect(()=>{
    if(ref.current){ref.current.style.height="auto";ref.current.style.height=ref.current.scrollHeight+"px";}
  },[value]);
  return <textarea ref={ref} value={value} {...props} />;
}

function CreateView({initial,onSave,onBack,showToast}) {
  const isEdit = !!initial;
  const [name,setName]=useState(initial?.name || "");
  const [isPublic,setIsPublic]=useState(initial?.isPublic ?? true);
  const [wordLang,setWordLang]=useState(normalizeLanguageValue(initial?.wordLang, "en"));
  const [defLang,setDefLang]=useState(normalizeLanguageValue(initial?.defLang, "ja"));
  const [detailLevel,setDetailLevel]=useState(initial?.detailLevel || 2);
  const [tags,setTags]=useState(initial?.tags || []);
  const [tagInput,setTagInput]=useState("");
  const [cards,setCards]=useState(initial?.cards?.length ? initial.cards : [{ id:uid(), word:"", definition:"" }]);
  const [generatingCardId,setGeneratingCardId]=useState(null);
  const [autoAI,setAutoAI]=useState(true);
  const cardsRef = useRef(cards);
  useEffect(()=>{ cardsRef.current = cards; }, [cards]);

  const updateCard=(id,field,value)=>{
    setCards((prev)=>prev.map((card)=>card.id===id ? { ...card, [field]: value } : card));
  };

  const addCard=()=>{
    setCards((prev)=>[...prev,{ id:uid(), word:"", definition:"" }]);
  };

  const deleteCard=(id)=>{
    if(cards.length <= 1){
      showToast("最後のカードは削除できません","err");
      return;
    }
    setCards((prev)=>prev.filter((card)=>card.id!==id));
  };

  const addTag=()=>{
    const raw = tagInput.trim().replace(/^#+/,"");
    if(!raw) return;
    const nextTag = "#" + raw;
    if(!tags.includes(nextTag)) setTags((prev)=>[...prev,nextTag]);
    setTagInput("");
  };

  const removeTag=(tag)=>{
    setTags((prev)=>prev.filter((item)=>item!==tag));
  };

  const generateCardDefinition = async (cardId) => {
    const latest = cardsRef.current;
    const target = latest.find((card)=>card.id===cardId);
    if (!target?.word.trim()) {
      showToast("先に単語を入力してください", "err");
      return;
    }
    setGeneratingCardId(cardId);
    try {
      const definition = await aiSuggest({
        term: target.word.trim(),
        wordLang,
        defLang,
        detailLevel,
        deckName: name,
        otherWords: latest.filter((card)=>card.id!==cardId).map((card)=>card.word),
      });
      updateCard(cardId, "definition", definition);
      showToast("定義を生成しました");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI生成に失敗しました", "err");
    } finally {
      setGeneratingCardId(null);
    }
  };

  const handleWordBlur = (cardId) => {
    if (!autoAI) return;
    setTimeout(() => {
      const latest = cardsRef.current;
      const target = latest.find((card)=>card.id===cardId);
      if (!target?.word.trim() || target.definition.trim()) return;
      generateCardDefinition(cardId);
    }, 100);
  };

  const handleSave=()=>{
    if(!name.trim()){
      showToast("単語帳名を入力してください","err");
      return;
    }

    const validCards = cards
      .map((card)=>({ ...card, word: card.word.trim(), definition: card.definition.trim() }))
      .filter((card)=>card.word && card.definition);

    if(validCards.length === 0){
      showToast("少なくとも1枚のカードを追加してください","err");
      return;
    }

    onSave({
      id: isEdit ? initial.id : "my-" + uid(),
      name: name.trim(),
      isPublic,
      wordLang: normalizeLanguageValue(wordLang),
      defLang: normalizeLanguageValue(defLang),
      detailLevel,
      tags,
      author: isEdit ? initial.author : "あなた",
      cards: validCards,
      cleared: isEdit ? initial.cleared : false,
      masteredIds: isEdit ? (initial.masteredIds || []) : [],
      favorited: isEdit ? (initial.favorited || false) : false,
      favCount: isEdit ? (initial.favCount || 0) : 0,
      aiGenerated: isEdit ? (initial.aiGenerated || false) : false,
    });
  };

  return (
    <div className="page">
      <Navbar
        left={<button className="nbtn ghost" onClick={onBack}>戻る</button>}
        center={<span className="nav-center-title">{isEdit ? "単語帳を編集" : "単語帳を作成"}</span>}
        right={<button className="nbtn primary" onClick={handleSave}>保存</button>}
      />

      <div style={{ maxWidth:800, margin:"0 auto", padding:"24px 0 100px" }}>
        <input className="create-name-input" placeholder="タイトルをつけてください" value={name} onChange={(e)=>setName(e.target.value)} />

        <div className="settings-card">
          <div className="create-lang-grid">
            <label style={{ display:"grid", gap:8 }}>
              <span className="settings-label">単語の言語</span>
              <LanguageInput value={wordLang} onChange={setWordLang} includeSpecial />
            </label>

            <label style={{ display:"grid", gap:8 }}>
              <span className="settings-label">定義の言語</span>
              <LanguageInput value={defLang} onChange={setDefLang} />
            </label>
          </div>

          {wordLang === "technical" && (
            <div style={{ color: "var(--text3)", fontSize: 13, marginTop:8 }}>
              専門用語は、日本国内で一般的に使われている用語として扱います。
            </div>
          )}

          <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"end", marginTop:14 }}>
            {wordLang === "technical" && (
              <label style={{ display:"grid", gap:8, flex:"0 0 auto", minWidth:140 }}>
                <span className="settings-label">説明の詳しさ</span>
                <select className="settings-select" value={detailLevel} onChange={(e)=>setDetailLevel(Number(e.target.value))}>
                  {DETAIL_LEVELS.map((level)=>(
                    <option key={level.id} value={level.id}>{level.label}</option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:4 }}>
              <input type="checkbox" checked={autoAI} onChange={(e)=>setAutoAI(e.target.checked)} />
              <span className="settings-label">AIで定義を自動生成</span>
            </label>

            <label style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:4 }}>
              <input type="checkbox" checked={isPublic} onChange={(e)=>setIsPublic(e.target.checked)} />
              <span className="settings-label">公開単語帳にする</span>
            </label>
          </div>
        </div>

        <div className="settings-card" style={{ marginTop:18 }}>
          <div className="section-title">タグ</div>
          <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
            <input className="settings-select" value={tagInput} onChange={(e)=>setTagInput(e.target.value)} placeholder="＃タグを追加" />
            <button className="nbtn" onClick={addTag}>タグ追加</button>
          </div>
          {tags.length > 0 && (
            <div className="tag-row" style={{ marginTop:12 }}>
              {tags.map((tag)=>(
                <button key={tag} className="tag active" onClick={()=>removeTag(tag)}>{tag}</button>
              ))}
            </div>
          )}
        </div>

        <div className="settings-card" style={{ marginTop:18 }}>
          <div className="section-title">カード</div>
          <div style={{ display:"grid", gap:12, marginTop:16 }}>
            {cards.map((card,index)=>(
              <div key={card.id} className="card-card">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <strong>{index + 1}</strong>
                  <button className="nbtn danger" onClick={()=>deleteCard(card.id)}>削除</button>
                </div>
                <div className="create-card-fields">
                  <div style={{ flex:1, paddingRight:16, borderRight:"2px solid var(--border)", display:"flex", flexDirection:"column" }}>
                    <input className="settings-select" value={card.word} onChange={(e)=>updateCard(card.id,"word",e.target.value)} onBlur={()=>handleWordBlur(card.id)} placeholder="単語を入力" style={{ width:"100%", border:"none", borderBottom:"2px solid var(--accent)", borderRadius:0, background:"transparent", paddingLeft:0 }} />
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>用語</div>
                  </div>
                  <div style={{ flex:1, paddingLeft:16, display:"flex", flexDirection:"column" }}>
                    <AutoTextarea className="settings-select" value={card.definition} onChange={(e)=>updateCard(card.id,"definition",e.target.value)} placeholder={generatingCardId===card.id ? "生成中..." : "定義を入力"} disabled={generatingCardId===card.id} rows={1} style={{ width:"100%", border:"none", borderBottom:"2px solid var(--accent)", borderRadius:0, background:"transparent", paddingLeft:0, resize:"none", overflow:"hidden", fontFamily:"inherit", fontSize:"inherit", lineHeight:"1.5" }} />
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>{generatingCardId===card.id ? "AI生成中..." : "定義"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:14 }}>
            <button className="nbtn primary" onClick={addCard}>カードを追加</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlipView({deck,onBack}) {
  const cards = deck?.cards || [];
  const [qi, setQi] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [frontIsWord, setFrontIsWord] = useState(true);
  const [slideDir, setSlideDir] = useState(null);

  useEffect(() => {
    setQi(0);
    setFlipped(false);
  }, [deck?.id]);

  if (!cards.length) {
    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">{deck?.name || "無題"}</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="study-wrap">
          <div className="empty-state">
            <h3>カードがありません</h3>
            <p>フラッシュカードを始める前にカードを追加してください。</p>
          </div>
        </div>
      </div>
    );
  }

  const card = cards[qi];
  const frontText = frontIsWord ? card.word : card.definition;
  const backText = frontIsWord ? card.definition : card.word;

  const goPrev = () => {
    if (qi === 0) return;
    setSlideDir("left");
    setFlipped(false);
    setTimeout(() => {
      setQi((i) => i - 1);
      setSlideDir(null);
    }, 200);
  };

  const goNext = () => {
    if (qi === cards.length - 1) return;
    setSlideDir("right");
    setFlipped(false);
    setTimeout(() => {
      setQi((i) => i + 1);
      setSlideDir(null);
    }, 200);
  };

  return (
    <div className="study-page">
      <div className="study-nav">
        <button className="nbtn ghost" onClick={onBack}>← 戻る</button>
        <span className="study-deck-title">{deck.name}</span>
        <button className="mode-switch-btn" onClick={() => { setFrontIsWord((f) => !f); setFlipped(false); }}>
          {frontIsWord ? "🔄 単語が表" : "🔄 定義が表"}
        </button>
      </div>

      <div className="flip-view-body">
        <button
          type="button"
          className={"flip-card " + (flipped ? "flipped" : "") + (slideDir ? " slide-" + slideDir : "")}
          onClick={() => setFlipped((v) => !v)}
        >
          <div className="flip-card-inner">
            <div className="flip-card-face flip-card-front">
              <div className="flip-card-text">{frontText || "-"}</div>
            </div>
            <div className="flip-card-face flip-card-back">
              <div className="flip-card-text">{backText || "-"}</div>
            </div>
          </div>
        </button>

        <div className="flip-nav-row">
          <button
            className={"flip-arrow-btn" + (qi === 0 ? " disabled" : "")}
            onClick={goPrev}
            disabled={qi === 0}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="flip-counter">{qi + 1} / {cards.length}</span>
          <button
            className={"flip-arrow-btn" + (qi === cards.length - 1 ? " disabled" : "")}
            onClick={goNext}
            disabled={qi === cards.length - 1}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function QuizView({deck,mode,onBack,onCleared,onUpdateStreaks,showToast}) {
  const cards = deck?.cards || [];
  const [answerDir, setAnswerDir] = useState(null); // "def" = show word, answer def; "word" = show def, answer word
  const [queue, setQueue] = useState(() => shuffle(cards));
  const [qi, setQi] = useState(0);
  const [choices, setChoices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [answering, setAnswering] = useState(false);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);
  const [startTime, setStartTime] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);

  const resetQuiz = () => {
    const shuffled = shuffle(cards);
    setQueue(shuffled);
    setQi(0);
    setSelectedId(null);
    setInput("");
    setFeedback("");
    setResults([]);
    setDone(false);
    setStartTime(Date.now());
  };

  useEffect(() => {
    resetQuiz();
    setAnswerDir(null);
  }, [deck?.id, cards.length]);

  // Helper: what to show as question and what is the answer
  const getQA = (card) => {
    if (!card) return { question: "-", answer: "-" };
    if (answerDir === "word") return { question: card.definition, answer: card.word };
    return { question: card.word, answer: card.definition };
  };

  useEffect(() => {
    if (mode !== "choice" || !answerDir) return;
    const current = queue[qi];
    if (!current) {
      setChoices([]);
      return;
    }
    const others = shuffle(cards.filter((c) => c.id !== current.id)).slice(0, 3);
    setChoices(shuffle([current, ...others]));
  }, [mode, qi, queue, cards, answerDir]);

  if (!cards.length) {
    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">クイズ: {deck?.name || "無題"}</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="study-wrap">
          <div className="empty-state">
            <h3>カードがありません</h3>
            <p>クイズを始める前にカードを追加してください。</p>
          </div>
        </div>
      </div>
    );
  }

  // Direction selection screen
  if (!answerDir) {
    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">{mode === "choice" ? "4択クイズ" : "記述クイズ"}: {deck.name}</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="quiz-dir-wrap">
          <h2 className="quiz-dir-title">解答形式を選んでください</h2>
          <p className="quiz-dir-sub">{deck.cards.length}問 ・ {mode === "choice" ? "4択" : "記述"}</p>
          <div className="quiz-dir-grid">
            <button className="quiz-dir-btn" onClick={() => { resetQuiz(); setAnswerDir("def"); }}>
              <strong>定義を解答</strong>
              <span>単語を見て、定義を答えます</span>
            </button>
            <button className="quiz-dir-btn" onClick={() => { resetQuiz(); setAnswerDir("word"); }}>
              <strong>単語を解答</strong>
              <span>定義を見て、単語を答えます</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = queue[qi];
  const correctCount = results.filter((r) => r.correct).length;
  const percent = cards.length ? Math.round((correctCount / cards.length) * 100) : 0;

  const finishQuiz = async (finalResults) => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    setElapsedSec(elapsed);
    onUpdateStreaks(deck.id, finalResults);
    trackEvent("review_card", {
      deck_id: deck.id,
      card_count: finalResults.length,
      correct_count: finalResults.filter((r) => r.correct).length,
      mode: mode === "choice" ? "quiz_choice" : "quiz_write",
      elapsed_sec: elapsed,
    });
    if (finalResults.every((r) => r.correct)) {
      onCleared(deck.id);
      showToast?.("単語帳達成です！", "success");
      setDone(true);
      return;
    }

    try {
      const mastery = await aiMastery(finalResults);
      if (mastery.cleared) {
        onCleared(deck.id);
        showToast?.(mastery.message || "単語帳達成です！", "success");
      } else if (mastery.message) {
        showToast?.(mastery.message, "info");
      }
    } catch {
      // Ignore AI mastery failures and keep the local result screen.
    }
    setDone(true);
  };

  const commitResult = async (isCorrect, message) => {
    const nextResults = [...results, { id: current.id, correct: isCorrect }];
    setResults(nextResults);
    setFeedback(message);

    if (qi >= queue.length - 1) {
      await finishQuiz(nextResults);
      return;
    }

    setTimeout(() => {
      setQi((i) => i + 1);
      setSelectedId(null);
      setInput("");
      setFeedback("");
      setAnswering(false);
    }, 700);
  };

  const submitChoice = async (choice) => {
    if (!current || selectedId || done) return;
    const ok = choice.id === current.id;
    setSelectedId(choice.id);
    const { answer } = getQA(current);
    await commitResult(ok, ok ? "正解" : "答え: " + answer);
  };

  const submitWrite = async () => {
    if (!current || answering || done) return;
    const guess = input.trim();
    if (!guess) return;

    setAnswering(true);
    const { answer } = getQA(current);
    let ok = false;
    let message = "もう一度挑戦してください";

    const normalizedGuess = guess.toLowerCase();
    const normalizedAnswer = String(answer || "").trim().toLowerCase();
    if (normalizedGuess && normalizedGuess === normalizedAnswer) {
      ok = true;
      message = "正解";
    } else {
      try {
        const judged = await aiEval(current.word, current.definition, guess, deck.defLang);
        ok = Boolean(judged?.correct);
        message = judged?.feedback || (ok ? "正解" : "答え: " + answer);
      } catch {
        ok = false;
        message = "答え: " + answer;
      }
    }

    await commitResult(ok, message);
  };

  if (done) {
    const incorrectCount = cards.length - correctCount;
    const formatTime = (sec) => {
      if (sec < 60) return `${sec}秒`;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return s > 0 ? `${m}分${s}秒` : `${m}分`;
    };

    // 暗記率を計算: 今回の結果を反映した各カードのstreakから判定
    const masteryMap = cards.map(c => {
      const r = results.find(x => x.id === c.id);
      const prevStreak = c.streak || 0;
      const newStreak = r ? (r.correct ? prevStreak + 1 : 0) : prevStreak;
      return { id: c.id, mastered: newStreak >= 2 };
    });
    const masteredCount = masteryMap.filter(m => m.mastered).length;
    const masteryPercent = cards.length ? Math.round((masteredCount / cards.length) * 100) : 0;

    const isChoiceMode = mode === "choice";

    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">{isChoiceMode ? "クイズ結果" : "テスト結果"}</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="study-wrap">
          <div className="result-summary-card">
            <div className="result-time">あなたのタイム：{formatTime(elapsedSec)}</div>

            <div className="result-donut-row">
              <ResultDonut percent={percent} />
              <div className="result-stats">
                <div className="result-stat-item">
                  <span className="result-stat-label" style={{ color: "var(--accent)" }}>正解</span>
                  <span className="result-stat-value result-stat-correct">{correctCount}</span>
                </div>
                <div className="result-stat-item">
                  <span className="result-stat-label" style={{ color: "var(--coral)" }}>不正解</span>
                  <span className="result-stat-value result-stat-incorrect">{incorrectCount}</span>
                </div>
              </div>
            </div>

            {isChoiceMode && (
              <div className="mastery-section">
                <div className="mastery-header">達成度（暗記率）</div>
                <div className="mastery-sub">2回連続正解で暗記と判定されます</div>
                <div className="result-donut-row" style={{ marginTop: 16 }}>
                  <ResultDonut percent={masteryPercent} colorVar="--green" bgColorVar="--border" />
                  <div className="result-stats">
                    <div className="result-stat-item">
                      <span className="result-stat-label" style={{ color: "var(--green)" }}>暗記済み</span>
                      <span className="result-stat-value" style={{ color: "var(--green)", border: "2px solid var(--green)", background: "var(--green-dim)" }}>{masteredCount}</span>
                    </div>
                    <div className="result-stat-item">
                      <span className="result-stat-label" style={{ color: "var(--text3)" }}>未暗記</span>
                      <span className="result-stat-value" style={{ color: "var(--text3)", border: "2px solid var(--border)", background: "var(--surface2)" }}>{cards.length - masteredCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="result-message">
              {percent === 100
                ? "満点です！すべてのカードをマスターしました。"
                : percent >= 70
                  ? "よく頑張りました。間違えたカードを復習しましょう。"
                  : "間違えたカードを見直して再挑戦しましょう。"}
            </div>

            <div className="result-answers-title">あなたの回答</div>
            <div className="result-answers-list">
              {queue.map((card, i) => {
                const r = results[i];
                const m = isChoiceMode ? masteryMap.find(x => x.id === card.id) : null;
                return (
                  <div key={card.id} className={`result-answer-row ${r?.correct ? "correct" : "incorrect"}`}>
                    <div className="result-answer-icon">{r?.correct ? "\u2713" : "\u2717"}</div>
                    <div className="result-answer-word">
                      {card.word}
                      {m?.mastered && <span className="mastery-badge">暗記済</span>}
                    </div>
                    <div className="result-answer-def">{card.definition}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
              <button className="nbtn" onClick={onBack}>単語帳に戻る</button>
              <button className="nbtn primary" onClick={() => { resetQuiz(); }}>もう一度</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="study-page">
      <div className="study-nav">
        <button className="nbtn ghost" onClick={onBack}>戻る</button>
        <span className="study-deck-title">クイズ: {deck.name}</span>
        <div className="study-progress">{qi + 1} / {queue.length}</div>
      </div>

      <div className="quiz-body">
        <div className="quiz-card">
          <div className="fc-text">{getQA(current).question}</div>
        </div>

        {mode === "choice" ? (
          <div className="choice-grid">
            {choices.map((choice) => {
              let cls = "choice-btn";
              if (selectedId) {
                if (choice.id === current.id) cls += " c-correct";
                else if (choice.id === selectedId) cls += " c-wrong";
              }
              const { answer } = getQA(choice);
              return (
                <button
                  key={choice.id}
                  className={cls}
                  onClick={() => submitChoice(choice)}
                  disabled={Boolean(selectedId)}
                >
                  {answer}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, width: "100%" }}>
            <textarea
              className="write-textarea"
              rows={3}
              placeholder={answerDir === "word" ? "単語を入力" : "定義を入力"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={answering}
            />
            <button className="nbtn primary" onClick={submitWrite} disabled={answering || !input.trim()}>
              {answering ? "判定中..." : "送信"}
            </button>
          </div>
        )}

        {feedback ? <div className="quiz-feedback">{feedback}</div> : null}
      </div>
    </div>
  );
}

function CircularProgress({ percent }) {
  const [animVal, setAnimVal] = useState(0);
  const R = 70, STROKE = 10, SIZE = (R + STROKE) * 2;
  const C = 2 * Math.PI * R; // circumference

  useEffect(() => {
    let start = null;
    const duration = 1200; // ms
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2; // easeInOutCubic
    const animate = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      setAnimVal(Math.round(ease(progress) * percent));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [percent]);

  const offset = C - (animVal / 100) * C;
  return (
    <div style={{position:"relative",width:SIZE,height:SIZE,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width={SIZE} height={SIZE} style={{transform:"rotate(-90deg)"}}>
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none"
          stroke="url(#achGrad)" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{transition:"stroke-dashoffset 0.05s linear"}}
        />
        <defs>
          <linearGradient id="achGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{position:"absolute",display:"flex",flexDirection:"column",alignItems:"center"}}>
        <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:".05em"}}>進捗</span>
        <span style={{fontSize:36,fontWeight:800,color:"var(--text)"}}>{animVal}<span style={{fontSize:18}}>%</span></span>
      </div>
    </div>
  );
}

function ResultDonut({ percent, colorVar = "--accent", bgColorVar = "--coral" }) {
  const [animVal, setAnimVal] = useState(0);
  const R = 64, STROKE = 14, SIZE = (R + STROKE) * 2;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    let start = null;
    const duration = 1200;
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
    const animate = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      setAnimVal(Math.round(ease(progress) * percent));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [percent]);

  const correctOffset = C - (animVal / 100) * C;
  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none" stroke={`var(${bgColorVar})`} strokeWidth={STROKE} />
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none"
          stroke={`var(${colorVar})`} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={correctOffset}
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
      </svg>
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: "var(--text)" }}>{animVal}<span style={{ fontSize: 16 }}>%</span></span>
      </div>
    </div>
  );
}

// SHARED
function Navbar({left,center,right,onMenuClick}) {
  return (
    <header className="navbar">
      <div className="navbar-left">
        {onMenuClick && <button className="hamburger-btn" onClick={onMenuClick} aria-label="メニュー"><span/><span/><span/></button>}
        {left||<div className="logo">Flash Auto</div>}
      </div>
      <div className="navbar-center">{center}</div>
      <div className="navbar-right">{right}</div>
    </header>
  );
}
function Toast({msg,type}) {
  return <div className={"toast-popup "+(type==="err"?"tp-err":"tp-ok")}>{msg}</div>;
}

// STYLES
function Styles() {
  const css = [
    "@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap');",
    "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}",
    ":root{--bg:#f0f5f4;--surface:#fff;--surface2:#f2f7f6;--surface3:#e2edeb;--border:#d4e4e1;--border2:#b8d4cf;--accent:#0d9488;--accent2:#0f766e;--accent-dim:rgba(13,148,136,.1);--coral:#ff6b6b;--coral-dim:rgba(255,107,107,.1);--red:#ef4444;--red-dim:rgba(239,68,68,.1);--green:#22c55e;--green-dim:rgba(34,197,94,.1);--text:#1a2e2b;--text2:#5f7a76;--text3:#8fa8a3;--ff:'Outfit','Noto Sans JP',sans-serif;--r:16px;--r-sm:10px;--shadow:0 4px 20px rgba(13,148,136,.10);--shadow-lg:0 8px 40px rgba(13,148,136,.16);}",
    "html,body{background:var(--bg);color:var(--text);font-family:var(--ff);min-height:100vh;overflow-x:hidden;-webkit-text-size-adjust:100%;}",
    ".app{min-height:100vh;background:var(--bg);overflow-x:hidden;}",
    ".splash-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0f1e3a;}",
    ".splash-mark{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;}",
    ".splash-logo-text{font-family:'Outfit','Noto Sans JP',sans-serif;font-size:clamp(32px,6vw,56px);font-weight:800;letter-spacing:.08em;text-transform:lowercase;color:#fff;}",
    ".splash-logo-image{display:block;width:min(60vw,200px);height:min(60vw,200px);object-fit:contain;border-radius:28px;}",
    // navbar
    ".navbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 24px;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:200;}",
    ".navbar-left{display:flex;align-items:center;}",
    ".navbar-center{display:flex;align-items:center;justify-content:center;}",
    ".navbar-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:nowrap;}",
    ".logo{font-family:'Outfit',sans-serif;font-weight:800;font-size:22px;letter-spacing:.04em;background:linear-gradient(135deg,var(--accent),var(--coral));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}",
    ".nav-center-title{font-weight:700;font-size:16px;color:var(--text);}",
    // hamburger & drawer
    ".hamburger-btn{display:none;background:none;border:none;cursor:pointer;padding:6px;margin-right:8px;flex-direction:column;gap:5px;justify-content:center;align-items:center;width:36px;height:36px;border-radius:8px;transition:background .15s;}",
    ".hamburger-btn:hover{background:var(--surface2);}",
    ".hamburger-btn span{display:block;width:20px;height:2px;background:var(--text);border-radius:2px;transition:all .2s;}",
    ".drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:998;opacity:0;pointer-events:none;transition:opacity .25s;}",
    ".drawer-overlay-on{opacity:1;pointer-events:auto;}",
    ".drawer{position:fixed;top:0;left:0;bottom:0;width:min(300px,80vw);background:var(--surface);z-index:999;transform:translateX(-100%);transition:transform .28s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:4px 0 24px rgba(0,0,0,.12);}",
    ".drawer-on{transform:translateX(0);}",
    ".drawer-header{display:flex;align-items:center;gap:12px;padding:20px 18px;border-bottom:1px solid var(--border);}",
    ".drawer-close{margin-left:auto;background:none;border:none;font-size:18px;color:var(--text2);cursor:pointer;padding:4px 8px;border-radius:8px;}",
    ".drawer-close:hover{background:var(--surface2);}",
    ".drawer-body{flex:1;overflow-y:auto;padding:12px;}",
    ".drawer-item{font-family:var(--ff);display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:none;border-radius:14px;background:transparent;color:var(--text);text-align:left;cursor:pointer;transition:background .15s;font-size:15px;font-weight:600;}",
    ".drawer-item:hover,.drawer-item-on{background:linear-gradient(135deg,rgba(13,148,136,.1),rgba(45,212,191,.1));}",
    ".drawer-item-icon{font-size:20px;flex-shrink:0;}",
    ".drawer-item-label{font-weight:700;}",
    ".drawer-item-desc{font-size:12px;color:var(--text2);font-weight:400;margin-top:2px;}",
    ".drawer-divider{height:1px;background:var(--border);margin:8px 16px;}",
    ".drawer-credit{display:flex;align-items:center;gap:10px;padding:14px 16px;font-size:14px;color:var(--text2);font-weight:600;}",
    ".drawer-credit strong{color:var(--accent);font-weight:800;}",
    // buttons
    ".credit-badge{display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:999px;background:linear-gradient(135deg,#ecfdf5,#ccfbf1);border:1.5px solid rgba(13,148,136,.2);font-weight:700;font-size:14px;color:var(--accent);font-family:var(--ff);}",
    ".credit-gem{color:var(--accent);flex-shrink:0;}",
    ".btn-plus{font-size:1.4em;font-weight:900;line-height:1;vertical-align:middle;}",
    ".nbtn{font-family:var(--ff);font-weight:600;font-size:14px;padding:9px 18px;border-radius:var(--r-sm);cursor:pointer;transition:all .2s;border:1.5px solid transparent;white-space:nowrap;}",
    ".nbtn.primary{background:var(--accent);color:#fff;border-color:var(--accent);}",
    ".nbtn.primary:hover{background:var(--accent2);}",
    ".nbtn.primary:disabled{opacity:.45;cursor:default;}",
    ".nbtn.ghost{background:transparent;color:var(--text2);border-color:var(--border2);}",
    ".nbtn.ghost:hover{background:var(--surface2);color:var(--text);}",
    ".nbtn.danger{background:transparent;color:var(--red);border-color:rgba(239,68,68,.35);}",
    ".nbtn.danger:hover{background:var(--red-dim);}",
    ".nbtn.ai-btn{background:linear-gradient(135deg,var(--accent),#2dd4bf);color:#fff;border-color:transparent;}",
    ".nbtn.ai-btn:hover{opacity:.9;transform:translateY(-1px);}",
    // shared panels
    ".page-shell,.page{max-width:1280px;margin:0 auto;padding:0 24px 100px;}",
    ".hero-panel,.card-card,.terms-panel,.composer-panel{background:var(--surface);border:1px solid var(--border);border-radius:24px;box-shadow:0 10px 30px rgba(15,23,42,.05);}",
    ".hero-panel,.card-card,.terms-panel,.composer-panel,.dashboard-hero,.set-header-card{padding:24px;}",
    ".section-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent2);margin-bottom:10px;display:block;}",
    ".section-heading{font-size:28px;font-weight:800;color:var(--text);}",
    ".mode-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;}",
    ".search-row{position:relative;}",
    ".search-input{width:100%;padding:14px 16px;border-radius:16px;border:1.5px solid var(--border);background:var(--surface2);font-family:var(--ff);font-size:15px;color:var(--text);outline:none;}",
    ".search-input:focus{border-color:var(--accent);background:var(--surface);}",
    ".tag-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;}",
    ".tag{font-family:var(--ff);font-size:13px;font-weight:700;padding:8px 14px;border-radius:999px;border:1px solid var(--border2);background:var(--surface);color:var(--text2);cursor:pointer;}",
    ".tag.active,.tag:hover{border-color:var(--accent);background:var(--accent-dim);color:var(--accent);}",
    ".muted{color:var(--text2);font-size:14px;}",
    // page
    ".app-shell{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;padding-top:32px;align-items:start;}",
    ".shell-main{min-width:0;display:grid;gap:24px;}",
    ".app-sidebar{position:sticky;top:84px;display:grid;gap:18px;}",
    ".sidebar-brand,.sidebar-note,.sidebar-group{background:var(--surface);border:1px solid var(--border);border-radius:22px;box-shadow:0 10px 30px rgba(15,23,42,.05);}",
    ".sidebar-brand{display:flex;align-items:center;gap:14px;padding:18px 20px;}",
    ".sidebar-brand-mark{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--accent),#2dd4bf);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:800;}",
    ".sidebar-brand-title{font-size:18px;font-weight:800;color:var(--text);}",
    ".sidebar-brand-sub{font-size:13px;color:var(--text2);}",
    ".sidebar-group{display:grid;gap:6px;padding:12px;}",
    ".sidebar-link{font-family:var(--ff);font-size:14px;font-weight:700;padding:13px 14px;border:none;border-radius:16px;background:transparent;color:var(--text2);text-align:left;cursor:pointer;transition:all .18s;display:flex;align-items:center;gap:12px;}",
    ".sidebar-link:hover,.sidebar-link-on{background:linear-gradient(135deg,rgba(108,99,255,.14),rgba(45,212,191,.14));color:var(--text);}",
    ".sidebar-link-icon{font-size:20px;flex-shrink:0;}",
    ".sidebar-link-desc{font-size:11px;color:var(--text3);font-weight:400;margin-top:2px;}",
    ".sidebar-credit-card{background:var(--surface);border:1px solid var(--border);border-radius:22px;box-shadow:0 10px 30px rgba(15,23,42,.05);padding:18px 20px;display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text2);font-weight:600;}",
    ".sidebar-credit-card strong{color:var(--accent);font-weight:800;}",
    ".home-hero{padding:36px 0 22px;}",
    ".home-title{font-size:28px;font-weight:800;margin-bottom:18px;}",
    ".dashboard-hero{background:linear-gradient(135deg,#ffffff,#ecfdf5 60%,#ccfbf1);border:1px solid var(--border);border-radius:28px;box-shadow:0 18px 40px rgba(15,23,42,.06);}",
    ".compact-hero{padding-bottom:28px;}",
    ".dashboard-title{font-size:clamp(30px,4vw,44px);font-weight:800;line-height:1.08;color:var(--text);max-width:12ch;}",
    ".dashboard-copy{font-size:15px;line-height:1.7;color:var(--text2);margin-top:12px;max-width:64ch;}",
    ".dashboard-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;}",
    ".launch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:24px;}",
    ".launch-card{font-family:var(--ff);display:grid;gap:8px;padding:22px 22px 20px;border:none;border-radius:24px;text-align:left;cursor:pointer;box-shadow:0 20px 40px rgba(15,23,42,.12);transition:transform .18s,box-shadow .18s,opacity .18s;}",
    ".launch-card:hover{transform:translateY(-2px);box-shadow:0 26px 46px rgba(15,23,42,.16);}",
    ".launch-card strong{font-size:30px;font-weight:800;line-height:1.1;}",
    ".launch-card span{font-size:14px;line-height:1.6;}",
    ".launch-kicker{font-size:11px!important;font-weight:800!important;letter-spacing:.08em;text-transform:uppercase;opacity:.82;}",
    ".launch-card-manual{background:linear-gradient(135deg,#0d9488,#14b8a6 55%,#2dd4bf);color:#fff;}",
    ".launch-card-ai{background:linear-gradient(135deg,#0f766e,#0d9488 58%,#5eead4);color:#fff;}",
    ".launch-card-featured{transform:scale(1.04);box-shadow:0 24px 48px rgba(109,40,217,.25),0 0 0 2px rgba(124,58,237,.3);position:relative;overflow:hidden;}",
    ".launch-card-featured::before{content:'おすすめ';position:absolute;top:12px;right:-28px;background:rgba(255,255,255,.25);color:#fff;font-size:10px;font-weight:800;padding:3px 32px;transform:rotate(40deg);letter-spacing:.06em;backdrop-filter:blur(4px);}",
    ".launch-card-featured:hover{transform:scale(1.06);box-shadow:0 28px 54px rgba(109,40,217,.3),0 0 0 2px rgba(124,58,237,.4);}",
    ".stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:24px;}",
    ".stat-chip{display:grid;gap:4px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.9);border:1px solid rgba(13,148,136,.12);}",
    ".stat-chip strong{font-size:24px;font-weight:800;color:var(--text);}",
    ".stat-chip span{font-size:13px;color:var(--text2);}",
    // quick generate
    ".quick-gen-box{margin-top:22px;display:grid;gap:12px;}",
    ".quick-gen-input-row{display:flex;gap:10px;align-items:stretch;}",
    ".quick-gen-input{flex:1;padding:14px 18px;border-radius:14px;border:1.5px solid var(--border);background:var(--surface);font-family:var(--ff);font-size:16px;color:var(--text);outline:none;transition:border-color .2s;}",
    ".quick-gen-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim);}",
    ".quick-gen-input:disabled{opacity:.6;}",
    ".quick-gen-btn{font-size:15px;padding:14px 22px;border-radius:14px;flex-shrink:0;}",
    ".quick-gen-btn:disabled{opacity:.45;cursor:default;}",
    ".quick-gen-samples{display:flex;flex-wrap:wrap;gap:8px;}",
    ".sample-chip{font-family:var(--ff);font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px;border:1.5px solid var(--border2);background:rgba(255,255,255,.85);color:var(--text2);cursor:pointer;transition:all .18s;}",
    ".sample-chip:hover:not(:disabled){border-color:var(--accent);background:var(--accent-dim);color:var(--accent);}",
    ".sample-chip:disabled{opacity:.5;cursor:default;}",
    ".quick-gen-error{color:#b91c1c;background:#fee2e2;padding:10px 14px;border-radius:10px;font-size:14px;}",
    ".quick-result-panel{margin-top:20px;background:rgba(255,255,255,.95);border:1.5px solid var(--border2);border-radius:20px;padding:20px;display:grid;gap:16px;}",
    ".quick-result-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}",
    ".quick-result-name{font-size:18px;font-weight:800;color:var(--text);}",
    ".quick-result-meta{font-size:14px;color:var(--text2);}",
    ".quick-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;max-height:320px;overflow-y:auto;padding-right:4px;}",
    ".quick-card-item{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:grid;gap:6px;}",
    ".quick-card-word{font-size:15px;font-weight:700;color:var(--text);}",
    ".quick-card-def{font-size:13px;color:var(--text2);line-height:1.5;}",
    ".quick-result-footer{display:flex;gap:10px;flex-wrap:wrap;}",
    "@media(max-width:600px){.quick-gen-input-row{flex-direction:column;}.quick-gen-btn{width:100%;}.quick-cards-grid{grid-template-columns:1fr;}}",
    ".filter-tabs{display:flex;gap:4px;background:var(--surface);border-radius:12px;padding:4px;width:fit-content;border:1px solid var(--border);}",
    ".ftab{font-family:var(--ff);font-size:14px;font-weight:600;padding:7px 20px;border-radius:9px;border:none;background:transparent;color:var(--text2);cursor:pointer;transition:all .2s;}",
    ".ftab-on{background:var(--accent)!important;color:#fff!important;}",
    ".section-title{font-size:16px;font-weight:700;margin-bottom:18px;color:var(--text2);}",
    ".set-section{display:grid;gap:16px;}",
    ".section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;}",
    // deck grid
    ".deck-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:18px;margin-top:22px;}",
    ".set-feed{display:grid;gap:16px;}",
    ".study-set-card{display:grid;grid-template-columns:196px minmax(0,1fr);background:var(--surface);border:1px solid var(--border);border-radius:24px;overflow:hidden;cursor:pointer;box-shadow:0 12px 30px rgba(15,23,42,.05);transition:transform .2s,box-shadow .2s;}",
    ".study-set-card:hover{transform:translateY(-2px);box-shadow:0 18px 38px rgba(15,23,42,.1);}",
    ".study-set-thumb{position:relative;min-height:182px;display:flex;align-items:flex-end;justify-content:flex-start;padding:18px;overflow:hidden;}",
    ".study-set-icon{position:relative;z-index:1;font-size:34px;font-weight:800;letter-spacing:.04em;color:#fff;}",
    ".study-set-badges{position:absolute;top:14px;left:14px;display:flex;gap:8px;flex-wrap:wrap;z-index:2;}",
    ".study-badge{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.92);font-size:11px;font-weight:800;color:var(--text);}",
    ".study-set-content{padding:22px 24px;display:grid;gap:12px;min-width:0;}",
    ".study-set-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;}",
    ".study-set-type{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);}",
    ".study-set-title{font-size:22px;font-weight:800;color:var(--text);line-height:1.2;}",
    ".study-set-meta{font-size:14px;color:var(--text2);line-height:1.6;}",
    ".study-set-preview{display:flex;flex-wrap:wrap;gap:8px;}",
    ".study-preview-chip{padding:7px 12px;border-radius:999px;background:var(--surface2);font-size:13px;font-weight:700;color:var(--text);}",
    ".study-set-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--border);}",
    ".study-set-link{font-size:13px;font-weight:800;color:var(--accent2);}",
    ".deck-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;cursor:pointer;transition:transform .22s,box-shadow .22s;box-shadow:0 2px 8px rgba(0,0,0,.05);}",
    ".deck-tile:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);}",
    ".deck-tile-top{height:148px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;}",
    ".tile-deco-a{position:absolute;width:155px;height:155px;border-radius:50%;top:-38px;right:-38px;opacity:.15;}",
    ".tile-deco-b{position:absolute;width:95px;height:95px;border-radius:50%;bottom:-28px;left:-18px;opacity:.12;}",
    ".tile-main-icon{font-size:50px;position:relative;z-index:1;filter:drop-shadow(0 4px 10px rgba(0,0,0,.28));}",
    ".tile-icon-col{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;align-items:center;gap:5px;z-index:2;}",
    ".tile-fav-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;}",
    ".fav-btn{font-size:16px;background:rgba(255,255,255,.85);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#aaa;transition:all .2s;backdrop-filter:blur(6px);}",
    ".fav-btn:hover{background:#fff;color:var(--coral);}",
    ".fav-on{color:var(--coral)!important;background:#fff!important;}",
    ".study-fav-btn{width:44px;height:44px;padding:0;border-radius:50%;color:#ccc;}",
    ".study-fav-btn:hover{color:var(--coral);background:rgba(255,255,255,.95);}",
    ".study-fav-btn.fav-on{color:var(--coral);background:#fff;}",
    ".fav-heart-btn{display:inline-flex;align-items:center;justify-content:center;color:#aaa;padding:6px;}",
    ".fav-heart-btn:hover{color:var(--coral);}",
    ".fav-heart-btn.fav-on{color:var(--coral);}",
    ".fav-count{font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,.42);border-radius:10px;padding:1px 7px;text-align:center;}",
    ".crown-badge,.ai-badge{font-size:14px;background:rgba(255,255,255,.85);border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);}",
    ".ai-badge{font-size:10px;font-weight:800;color:var(--accent);background:rgba(255,255,255,.9);border-radius:8px;width:auto;padding:2px 7px;border-radius:8px;}",
    ".deck-tile-body{padding:14px 16px;}",
    ".tile-name{font-size:15px;font-weight:700;margin-bottom:5px;color:var(--text);}",
    ".tile-meta{font-size:12px;color:var(--text3);margin-bottom:9px;}",
    ".tile-tags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px;}",
    ".tile-tag{font-size:11px;color:var(--accent);background:var(--accent-dim);padding:2px 9px;border-radius:20px;font-weight:600;}",
    ".tile-actions{display:flex;gap:7px;margin-top:4px;}",
    ".tile-act-btn{font-family:var(--ff);font-size:12px;font-weight:600;padding:5px 12px;border-radius:7px;border:1.5px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer;}",
    ".tile-act-btn:hover{background:var(--surface2);}",
    ".tile-act-btn.del{border-color:rgba(239,68,68,.35);color:var(--red);}",
    ".tile-act-btn.del:hover{background:var(--red-dim);}",
    ".empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 0;gap:16px;text-align:center;}",
    ".empty-panel{background:var(--surface);border:1px dashed var(--border2);border-radius:24px;}",
    ".empty-emoji{width:72px;height:72px;border-radius:24px;background:linear-gradient(135deg,var(--accent),#2dd4bf);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;letter-spacing:.06em;}",
    ".empty-state p{color:var(--text2);font-size:16px;}",
    // library
    ".search-bar{width:100%;padding:11px 40px 11px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-sm);font-family:var(--ff);font-size:15px;color:var(--text);outline:none;}",
    ".search-bar:focus{border-color:var(--accent);}",
    ".search-clear{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:15px;}",
    ".tag-pills{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;}",
    ".tpill{font-family:var(--ff);font-size:13px;font-weight:600;padding:5px 14px;border-radius:20px;border:1.5px solid var(--border2);background:var(--surface);color:var(--text2);cursor:pointer;}",
    ".tpill:hover,.tpill-on{border-color:var(--accent);color:var(--accent);}",
    ".tpill-on{background:var(--accent-dim)!important;}",
    // detail
    ".detail-page{max-width:1200px;}",
    ".set-header-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;background:linear-gradient(135deg,#ffffff,#ecfdf5 60%,#f0fdfa);border:1px solid var(--border);border-radius:28px;box-shadow:0 18px 40px rgba(15,23,42,.06);margin-top:32px;}",
    ".set-header-main{min-width:0;}",
    ".set-header-title{font-size:clamp(30px,4vw,44px);font-weight:800;line-height:1.08;color:var(--text);}",
    ".set-header-copy{margin-top:12px;font-size:15px;line-height:1.7;color:var(--text2);max-width:62ch;}",
    ".set-meta-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px;}",
    ".set-meta-card{display:grid;gap:6px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.92);border:1px solid rgba(13,148,136,.12);}",
    ".set-meta-card span{font-size:12px;font-weight:700;color:var(--text2);}",
    ".set-meta-card strong{font-size:20px;font-weight:800;color:var(--text);line-height:1.3;}",
    ".detail-tags{margin-top:16px;}",
    ".set-action-row{display:flex;flex-direction:column;justify-content:center;gap:10px;min-width:220px;}",
    ".detail-lang-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);background:var(--surface2);border:1px solid var(--border);padding:4px 14px;border-radius:20px;margin-bottom:14px;font-weight:600;}",
    ".detail-tag{font-size:12px;color:var(--accent);background:var(--accent-dim);padding:3px 12px;border-radius:20px;font-weight:600;}",
    ".fav-btn-lg{font-family:var(--ff);font-size:14px;font-weight:600;padding:8px 14px;border-radius:var(--r-sm);cursor:pointer;background:var(--surface);border:1.5px solid var(--border2);color:var(--text2);transition:all .2s;}",
    ".fav-btn-lg:hover{border-color:var(--coral);color:var(--coral);}",
    ".fav-btn-lg.fav-on{background:var(--coral-dim);border-color:var(--coral);color:var(--coral);}",
    ".mode-btn-row{display:flex;gap:12px;flex-wrap:wrap;}",
    ".mode-big-btn{flex:1;min-width:150px;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:20px 22px;background:var(--surface);border:2px solid var(--border);border-radius:var(--r);cursor:pointer;font-family:var(--ff);transition:all .2s;}",
    ".mode-big-btn:hover{border-color:var(--mc,var(--accent));transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.09);}",
    ".test-submenu-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;}",
    ".test-submenu-card{background:var(--surface);border-radius:var(--r);padding:28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.15);}",
    ".detail-layout{display:grid;grid-template-columns:1fr;gap:20px;margin-top:20px;align-items:start;}",
    ".composer-panel{position:sticky;top:84px;}",
    ".terms-list{display:grid;gap:0;}",
    ".term-row{display:grid;grid-template-columns:48px minmax(0,1fr) minmax(0,1fr) auto;gap:16px;align-items:start;padding:18px 0;border-top:1px solid var(--border);}",
    ".terms-list .term-row:first-child{border-top:none;padding-top:0;}",
    ".term-row-editing{grid-template-columns:48px minmax(0,1fr);}",
    ".term-index{width:36px;height:36px;border-radius:12px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:var(--text2);}",
    ".term-cell{display:grid;gap:6px;min-width:0;}",
    ".term-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);}",
    ".term-value{font-size:15px;line-height:1.7;color:var(--text);word-break:break-word;}",
    ".term-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}",
    ".term-edit-panel{display:grid;gap:12px;}",
    ".term-edit-grid{display:grid;grid-template-columns:220px minmax(0,1fr);gap:10px;}",
    ".composer-form{display:grid;gap:10px;}",
    ".icon-btn{font-size:18px;padding:6px 8px;min-width:unset;line-height:1;}",
    ".composer-actions{display:grid;gap:10px;}",
    // preview card
    ".preview-card{width:min(500px,100%);height:230px;perspective:1200px;cursor:pointer;margin:0 auto;}",
    ".preview-inner{width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,0,.2,1);}",
    ".preview-card.flipped .preview-inner{transform:rotateY(180deg);}",
    ".preview-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:var(--r);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:26px;}",
    ".preview-front{background:var(--surface);border:1.5px solid var(--border);}",
    ".preview-back{transform:rotateY(180deg);background:linear-gradient(135deg,var(--accent),#2dd4bf);}",
    ".preview-lang{font-size:11px;color:var(--text3);margin-bottom:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}",
    ".preview-word{font-size:clamp(20px,4vw,36px);font-weight:800;text-align:center;color:var(--text);}",
    ".preview-def{font-size:clamp(13px,2vw,17px);text-align:center;color:#fff;line-height:1.6;}",
    ".prev-nav-btn{background:var(--surface);border:1.5px solid var(--border);border-radius:50%;width:38px;height:38px;color:var(--text2);font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}",
    ".prev-nav-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff;}",
    // card rows
    ".card-row{display:grid;grid-template-columns:32px 1fr 18px 1fr 86px;align-items:start;gap:10px;padding:12px 14px;background:var(--surface);border-radius:var(--r-sm);border:1px solid transparent;transition:background .15s;}",
    ".card-row:hover{background:var(--surface2);border-color:var(--border);}",
    ".card-row-editing{background:var(--surface2)!important;border:1.5px solid var(--accent)!important;grid-template-columns:32px 1fr 56px!important;}",
    ".card-row-adding{background:rgba(13,148,136,.04)!important;border:1.5px dashed var(--accent)!important;grid-template-columns:32px 1fr 56px!important;}",
    ".ctr-num{font-size:11px;color:var(--text3);font-weight:600;padding-top:3px;}",
    ".ctr-edit-btn{font-family:var(--ff);font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;border:1.5px solid var(--border2);background:transparent;color:var(--text3);cursor:pointer;align-self:center;}",
    ".ctr-edit-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-dim);}",
    ".ctr-del-btn{font-family:var(--ff);font-size:12px;padding:3px 7px;border-radius:6px;border:1.5px solid rgba(239,68,68,.28);background:transparent;color:var(--red);cursor:pointer;opacity:.6;align-self:center;}",
    ".ctr-del-btn:hover{opacity:1;background:var(--red-dim);}",
    ".ctr-edit-fields{display:grid;grid-template-columns:1fr 14px 1.5fr;gap:8px;align-items:start;}",
    ".ctr-edit-input{font-family:var(--ff);font-size:13px;color:var(--text);background:var(--surface);border:1.5px solid var(--border);border-radius:7px;padding:7px 10px;outline:none;width:100%;}",
    ".ctr-edit-input:focus{border-color:var(--accent);}",
    ".ctr-save-btn{font-family:var(--ff);font-size:12px;font-weight:700;padding:6px 10px;border-radius:7px;background:var(--accent);color:#fff;border:none;cursor:pointer;}",
    ".ctr-cancel-btn{font-family:var(--ff);font-size:12px;padding:6px 10px;border-radius:7px;background:transparent;color:var(--text3);border:1.5px solid var(--border2);cursor:pointer;}",
    ".add-inline-btn{font-family:var(--ff);font-size:13px;font-weight:700;padding:8px 16px;border-radius:var(--r-sm);background:var(--accent);color:#fff;border:none;cursor:pointer;transition:all .2s;}",
    ".add-inline-btn:hover{background:var(--accent2);}",
    ".add-card-btn{width:100%;padding:14px;margin-top:4px;background:transparent;border:2px dashed var(--border2);border-radius:var(--r-sm);font-family:var(--ff);font-size:14px;font-weight:600;color:var(--text3);cursor:pointer;}",
    ".add-card-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-dim);}",
    // create form
    ".create-lang-grid{display:grid;gap:14px;grid-template-columns:1fr 1fr;}",
    "@media(max-width:480px){.create-lang-grid{grid-template-columns:1fr;}}",
    ".create-card-fields{display:flex;gap:0;align-items:stretch;}",
    "@media(max-width:480px){.create-card-fields{flex-direction:column;gap:12px;}.create-card-fields>div{padding:0!important;border:none!important;}}",
    ".create-name-input{width:100%;font-family:var(--ff);font-size:25px;font-weight:800;background:transparent;border:none;border-bottom:2px solid var(--border);padding:10px 2px;color:var(--text);outline:none;margin-bottom:26px;}",
    ".create-name-input:focus{border-color:var(--accent);}",
    ".create-name-input::placeholder{color:var(--text3);}",
    ".settings-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px 22px;margin-bottom:26px;}",
    ".settings-label{font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:6px;}",
    ".settings-select{font-family:var(--ff);font-size:14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:8px 12px;color:var(--text);cursor:pointer;outline:none;min-width:150px;}",
    ".settings-select:focus{border-color:var(--accent);}",
    ".dseg-btn{font-family:var(--ff);font-size:13px;font-weight:600;padding:7px 14px;border-radius:var(--r-sm);border:1.5px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;display:inline-flex;align-items:center;gap:4px;}",
    ".dseg-on{background:var(--accent-dim)!important;border-color:var(--accent)!important;color:var(--accent)!important;}",
    ".tag-text-input{font-family:var(--ff);font-size:14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:8px 12px;color:var(--text);outline:none;width:150px;}",
    ".tag-edit-chip{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--accent);background:var(--accent-dim);padding:3px 11px;border-radius:20px;font-weight:600;}",
    ".tag-rm{background:none;border:none;cursor:pointer;color:inherit;font-size:13px;opacity:.6;}",
    ".ce-input{width:100%;background:transparent;border:none;border-bottom:1.5px solid var(--border);padding:7px 2px;font-family:var(--ff);font-size:15px;color:var(--text);outline:none;}",
    ".ce-input:focus{border-color:var(--accent);}",
    ".ce-input::placeholder{color:var(--text3);}",
    ".regen-btn{font-family:var(--ff);font-size:11px;color:var(--text3);border:1.5px solid var(--border);background:none;padding:2px 8px;border-radius:6px;cursor:pointer;font-weight:600;}",
    // generate view
    ".gen-page{min-height:100vh;display:flex;flex-direction:column;background:var(--bg);}",
    ".gen-layout{flex:1;display:grid;grid-template-columns:1fr;gap:0;max-width:1200px;margin:0 auto;width:100%;padding:0 0 40px;}",
    "@media(min-width:900px){.gen-layout{grid-template-columns:1fr 1fr;gap:24px;padding:24px 24px 60px;}}",
    ".gen-chat-panel{display:flex;flex-direction:column;background:var(--surface);border-right:1px solid var(--border);min-height:0;}",
    "@media(min-width:900px){.gen-chat-panel{border-radius:var(--r);border:1px solid var(--border);box-shadow:var(--shadow);max-height:calc(100vh - 140px);overflow:hidden;display:flex;flex-direction:column;}}",
    ".gen-messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;}",
    ".gen-msg{display:flex;gap:10px;align-items:flex-start;}",
    ".gen-msg-user{flex-direction:row-reverse;}",
    ".gen-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#2dd4bf);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}",
    ".gen-avatar-user{background:var(--surface3);border:1px solid var(--border);}",
    ".gen-bubble{background:var(--surface2);border:1px solid var(--border);border-radius:14px;border-top-left-radius:4px;padding:12px 16px;max-width:85%;font-size:14px;line-height:1.6;color:var(--text);}",
    ".gen-msg-user .gen-bubble{background:var(--accent);color:#fff;border-color:var(--accent);border-top-right-radius:4px;border-top-left-radius:14px;}",
    ".gen-config-card{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:16px;margin-top:12px;display:flex;flex-direction:column;gap:14px;}",
    ".gen-config-row{display:flex;flex-direction:column;gap:6px;}",
    ".gen-config-label{font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;}",
    ".seg-group{display:flex;flex-direction:column;gap:6px;}",
    "@media(min-width:480px){.seg-group{flex-direction:row;flex-wrap:wrap;}}",
    ".seg-btn{font-family:var(--ff);font-size:13px;font-weight:600;padding:8px 14px;border-radius:var(--r-sm);border:1.5px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:1px;transition:all .18s;}",
    ".seg-btn:hover{border-color:var(--accent);color:var(--accent);}",
    ".seg-on{background:var(--accent-dim)!important;border-color:var(--accent)!important;color:var(--accent)!important;}",
    ".seg-sub{font-size:10px;font-weight:400;opacity:.7;}",
    ".gen-loading{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;color:var(--text2);}",
    ".gen-spinner{width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;}",
    "@keyframes spin{to{transform:rotate(360deg)}}",
    ".gen-input-row{display:flex;gap:8px;padding:14px;border-top:1px solid var(--border);background:var(--surface);}",
    ".gen-input{flex:1;font-family:var(--ff);font-size:14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:10px 14px;color:var(--text);outline:none;}",
    ".gen-input:focus{border-color:var(--accent);}",
    ".gen-input::placeholder{color:var(--text3);}",
    ".gen-send-btn{font-family:var(--ff);font-size:14px;font-weight:700;padding:10px 18px;border-radius:var(--r-sm);background:var(--accent);color:#fff;border:none;cursor:pointer;}",
    ".gen-send-btn:disabled{opacity:.4;cursor:default;}",
    ".gen-preview-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;overflow-y:auto;max-height:calc(100vh - 140px);display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow);}",
    ".gen-preview-header{border-bottom:1px solid var(--border);padding-bottom:14px;}",
    ".gen-name-input{font-family:var(--ff);font-size:18px;font-weight:800;width:100%;background:transparent;border:none;border-bottom:2px solid var(--border);padding:6px 2px;color:var(--text);outline:none;margin-top:4px;}",
    ".gen-name-input:focus{border-color:var(--accent);}",
    ".gen-preview-count{font-size:13px;color:var(--text3);margin-top:8px;}",
    ".gen-card-list{display:flex;flex-direction:column;gap:3px;flex:1;}",
    // study
    ".study-page{min-height:100vh;display:flex;flex-direction:column;background:var(--bg);}",
    ".study-wrap{flex:1;display:flex;flex-direction:column;align-items:center;padding:32px 20px;gap:20px;max-width:660px;margin:0 auto;width:100%;}",
    ".study-progress{font-size:14px;font-weight:700;color:var(--text2);}",
    ".quiz-body{flex:1;display:flex;flex-direction:column;align-items:center;padding:16px 16px;gap:12px;max-width:700px;margin:0 auto;width:100%;}",
    ".quiz-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:32px 28px;text-align:center;width:100%;height:300px;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);overflow-y:auto;}",
    ".quiz-card .fc-text{font-size:clamp(18px,4vw,32px);}",
    ".quiz-dir-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;gap:16px;max-width:520px;margin:0 auto;width:100%;}",
    ".quiz-dir-title{font-size:22px;font-weight:800;color:var(--text);margin:0;}",
    ".quiz-dir-sub{font-size:14px;color:var(--text3);margin:0;}",
    ".quiz-dir-grid{display:grid;gap:12px;width:100%;margin-top:8px;}",
    ".quiz-dir-btn{padding:24px 20px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);cursor:pointer;text-align:center;transition:all .2s;font-family:var(--ff);}",
    ".quiz-dir-btn strong{display:block;font-size:17px;color:var(--text);margin-bottom:4px;}",
    ".quiz-dir-btn span{font-size:13px;color:var(--text3);}",
    ".quiz-dir-btn:hover{border-color:var(--accent);background:var(--accent-dim);}",
    ".quiz-feedback{margin-top:8px;padding:12px 18px;border-radius:var(--r-sm);font-size:14px;font-weight:600;color:var(--text);background:var(--surface2);border:1px solid var(--border);text-align:center;}",
    ".study-nav{display:flex;align-items:center;justify-content:space-between;padding:13px 24px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.92);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;gap:8px;}",
    ".study-deck-title{font-size:14px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;text-align:center;}",
    ".study-progress-bar{height:4px;background:var(--surface3);}",
    ".study-progress-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--coral));transition:width .35s ease;}",
    ".mode-switch-btn{font-family:var(--ff);font-size:13px;font-weight:600;padding:6px 13px;border-radius:var(--r-sm);background:var(--surface2);border:1.5px solid var(--border);color:var(--text2);cursor:pointer;white-space:nowrap;flex-shrink:0;}",
    ".flip-stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;gap:26px;}",
    ".detail-flip-area{display:flex;flex-direction:column;align-items:center;gap:20px;padding:8px 0 16px;}",
    ".detail-flip-card{width:min(520px,90vw);height:300px;perspective:1200px;cursor:pointer;border:none;background:none;padding:0;outline:none;}",
    ".detail-flip-inner{width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,0,.2,1);}",
    ".detail-flip-card.flipped .detail-flip-inner{transform:rotateY(180deg);}",
    ".detail-flip-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:16px;display:flex;align-items:center;justify-content:center;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,.1);}",
    ".detail-flip-front{background:var(--surface);border:1.5px solid var(--border);}",
    ".detail-flip-back{transform:rotateY(180deg);background:linear-gradient(135deg,var(--accent),#2dd4bf);}",
    ".detail-flip-text{font-size:clamp(18px,4vw,32px);font-weight:700;text-align:center;color:var(--text);line-height:1.5;word-break:break-word;overflow-y:auto;max-height:100%;}",
    ".detail-flip-back .detail-flip-text{color:#fff;}",
    ".detail-flip-nav{display:flex;align-items:center;gap:28px;justify-content:center;}",
    ".flip-view-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;gap:28px;max-width:720px;margin:0 auto;width:100%;}",
    ".flip-card{width:min(620px,92vw);height:360px;perspective:1200px;cursor:pointer;border:none;background:none;padding:0;outline:none;transition:opacity .2s;}",
    ".flip-card.slide-left{opacity:0;transform:translateX(40px);}",
    ".flip-card.slide-right{opacity:0;transform:translateX(-40px);}",
    ".flip-card-inner{width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,0,.2,1);}",
    ".flip-card.flipped .flip-card-inner{transform:rotateY(180deg);}",
    ".flip-card-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:16px;display:flex;align-items:center;justify-content:center;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.12);}",
    ".flip-card-front{background:var(--surface);border:1.5px solid var(--border);}",
    ".flip-card-back{transform:rotateY(180deg);background:linear-gradient(135deg,var(--accent),#2dd4bf);}",
    ".flip-card-text{font-size:clamp(20px,4.5vw,36px);font-weight:700;text-align:center;color:var(--text);line-height:1.5;word-break:break-word;overflow-y:auto;max-height:100%;}",
    ".flip-card-back .flip-card-text{color:#fff;}",
    ".flip-nav-row{display:flex;align-items:center;gap:32px;justify-content:center;}",
    ".flip-arrow-btn{width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;padding:0;}",
    ".flip-arrow-btn:hover:not(.disabled){background:var(--accent);border-color:var(--accent);color:#fff;}",
    ".flip-arrow-btn.disabled{opacity:.3;cursor:default;}",
    ".flip-counter{font-size:16px;font-weight:700;color:var(--text2);min-width:60px;text-align:center;}",
    ".fc-nav{font-family:var(--ff);background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:10px 22px;font-size:14px;font-weight:600;color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}",
    ".fc-nav:hover{background:var(--accent);border-color:var(--accent);color:#fff;}",
    ".fc-nav.primary{background:var(--accent);color:#fff;border-color:var(--accent);}",
    ".quiz-stage{flex:1;display:flex;flex-direction:column;align-items:center;padding:28px 20px;gap:18px;max-width:660px;margin:0 auto;width:100%;}",
    ".choice-grid{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px;}",
    ".choice-btn{padding:16px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-sm);font-family:var(--ff);font-size:14px;color:var(--text);cursor:pointer;text-align:center;line-height:1.5;transition:all .18s;height:90px;display:flex;align-items:center;justify-content:center;overflow-y:auto;}",
    ".choice-btn:hover{border-color:var(--accent);background:var(--accent-dim);}",
    ".c-correct{border-color:var(--green)!important;background:var(--green-dim)!important;color:var(--green)!important;font-weight:700;}",
    ".c-wrong{border-color:var(--red)!important;background:var(--red-dim)!important;color:var(--red)!important;}",
    ".write-textarea{width:100%;min-height:100px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:14px;font-family:var(--ff);font-size:15px;color:var(--text);outline:none;resize:none;line-height:1.6;}",
    ".write-textarea:focus{border-color:var(--accent);}",
    ".write-textarea:disabled{opacity:.45;}",
    ".result-stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;gap:14px;text-align:center;}",
    ".result-summary-card{background:var(--surface);border-radius:var(--r);padding:32px 28px;max-width:520px;width:100%;margin:0 auto;box-shadow:var(--shadow);}",
    ".result-time{font-size:18px;font-weight:700;color:var(--text);text-align:center;margin-bottom:24px;}",
    ".result-donut-row{display:flex;align-items:center;justify-content:center;gap:36px;margin-bottom:24px;}",
    ".result-stats{display:grid;gap:16px;}",
    ".result-stat-item{display:flex;align-items:center;gap:14px;}",
    ".result-stat-label{font-size:16px;font-weight:700;min-width:56px;}",
    ".result-stat-value{display:flex;align-items:center;justify-content:center;min-width:48px;height:42px;padding:0 14px;border-radius:10px;font-size:20px;font-weight:800;}",
    ".result-stat-correct{color:var(--accent);border:2px solid var(--accent);background:var(--accent-dim);}",
    ".result-stat-incorrect{color:var(--coral);border:2px solid var(--coral);background:var(--coral-dim);}",
    ".result-message{text-align:center;font-size:15px;color:var(--text2);margin-bottom:20px;line-height:1.6;}",
    ".result-answers-title{font-size:15px;font-weight:700;color:var(--text2);margin-bottom:10px;}",
    ".result-answers-list{display:grid;gap:0;margin-bottom:8px;}",
    ".result-answer-row{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(0,2fr);gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--border);font-size:14px;}",
    ".result-answers-list .result-answer-row:first-child{border-top:none;}",
    ".result-answer-icon{font-size:16px;font-weight:800;text-align:center;}",
    ".result-answer-row.correct .result-answer-icon{color:var(--accent);}",
    ".result-answer-row.incorrect .result-answer-icon{color:var(--coral);}",
    ".result-answer-word{font-weight:600;color:var(--text);}",
    ".result-answer-def{color:var(--text2);line-height:1.4;}",
    ".mastery-section{border-top:1px solid var(--border);padding-top:20px;margin-bottom:20px;}",
    ".mastery-header{font-size:16px;font-weight:700;color:var(--text);text-align:center;}",
    ".mastery-sub{font-size:13px;color:var(--text3);text-align:center;margin-top:4px;}",
    ".mastery-badge{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:var(--green-dim);color:var(--green);vertical-align:middle;}",
    // feedback fab & modal
    ".feedback-fab{position:fixed;bottom:24px;right:24px;z-index:900;display:flex;align-items:center;gap:6px;padding:10px 18px;border-radius:40px;border:none;background:var(--accent);color:#fff;font-family:var(--ff);font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(13,148,136,.35);transition:all .2s;}",
    ".feedback-fab:hover{background:var(--accent2);box-shadow:0 6px 24px rgba(13,148,136,.45);transform:translateY(-2px);}",
    ".feedback-fab svg{flex-shrink:0;}",
    ".feedback-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1100;padding:20px;}",
    ".feedback-modal{background:var(--surface);border-radius:var(--r);padding:32px 28px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.18);text-align:center;position:relative;}",
    ".feedback-close{position:absolute;top:14px;right:14px;background:none;border:none;font-size:18px;color:var(--text3);cursor:pointer;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;}",
    ".feedback-close:hover{background:var(--surface2);color:var(--text);}",
    ".feedback-modal-icon{font-size:40px;margin-bottom:12px;}",
    ".feedback-modal-title{margin:0 0 12px;font-size:18px;font-weight:700;color:var(--text);}",
    ".feedback-modal-desc{margin:0 0 20px;font-size:14px;color:var(--text2);line-height:1.7;}",
    ".feedback-modal-btn{display:inline-flex;width:100%;justify-content:center;padding:13px 24px;font-size:15px;text-decoration:none;}",
    ".feedback-modal-skip{width:100%;margin-top:10px;}",
    ".sidebar-feedback{display:block;margin:12px 16px 16px;padding:10px 14px;border-radius:var(--r-sm);font-size:13px;color:var(--text2);text-decoration:none;text-align:center;transition:all .15s;border:1px dashed var(--border);}",
    ".sidebar-feedback:hover{background:var(--accent-dim);color:var(--accent);border-color:var(--accent);}",
    ".drawer-feedback{display:block;margin:12px 0 0;padding:12px 16px;border-radius:var(--r-sm);font-size:14px;color:var(--text2);text-decoration:none;text-align:center;border:1px dashed var(--border);transition:all .15s;}",
    ".drawer-feedback:hover{background:var(--accent-dim);color:var(--accent);border-color:var(--accent);}",
    // toast
    ".toast-popup{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);font-family:var(--ff);font-size:14px;font-weight:600;padding:11px 26px;border-radius:40px;z-index:9999;}",
    ".tp-ok{background:var(--accent);color:#fff;}",
    ".tp-err{background:var(--red);color:#fff;}",
    "@keyframes popIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}",
    "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}",
    "input::placeholder,textarea::placeholder{color:var(--text3);}",
    "select option{background:var(--surface);}",
    ".result-float-emoji{animation:floatEmoji 4s ease-in-out infinite alternate;pointer-events:none;}",
    "@keyframes floatEmoji{0%{transform:translateY(0) rotate(0deg);}100%{transform:translateY(-18px) rotate(12deg);}}",
    ".milestone-badge{position:relative;z-index:1;display:flex;align-items:center;gap:10px;padding:10px 22px;border-radius:40px;color:#fff;font-size:15px;font-weight:700;margin-top:10px;animation:popIn .5s cubic-bezier(.3,1.7,.5,1) both;box-shadow:0 4px 16px rgba(0,0,0,.15);}",
    "::-webkit-scrollbar{width:6px;}",
    "::-webkit-scrollbar-track{background:var(--surface2);}",
    "::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}",
    ".rt-container{display:flex;flex-direction:column;border:1.5px solid var(--border);border-radius:var(--r-sm);overflow:hidden;background:var(--surface);width:100%;}",
    ".rt-container:focus-within{border-color:var(--accent);}",
    ".rt-container.disabled{opacity:.6;pointer-events:none;background:var(--bg);}",
    ".rt-toolbar{display:flex;gap:4px;padding:4px 8px;background:var(--surface2);border-bottom:1px solid var(--border);}",
    ".rt-btn{width:28px;height:28px;border-radius:4px;border:none;background:transparent;cursor:pointer;font-family:var(--ff);font-size:14px;color:var(--text2);display:flex;align-items:center;justify-content:center;transition:all .15s;}",
    ".rt-btn:hover{background:var(--border);color:var(--text);}",
    ".rt-textarea{flex:1;min-height:70px;padding:10px 14px;outline:none;font-family:var(--ff);font-size:14px;line-height:1.6;color:var(--text);border:none;background:transparent;resize:vertical;width:100%;}",
    ".rt-textarea::placeholder{color:var(--text3);}",
    // --- tablet ---
    "@media(max-width:1100px){.app-shell{grid-template-columns:1fr;}.app-sidebar{position:static;}.sidebar-group{grid-template-columns:repeat(2,minmax(0,1fr));}.set-header-card,.detail-layout{grid-template-columns:1fr;}.set-action-row{min-width:0;flex-direction:row;flex-wrap:wrap;}.set-meta-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}",
    // --- mobile-medium ---
    "@media(max-width:860px){.study-set-card{grid-template-columns:1fr;}.study-set-thumb{min-height:120px;}.term-row{grid-template-columns:1fr;gap:8px;}.term-row-editing{grid-template-columns:1fr;}.term-edit-grid{grid-template-columns:1fr;}.term-actions{justify-content:flex-start;}.navbar{grid-template-columns:auto 1fr;gap:8px;padding:10px 14px;}.navbar-center{display:none;}.navbar-right{justify-content:flex-end;}.section-head{align-items:flex-start;flex-direction:column;}.app-sidebar{display:none;}.hamburger-btn{display:flex;}.choice-grid{grid-template-columns:1fr 1fr;}.card-row{grid-template-columns:28px 1fr;gap:8px;padding:10px;}.card-row:not(.card-row-editing):not(.card-row-adding) .ctr-edit-btn,.card-row:not(.card-row-editing):not(.card-row-adding) .ctr-del-btn{align-self:start;}.set-action-row{flex-direction:column;gap:8px;}.set-action-row .nbtn{width:100%;text-align:center;}}",
    // --- mobile-small ---
    "@media(max-width:640px){.page-shell,.page{padding:0 12px 72px;}.dashboard-title,.set-header-title{max-width:none;font-size:clamp(24px,6vw,36px);}.launch-grid,.stats-row,.set-meta-grid{grid-template-columns:1fr;}.sidebar-group{grid-template-columns:1fr;}.study-set-content{padding:14px 16px;}.launch-card strong{font-size:22px;}.launch-card{padding:18px 16px 16px;}.launch-card span{font-size:13px;}.dashboard-hero{padding:18px 16px;border-radius:20px;}.set-header-card{padding:18px 16px;border-radius:20px;margin-top:16px;gap:16px;}.section-heading{font-size:22px;}.dashboard-copy,.set-header-copy{font-size:14px;}.stat-chip{padding:10px 12px;}.stat-chip strong{font-size:20px;}.nbtn{padding:8px 14px;font-size:13px;}.credit-badge{padding:6px 10px;font-size:12px;}.set-meta-card strong{font-size:16px;}.set-meta-card span{font-size:11px;}.set-meta-card{padding:10px 12px;}.mode-grid{grid-template-columns:1fr;}.mode-big-btn{padding:16px 18px;}.quiz-card{padding:28px 20px;height:180px;}.choice-grid{grid-template-columns:1fr;}.flip-card{width:min(620px,calc(100vw - 32px));height:min(360px,60vh);}.detail-flip-card{width:min(520px,calc(100vw - 32px));height:min(300px,55vh);}.flip-view-body{padding:20px 12px;gap:20px;}.quiz-body{padding:12px;gap:10px;}.study-wrap{padding:20px 12px;gap:16px;}.result-summary-card{padding:24px 18px;}.filter-tabs{width:100%;}.ftab{flex:1;text-align:center;padding:7px 12px;}.test-submenu-card{padding:22px 18px;}.gen-input-row{padding:10px;}.gen-messages{padding:14px;}.gen-preview-panel{padding:14px;}.study-set-title{font-size:18px;}.study-set-meta{font-size:13px;}.study-set-card{border-radius:18px;}.terms-panel{padding:18px 14px;}.term-index{width:30px;height:30px;font-size:11px;border-radius:9px;}.term-value{font-size:14px;}.create-name-input{font-size:20px;}.settings-card{padding:14px 16px;}.card-card{padding:16px;}.hero-panel,.card-card,.terms-panel,.composer-panel{border-radius:18px;}.study-nav{padding:10px 14px;}.flip-nav-row{gap:20px;}.result-donut-row{gap:20px;flex-wrap:wrap;}}",
    // --- feedback fab mobile ---
    "@media(max-width:640px){.feedback-fab{bottom:18px;right:14px;padding:9px 14px;font-size:12px;}.feedback-fab span{display:none;}.feedback-modal{padding:24px 18px;}}",
    // --- extra-small (iPhone SE etc) ---
    "@media(max-width:380px){.page-shell,.page{padding:0 8px 64px;}.dashboard-hero{padding:14px 12px;}.set-header-card{padding:14px 12px;}.launch-card strong{font-size:18px;}.launch-card span{font-size:12px;}.nbtn{padding:7px 10px;font-size:12px;}.flip-card{height:min(320px,55vh);}.detail-flip-card{height:min(260px,50vh);}.navbar{padding:8px 10px;}.credit-badge{padding:5px 8px;font-size:11px;}}",

  ].join("\n");
  return <style dangerouslySetInnerHTML={{__html: css}}/>;
}



