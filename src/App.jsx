import { useState, useCallback, useRef, useEffect } from "react";

function normalizeLanguageValue(value, fallback = "ja") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

const LANGUAGES = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "英語" },
  { code: "zh", label: "中国語" },
  { code: "ko", label: "韓国語" },
  { code: "fr", label: "フランス語" },
  { code: "de", label: "ドイツ語" },
  { code: "es", label: "スペイン語" },
  { code: "it", label: "イタリア語" },
  { code: "pt", label: "ポルトガル語" },
  { code: "ru", label: "ロシア語" },
  { code: "ar", label: "アラビア語" },
  { code: "hi", label: "ヒンディー語" },
  { code: "technical", label: "専門用語" },
];
const getLangLabel = (code) => {
  const normalized = normalizeLanguageValue(code, "");
  return LANGUAGES.find((lang) => lang.code === normalized)?.label ?? normalized;
};
const toLanguageInputValue = (value, fallback = "ja") =>
  getLangLabel(normalizeLanguageValue(value, fallback));
const ANONYMOUS_USER_ID_KEY = "mnemox-anonymous-user-id";
const AI_GENERATE_DAILY_LIMIT = 3;
const AI_GENERATE_LIMIT_KEY = "mnemox-ai-generate-limit";
const AI_GENERATE_LIMIT_MESSAGE = "今日の生成枠（3回）を使い切りました。明日またお試しください。";

function buildAnonymousUserId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getAnonymousUserId() {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(ANONYMOUS_USER_ID_KEY);
    if (existing) return existing;

    const nextId = buildAnonymousUserId();
    window.localStorage.setItem(ANONYMOUS_USER_ID_KEY, nextId);
    return nextId;
  } catch {
    return null;
  }
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readGenerateUsage() {
  const today = getTodayKey();
  if (typeof window === "undefined") return { date: today, count: 0 };

  try {
    const raw = window.localStorage.getItem(AI_GENERATE_LIMIT_KEY);
    if (!raw) return { date: today, count: 0 };
    const parsed = JSON.parse(raw);
    if (parsed?.date !== today) return { date: today, count: 0 };
    const count = Number.isFinite(parsed?.count) ? Math.max(0, parsed.count) : 0;
    return { date: today, count };
  } catch {
    return { date: today, count: 0 };
  }
}

function writeGenerateUsage(entry) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_GENERATE_LIMIT_KEY, JSON.stringify(entry));
  } catch {}
}

function getRemainingGenerateCount() {
  const usage = readGenerateUsage();
  return Math.max(0, AI_GENERATE_DAILY_LIMIT - usage.count);
}

function consumeGenerateUsageSlot() {
  const usage = readGenerateUsage();
  if (usage.count >= AI_GENERATE_DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  const nextUsage = { date: usage.date, count: usage.count + 1 };
  writeGenerateUsage(nextUsage);

  return {
    allowed: true,
    remaining: Math.max(0, AI_GENERATE_DAILY_LIMIT - nextUsage.count),
  };
}

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
const SPLASH_LOGO_SRC = "";
const SPLASH_LOGO_ALT = "mnemox";

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
  return { bg: "linear-gradient(135deg,#1e1b4b,#312e81)", icon: "DECK", accent: "#818cf8" };
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
      { id: "s1a", word: "CPU", definition: "Central Processing Unitの略で、計算や命令の実行を担当するコンピュータの中核部品です。" },
      { id: "s1b", word: "RAM", definition: "作業中のデータを一時的に保存するメモリです。電源を切ると内容は消えます。" },
      { id: "s1c", word: "Algorithm", definition: "問題を解くための手順や規則のまとまりです。プログラムの処理方法を決める考え方です。" },
      { id: "s1d", word: "API", definition: "ソフトウェア同士が機能やデータをやり取りするための接続ルールです。" },
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
      { id: "s2a", word: "ephemeral", definition: "ごく短い時間しか続かないことを表します。" },
      { id: "s2b", word: "ubiquitous", definition: "どこにでも存在している、非常に広く見られるという意味です。" },
      { id: "s2c", word: "paradigm", definition: "物事の見方や考え方の枠組みを指します。" },
      { id: "s2d", word: "resilience", definition: "困難や失敗から立ち直る力、回復力のことです。" },
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
      { id: "s3a", word: "Hypothesis", definition: "観察や実験で確かめるために立てる仮説のことです。" },
      { id: "s3b", word: "Variable", definition: "変化する値や条件を表す要素です。" },
      { id: "s3c", word: "Observation", definition: "対象を注意深く見て事実や変化を記録することです。" },
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

// Groq API helper (via serverless proxy)
async function callGroq(prompt, maxTokens = 1024) {
  const endpoints = ["/api/groq", "/api/gemini"];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, maxTokens }),
      });
      const isJson = (r.headers.get("content-type") || "").includes("application/json");
      const d = isJson ? await r.json() : { error: await r.text() };

      if (r.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
        lastError = new Error(`${endpoint} is not deployed`);
        continue;
      }
      if (!r.ok) {
        throw new Error(d.error || `AI request failed (${r.status})`);
      }
      if (!d.text) {
        throw new Error("AI returned an empty response");
      }
      return d.text;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("AI request failed");
      if (endpoint === endpoints[endpoints.length - 1]) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error("AI API route is not available");
}

// AI: single card definition
async function aiSuggest({term,wordLang,defLang,detailLevel,deckName,otherWords}) {
  const normalizedWordLang = normalizeLanguageValue(wordLang);
  const normalizedDefLang = normalizeLanguageValue(defLang);
  const wl = getLangLabel(normalizedWordLang);
  const dl = getLangLabel(normalizedDefLang);
  const lvl = DETAIL_LEVELS.find(l=>l.id===detailLevel) || DETAIL_LEVELS[1];
  const context = (otherWords || []).filter(Boolean).slice(0, 12).join(", ");
  const prompt = [
    normalizedWordLang === "technical"
      ? `Define the technical term "${term}" as it is commonly used in Japan, and write the definition in ${dl}.`
      : `Explain the word "${term}" from ${wl} in ${dl}.`,
    `Deck: ${deckName || "Untitled"}`,
    context ? `Related words: ${context}` : "",
    lvl.id === 1 ? "Return one short sentence." : lvl.id === 2 ? "Return 2-3 sentences." : "Return 4-6 sentences with examples.",
    "Return the definition only.",
  ].filter(Boolean).join("\n");
  const maxTk = lvl.id===1 ? 80 : lvl.id===2 ? 200 : 500;
  return (await callGroq(prompt, maxTk)).trim();
}

// AI: quiz evaluation
async function aiEval(term,correctDef,userAns,defLang) {
  try {
    const prompt = `Evaluate whether the learner answer matches the correct definition. Term: ${term}\nCorrect: ${correctDef}\nLearner: ${userAns}\nReturn JSON only: {"correct":true/false,"feedback":"short feedback in ${getLangLabel(normalizeLanguageValue(defLang))}"}`;
    const raw = await callGroq(prompt, 200);
    const cleaned = raw.split("```json").join("").split("```").join("").trim();
    return JSON.parse(cleaned || '{"correct":false,"feedback":""}');
  } catch(e){ return {correct:false,feedback:"Could not evaluate the answer."}; }
}

// AI: mastery check
async function aiMastery(results) {
  try {
    const prompt = `Judge whether this study result means the learner mastered the deck. Result: ${JSON.stringify(results)}\nReturn JSON only: {"cleared":true/false,"message":"short message in Japanese"}`;
    const raw = await callGroq(prompt, 200);
    const cleaned = raw.split("```json").join("").split("```").join("").trim();
    return JSON.parse(cleaned || '{"cleared":false,"message":""}');
  } catch(e){ return {cleared:false,message:"Mastery check could not be completed."}; }
}

// AI: generate full deck from topic
async function aiGenerateDeck({topic, defLang, detailLevel}) {
  const dl = DETAIL_LEVELS.find(l=>l.id===detailLevel) || DETAIL_LEVELS[1];
  const normalizedDefLang = normalizeLanguageValue(defLang);
  const prompt = [
    `Create a study flashcard deck about: ${topic}`,
    "Number of cards: 10 to 15.",
    "You must always return at least 10 cards in the cards array.",
    "Start from the 10 most important cards.",
    "If there are additional must-know terms that do not fit within those 10, you may add up to 5 extra cards.",
    "Only add extra cards when they are clearly essential.",
    "Never return fewer than 10 cards, and never return more than 15 cards.",
    `Definition language: ${getLangLabel(normalizedDefLang)}`,
    dl.id === 1 ? "Each definition should be one short sentence." : dl.id === 2 ? "Each definition should be 2-3 sentences." : "Each definition should be detailed and include examples.",
    'Return JSON only: {"deckName":"...","tags":["#tag1","#tag2"],"cards":[{"word":"...","definition":"..."}]}'
  ].join("\n");
  const raw = await callGroq(prompt, 4000);
  const cleaned = raw.split("```json").join("").split("```").join("").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed.cards) || parsed.cards.length < 10) {
    throw new Error("AI returned an invalid deck.");
  }
  return {
    ...parsed,
    cards: parsed.cards.slice(0, 15),
  };
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

function LanguageInput({ value, onChange, listId, placeholder = "例: 日本語、English、Français" }) {
  return (
    <>
      <input
        className="settings-select"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {LANGUAGES.filter((lang) => lang.code !== "technical").map((lang) => (
          <option key={lang.code} value={lang.label} label={lang.code} />
        ))}
      </datalist>
    </>
  );
}

function SplashScreen() {
  const [logoFailed, setLogoFailed] = useState(false);
  const showImage = Boolean(SPLASH_LOGO_SRC) && !logoFailed;

  return (
    <div className="splash-screen" aria-label="mnemox スプラッシュスクリーン">
      <div className="splash-mark">
        {showImage ? (
          <img
            className="splash-logo-image"
            src={SPLASH_LOGO_SRC}
            alt={SPLASH_LOGO_ALT}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="splash-logo-text">mnemox</span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [decks, setDecks] = useState(() => normalizeDecks(SEED_DECKS));
  const [view, setView] = useState("home");
  const [activeDeck, setActiveDeck] = useState(null);
  const [editDeck, setEditDeck] = useState(null);
  const [quizMode, setQuizMode] = useState("choice");
  const [toast, setToast] = useState(null);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    getAnonymousUserId();
  }, []);

  useEffect(() => {
    const timerId = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timerId);
  }, []);

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
    showToast("デッキを作成しました");
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
      return normalizeDeck({ ...d, cards: newCards });
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
      {view==="home"      && <HomeView decks={decks} onOpenDetail={openDetail}
                               onNew={()=>{setEditDeck(null);setView("create");}}
                               onGenerate={()=>setView("generate")}
                               onLibrary={()=>setView("library")}
                               onToggleFav={toggleFavorite}
                               onEdit={d=>{setEditDeck(d);setView("create");}}
                               onDelete={id=>{setDecks(p=>p.filter(d=>d.id!==id));showToast("削除しました");}}/>}
      {view==="library"   && <LibraryView decks={decks.filter(d=>d.isPublic)} onBack={goHome} onOpenDetail={openDetail} onToggleFav={toggleFavorite}/>}
      {view==="generate"  && <GenerateView onSave={saveGeneratedDeck} onBack={goHome} showToast={showToast}/>}
      {view==="create"    && <CreateView initial={editDeck} onSave={saveDeck} onBack={goHome} showToast={showToast}/>}
      {view==="detail"    && activeDeck && <DetailView deck={syncActive(activeDeck.id)} onBack={goHome}
                               onStartMode={startMode}
                               onToggleFav={()=>toggleFavorite(activeDeck.id)}
                               onEdit={()=>{setEditDeck(syncActive(activeDeck.id));setView("create");}}
                               onDelete={()=>{setDecks(p=>p.filter(d=>d.id!==activeDeck.id));showToast("削除しました");goHome();}}
                               onUpdateCard={updateCard} onAddCard={addCard} onDeleteCard={deleteCard} showToast={showToast}/>}
      {view==="flip"      && activeDeck && <FlipView  deck={syncActive(activeDeck.id)} onBack={()=>setView("detail")}/>}
      {view==="quiz"      && activeDeck && <QuizView  deck={syncActive(activeDeck.id)} mode={quizMode} onBack={()=>setView("detail")} onCleared={markCleared} onUpdateStreaks={updateStreaks} showToast={showToast}/>}
    </div>
  );
}

// HOME
function AppSidebar({active,onHome,onLibrary,onGenerate,onNew}) {
  const items = [
    { id: "home", label: "ホーム", action: onHome },
    { id: "library", label: "公開ライブラリ", action: onLibrary },
    { id: "generate", label: "AI生成", action: onGenerate },
    { id: "create", label: "新規作成", action: onNew },
  ].filter((item)=>typeof item.action === "function");

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">M</div>
        <div>
          <div className="sidebar-brand-title">MNEMOX</div>
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
            {item.label}
          </button>
        ))}
      </div>

      <div className="sidebar-note">
        <span className="sidebar-note-kicker">使い方</span>
        <p>セットを作成して、フラッシュカードかクイズで繰り返し覚えます。</p>
      </div>
    </aside>
  );
}

function HomeView({decks,onOpenDetail,onNew,onGenerate,onLibrary,onToggleFav,onEdit,onDelete}) {
  const [filter,setFilter] = useState("all");
  const shown = filter==="fav" ? decks.filter(d=>d.favorited) : decks;
  const totalCards = decks.reduce((sum, deck)=>sum + deck.cards.length, 0);
  const favoriteCount = decks.filter((deck)=>deck.favorited).length;
  const publicCount = decks.filter((deck)=>deck.isPublic).length;
  return (
    <div className="page">
      <Navbar right={
        <button className="nbtn primary" onClick={onNew}>新しいセット</button>
      }/>
      <div className="quizlet-shell">
        <AppSidebar
          active="home"
          onHome={()=>setFilter("all")}
          onLibrary={onLibrary}
          onGenerate={onGenerate}
          onNew={onNew}
        />

        <main className="shell-main">
          <section className="dashboard-hero">
            <div className="section-kicker">学習ホーム</div>
            <h1 className="dashboard-title">自分の学習セットをまとめて管理</h1>
            <p className="dashboard-copy">Quizletのように、セット一覧からすぐ学習モードへ入り、必要ならAIでカードを増やせる構成にしました。</p>
            <div className="dashboard-actions">
              <button className="nbtn ai-btn" onClick={onGenerate}>AIでセット生成</button>
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
                    <button className="nbtn ai-btn" onClick={onGenerate}>AI生成</button>
                    <button className="nbtn primary" onClick={onNew}>新規セット</button>
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
          <span className="study-set-type">{deck.isPublic ? "公開セット" : "マイセット"}</span>
          <div className="tile-fav-wrap">
            <button className={"fav-btn study-fav-btn"+(deck.favorited?" fav-on":"")} onClick={onFav}>{deck.favorited ? "保存済み" : "保存"}</button>
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
  const [defLang, setDefLang] = useState(toLanguageInputValue("ja"));
  const [detailLevel, setDetailLevel] = useState(2);
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newWord, setNewWord] = useState("");
  const [newDef, setNewDef] = useState("");
  const [remainingGenerations, setRemainingGenerations] = useState(() => getRemainingGenerateCount());

  const selectedDetail = DETAIL_LEVELS.find((item) => item.id === detailLevel) || DETAIL_LEVELS[1];

  useEffect(() => {
    const refreshRemaining = () => setRemainingGenerations(getRemainingGenerateCount());
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshRemaining();
    };

    refreshRemaining();
    window.addEventListener("focus", refreshRemaining);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshRemaining);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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

  const startGenerate = async () => {
    if (!topic.trim()) {
      showToast("テーマを入力してください", "err");
      return;
    }

    const usage = consumeGenerateUsageSlot();
    setRemainingGenerations(getRemainingGenerateCount());
    if (!usage.allowed) {
      setError(AI_GENERATE_LIMIT_MESSAGE);
      showToast(AI_GENERATE_LIMIT_MESSAGE, "err");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const normalizedDefLang = normalizeLanguageValue(defLang);
      const result = await aiGenerateDeck({ topic, defLang: normalizedDefLang, detailLevel });
      const cards = result.cards.map((card) => ({
        id: uid(),
        word: card.word,
        definition: card.definition,
      }));

      setGenerated({
        id: "gen-" + uid(),
        name: result.deckName,
        author: "AIアシスタント",
        isPublic: false,
        wordLang: "technical",
        defLang: normalizedDefLang,
        detailLevel,
        tags: result.tags || [],
        aiGenerated: true,
        cleared: false,
        masteredIds: [],
        favorited: false,
        favCount: 0,
        cards,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成に失敗しました。";
      setError(message);
      showToast(message, "err");
    } finally {
      setLoading(false);
    }
  };

  const saveDeck = () => {
    if (!generated) return;
    onSave(generated);
  };

  return (
    <div className="page-shell">
      <Navbar
        left={<button className="nav-btn" onClick={onBack}>戻る</button>}
        center={<div className="nav-title">AI生成</div>}
      />

      <div className="hero-panel">
        <div className="section-title">学習デッキを生成</div>
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

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span>定義の言語</span>
              <LanguageInput value={defLang} onChange={setDefLang} listId="generate-definition-language-options" />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>カード数</span>
              <input className="settings-select" value="10〜15枚固定" readOnly />
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
            <span>本日のAI生成残り: {remainingGenerations}/{AI_GENERATE_DAILY_LIMIT}</span>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="nbtn primary" onClick={startGenerate} disabled={loading}>
              {loading ? "生成中..." : "デッキを生成"}
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
            <button className="nbtn primary" onClick={saveDeck}>デッキを保存</button>
            <button className="nbtn" onClick={startGenerate} disabled={loading}>再生成</button>
          </div>
        </div>
      )}
    </div>
  );
}
function LibraryView({decks,onBack,onOpenDetail,onToggleFav}) {
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
      <Navbar right={<button className="nbtn ghost" onClick={onBack}>ホームへ戻る</button>} />

      <div className="quizlet-shell">
        <AppSidebar
          active="library"
          onHome={onBack}
          onLibrary={()=>{}}
        />

        <main className="shell-main">
          <section className="dashboard-hero compact-hero">
            <div className="section-kicker">公開ライブラリ</div>
            <h1 className="dashboard-title">公開されている学習セットを探す</h1>
            <p className="dashboard-copy">人気タグで絞り込み、気になるセットを保存して自分の学習に取り込めます。</p>
            <div className="search-row">
              <input
                className="search-input"
                placeholder="デッキ名やタグで検索"
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

  const modes=[
    { id:"flip", label:"フラッシュカード", desc:"1枚ずつカードをめくって確認します。", color:"#22c55e" },
    { id:"quiz-choice", label:"4択クイズ", desc:"4つの選択肢から答えます。", color:"#0ea5e9" },
    { id:"quiz-write", label:"記述クイズ", desc:"答えを自分で入力します。", color:"#f97316" },
  ];
  const masteredCount = (deck.masteredIds || []).length;

  return (
    <div className="page detail-page">
      <Navbar
        left={<button className="nbtn ghost" onClick={onBack}>戻る</button>}
        center={<div className="study-deck-title">学習セット</div>}
        right={(
          <div style={{ display:"flex", gap:8 }}>
            <button className="nbtn" onClick={onToggleFav}>{deck.favorited ? "保存解除" : "保存"}</button>
            <button className="nbtn" onClick={onEdit}>デッキ編集</button>
            <button className="nbtn danger" onClick={onDelete}>削除</button>
          </div>
        )}
      />

      <section className="set-header-card">
        <div className="set-header-main">
          <div className="section-kicker">{deck.isPublic ? "公開セット" : "マイセット"}</div>
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
            <button key={mode.id} className="mode-big-btn" style={{ "--mc": mode.color }} onClick={()=>onStartMode(mode.id)}>
              <strong>{mode.label}</strong>
              <span>{mode.desc}</span>
            </button>
          ))}
        </div>
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
                      <button className="nbtn ghost" onClick={()=>startEdit(card)}>編集</button>
                      <button className="nbtn danger" onClick={()=>removeCard(card)}>削除</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          </div>
        </section>

        <aside className="composer-panel">
          <div className="section-head">
            <div>
              <div className="section-kicker">用語を追加</div>
              <h2 className="section-heading">新しいカード</h2>
            </div>
          </div>
          <div className="composer-form">
            <input className="settings-select" value={newWord} onChange={(e)=>setNewWord(e.target.value)} placeholder="単語" />
            <textarea
              className="settings-select"
              value={newDef}
              onChange={(e)=>setNewDef(e.target.value)}
              placeholder="定義"
              rows={5}
              style={{ resize:"vertical" }}
            />
            <div className="composer-actions">
              <button className="nbtn" onClick={generateNewDefinition} disabled={generatingNew}>
                {generatingNew ? "生成中..." : "定義を生成"}
              </button>
              <button className="nbtn primary" onClick={addCard}>カードを追加</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CreateView({initial,onSave,onBack,showToast}) {
  const isEdit = !!initial;
  const [name,setName]=useState(initial?.name || "");
  const [isPublic,setIsPublic]=useState(initial?.isPublic ?? true);
  const [wordLang,setWordLang]=useState(initial?.wordLang || "ja");
  const [defLang,setDefLang]=useState(toLanguageInputValue(initial?.defLang || "ja"));
  const [detailLevel,setDetailLevel]=useState(initial?.detailLevel || 2);
  const [tags,setTags]=useState(initial?.tags || []);
  const [tagInput,setTagInput]=useState("");
  const [cards,setCards]=useState(initial?.cards?.length ? initial.cards : [{ id:uid(), word:"", definition:"" }]);
  const [generatingCardId,setGeneratingCardId]=useState(null);

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
    const target = cards.find((card)=>card.id===cardId);
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
        otherWords: cards.filter((card)=>card.id!==cardId).map((card)=>card.word),
      });
      updateCard(cardId, "definition", definition);
      showToast("定義を生成しました");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI生成に失敗しました", "err");
    } finally {
      setGeneratingCardId(null);
    }
  };

  const handleSave=()=>{
    if(!name.trim()){
      showToast("デッキ名を入力してください","err");
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
        center={<span className="nav-center-title">{isEdit ? "デッキ編集" : "デッキ作成"}</span>}
        right={<button className="nbtn primary" onClick={handleSave}>保存</button>}
      />

      <div style={{ maxWidth:800, margin:"0 auto", padding:"36px 0 100px" }}>
        <input className="create-name-input" placeholder="デッキ名" value={name} onChange={(e)=>setName(e.target.value)} />

        <div className="settings-card">
          <div style={{ display:"grid", gap:14 }}>
            <label style={{ display:"grid", gap:8 }}>
              <span className="settings-label">単語の言語</span>
              <select className="settings-select" value={wordLang} onChange={(e)=>setWordLang(e.target.value)}>
                {LANGUAGES.map((lang)=>(
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display:"grid", gap:8 }}>
              <span className="settings-label">定義の言語</span>
              <LanguageInput value={defLang} onChange={setDefLang} listId="create-definition-language-options" />
            </label>

            {wordLang === "technical" && (
              <div style={{ color: "var(--text3)", fontSize: 13 }}>
                専門用語は、日本国内で一般的に使われている用語として扱います。
              </div>
            )}

            <label style={{ display:"grid", gap:8 }}>
              <span className="settings-label">説明の詳しさ</span>
              <select className="settings-select" value={detailLevel} onChange={(e)=>setDetailLevel(Number(e.target.value))}>
                {DETAIL_LEVELS.map((level)=>(
                  <option key={level.id} value={level.id}>{level.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="checkbox" checked={isPublic} onChange={(e)=>setIsPublic(e.target.checked)} />
              <span className="settings-label">公開デッキにする</span>
            </label>
          </div>
        </div>

        <div className="settings-card" style={{ marginTop:18 }}>
          <div className="section-title">タグ</div>
          <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
            <input className="settings-select" value={tagInput} onChange={(e)=>setTagInput(e.target.value)} placeholder="タグを追加" />
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
                  <strong>カード {index + 1}</strong>
                  <button className="nbtn danger" onClick={()=>deleteCard(card.id)}>削除</button>
                </div>
                <div style={{ display:"grid", gap:8 }}>
                  <input className="settings-select" value={card.word} onChange={(e)=>updateCard(card.id,"word",e.target.value)} placeholder="単語" />
                  <textarea
                    className="settings-select"
                    value={card.definition}
                    onChange={(e)=>updateCard(card.id,"definition",e.target.value)}
                    placeholder="定義"
                    rows={4}
                    style={{ resize:"vertical" }}
                  />
                  <div>
                    <button className="nbtn" onClick={()=>generateCardDefinition(card.id)} disabled={generatingCardId===card.id}>
                      {generatingCardId===card.id ? "生成中..." : "定義を生成"}
                    </button>
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

  useEffect(() => {
    setQi(0);
    setFlipped(false);
  }, [deck?.id]);

  if (!cards.length) {
    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">学習中: {deck?.name || "無題"}</span>
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
    setFlipped(false);
    setQi((i) => (i - 1 + cards.length) % cards.length);
  };

  const goNext = () => {
    setFlipped(false);
    setQi((i) => (i + 1) % cards.length);
  };

  return (
    <div className="study-page">
      <div className="study-nav">
        <button className="nbtn ghost" onClick={onBack}>戻る</button>
        <span className="study-deck-title">学習中: {deck.name}</span>
        <button className="mode-switch-btn" onClick={() => { setFrontIsWord((f) => !f); setFlipped(false); }}>
          {frontIsWord ? "単語を先に表示" : "定義を先に表示"}
        </button>
      </div>

      <div className="study-wrap">
        <div className="study-progress">{qi + 1} / {cards.length}</div>
        <button
          type="button"
          className={"flashcard " + (flipped ? "is-flipped" : "")}
          onClick={() => setFlipped((v) => !v)}
          style={{ cursor: "pointer" }}
        >
          <div className="flashcard-inner">
            <div className="flashcard-face flashcard-front">
              <div className="fc-label">{frontIsWord ? "単語" : "定義"}</div>
              <div className="fc-text">{frontText || "-"}</div>
              <div className="fc-hint">タップして裏返す</div>
            </div>
            <div className="flashcard-face flashcard-back">
              <div className="fc-label">{frontIsWord ? "定義" : "単語"}</div>
              <div className="fc-text">{backText || "-"}</div>
              <div className="fc-hint">タップして戻る</div>
            </div>
          </div>
        </button>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="fc-nav" onClick={goPrev}>前へ</button>
          <button className="fc-nav primary" onClick={() => setFlipped((v) => !v)}>
            {flipped ? "答えを隠す" : "答えを見る"}
          </button>
          <button className="fc-nav" onClick={goNext}>次へ</button>
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {cards.map((_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === qi ? "var(--accent)" : "var(--border2)",
                display: "inline-block"
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuizView({deck,mode,onBack,onCleared,onUpdateStreaks,showToast}) {
  const cards = deck?.cards || [];
  const [queue, setQueue] = useState(() => shuffle(cards));
  const [qi, setQi] = useState(0);
  const [choices, setChoices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [answering, setAnswering] = useState(false);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const shuffled = shuffle(cards);
    setQueue(shuffled);
    setQi(0);
    setSelectedId(null);
    setInput("");
    setFeedback("");
    setResults([]);
    setDone(false);
  }, [deck?.id, cards.length]);

  useEffect(() => {
    if (mode !== "choice") return;
    const current = queue[qi];
    if (!current) {
      setChoices([]);
      return;
    }
    const others = shuffle(cards.filter((c) => c.id !== current.id)).slice(0, 3);
    setChoices(shuffle([current, ...others]));
  }, [mode, qi, queue, cards]);

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

  const current = queue[qi];
  const correctCount = results.filter((r) => r.correct).length;
  const percent = cards.length ? Math.round((correctCount / cards.length) * 100) : 0;

  const finishQuiz = async (finalResults) => {
    onUpdateStreaks(deck.id, finalResults);
    if (finalResults.every((r) => r.correct)) {
      onCleared(deck.id);
      showToast?.("デッキ達成です！", "success");
      setDone(true);
      return;
    }

    try {
      const mastery = await aiMastery(finalResults);
      if (mastery.cleared) {
        onCleared(deck.id);
        showToast?.(mastery.message || "デッキ達成です！", "success");
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
    await commitResult(ok, ok ? "正解" : "答え: " + current.definition);
  };

  const submitWrite = async () => {
    if (!current || answering || done) return;
    const guess = input.trim();
    if (!guess) return;

    setAnswering(true);
    let ok = false;
    let message = "もう一度挑戦してください";

    const normalizedGuess = guess.toLowerCase();
    const normalizedAnswer = String(current.definition || "").trim().toLowerCase();
    if (normalizedGuess && normalizedGuess === normalizedAnswer) {
      ok = true;
      message = "正解";
    } else {
      try {
        const judged = await aiEval(current.word, current.definition, guess, deck.defLang);
        ok = Boolean(judged?.correct);
        message = judged?.feedback || (ok ? "正解" : "答え: " + current.definition);
      } catch {
        ok = false;
        message = "答え: " + current.definition;
      }
    }

    await commitResult(ok, message);
  };

  if (done) {
    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">クイズ結果</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="study-wrap">
          <CircularProgress percent={percent} />
          <div className="result-card">
            <h3>{correctCount} / {cards.length} 問正解</h3>
            <p>{percent === 100 ? "満点です。" : "間違えたカードを見直して再挑戦しましょう。"}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="nbtn" onClick={onBack}>デッキに戻る</button>
              <button className="nbtn primary" onClick={() => {
                const shuffled = shuffle(cards);
                setQueue(shuffled);
                setQi(0);
                setSelectedId(null);
                setInput("");
                setFeedback("");
                setResults([]);
                setDone(false);
              }}>もう一度</button>
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

      <div className="study-wrap">
        <div className="quiz-card">
          <div className="fc-label">単語</div>
          <div className="fc-text">{current?.word || "-"}</div>
          <div className="fc-hint">{mode === "choice" ? "4択で答えてください。" : "定義を入力してください。"}</div>
        </div>

        {mode === "choice" ? (
          <div className="choice-grid">
            {choices.map((choice) => {
              return (
                <button
                  key={choice.id}
                  className={"choice-btn " + (selectedId === choice.id ? "selected" : "")}
                  onClick={() => submitChoice(choice)}
                  disabled={Boolean(selectedId)}
                >
                  {choice.definition}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <textarea
              className="text-input"
              rows={5}
              placeholder="定義を入力"
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
            <stop offset="100%" stopColor="#9333ea" />
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

// SHARED
function Navbar({left,center,right}) {
  return (
    <header className="navbar">
      <div className="navbar-left">{left||<div className="logo">MNEMOX</div>}</div>
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
    ":root{--bg:#f0f2f8;--surface:#fff;--surface2:#f4f6fb;--surface3:#e8ebf4;--border:#e0e4f0;--border2:#c8ceea;--accent:#6c63ff;--accent2:#5a52e0;--accent-dim:rgba(108,99,255,.1);--coral:#ff6b6b;--coral-dim:rgba(255,107,107,.1);--red:#ef4444;--red-dim:rgba(239,68,68,.1);--green:#22c55e;--green-dim:rgba(34,197,94,.1);--text:#1e1b4b;--text2:#6b7280;--text3:#9ca3af;--ff:'Outfit','Noto Sans JP',sans-serif;--r:16px;--r-sm:10px;--shadow:0 4px 20px rgba(108,99,255,.12);--shadow-lg:0 8px 40px rgba(108,99,255,.18);}",
    "html,body{background:var(--bg);color:var(--text);font-family:var(--ff);min-height:100vh;}",
    ".app{min-height:100vh;background:var(--bg);}",
    ".splash-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at top,#eef2ff 0%,#f8fafc 45%,#e2e8f0 100%);}",
    ".splash-mark{display:flex;align-items:center;justify-content:center;min-width:min(80vw,420px);min-height:180px;padding:32px 40px;border-radius:32px;background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.85);box-shadow:0 24px 60px rgba(15,23,42,.12);backdrop-filter:blur(16px);}",
    ".splash-logo-text{font-family:'Outfit','Noto Sans JP',sans-serif;font-size:clamp(42px,8vw,78px);font-weight:800;letter-spacing:.08em;text-transform:lowercase;color:var(--text);}",
    ".splash-logo-image{display:block;max-width:min(72vw,320px);max-height:140px;object-fit:contain;}",
    // navbar
    ".navbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 24px;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:200;}",
    ".navbar-left{display:flex;align-items:center;}",
    ".navbar-center{display:flex;align-items:center;justify-content:center;}",
    ".navbar-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;}",
    ".logo{font-family:'Outfit',sans-serif;font-weight:800;font-size:22px;letter-spacing:.04em;background:linear-gradient(135deg,var(--accent),var(--coral));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}",
    ".nav-center-title{font-weight:700;font-size:16px;color:var(--text);}",
    // buttons
    ".nbtn{font-family:var(--ff);font-weight:600;font-size:14px;padding:9px 18px;border-radius:var(--r-sm);cursor:pointer;transition:all .2s;border:1.5px solid transparent;}",
    ".nbtn.primary{background:var(--accent);color:#fff;border-color:var(--accent);}",
    ".nbtn.primary:hover{background:var(--accent2);}",
    ".nbtn.primary:disabled{opacity:.45;cursor:default;}",
    ".nbtn.ghost{background:transparent;color:var(--text2);border-color:var(--border2);}",
    ".nbtn.ghost:hover{background:var(--surface2);color:var(--text);}",
    ".nbtn.danger{background:transparent;color:var(--red);border-color:rgba(239,68,68,.35);}",
    ".nbtn.danger:hover{background:var(--red-dim);}",
    ".nbtn.ai-btn{background:linear-gradient(135deg,var(--accent),#9333ea);color:#fff;border-color:transparent;}",
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
    ".quizlet-shell{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;padding-top:32px;align-items:start;}",
    ".shell-main{min-width:0;display:grid;gap:24px;}",
    ".app-sidebar{position:sticky;top:84px;display:grid;gap:18px;}",
    ".sidebar-brand,.sidebar-note,.sidebar-group{background:var(--surface);border:1px solid var(--border);border-radius:22px;box-shadow:0 10px 30px rgba(15,23,42,.05);}",
    ".sidebar-brand{display:flex;align-items:center;gap:14px;padding:18px 20px;}",
    ".sidebar-brand-mark{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--accent),#2dd4bf);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:800;}",
    ".sidebar-brand-title{font-size:18px;font-weight:800;color:var(--text);}",
    ".sidebar-brand-sub{font-size:13px;color:var(--text2);}",
    ".sidebar-group{display:grid;gap:6px;padding:12px;}",
    ".sidebar-link{font-family:var(--ff);font-size:14px;font-weight:700;padding:13px 14px;border:none;border-radius:16px;background:transparent;color:var(--text2);text-align:left;cursor:pointer;transition:all .18s;}",
    ".sidebar-link:hover,.sidebar-link-on{background:linear-gradient(135deg,rgba(108,99,255,.14),rgba(45,212,191,.14));color:var(--text);}",
    ".sidebar-note{padding:18px 20px;display:grid;gap:8px;}",
    ".sidebar-note-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent2);}",
    ".sidebar-note p{font-size:13px;color:var(--text2);line-height:1.6;}",
    ".home-hero{padding:36px 0 22px;}",
    ".home-title{font-size:28px;font-weight:800;margin-bottom:18px;}",
    ".dashboard-hero{background:linear-gradient(135deg,#ffffff,#eef2ff 60%,#ecfeff);border:1px solid var(--border);border-radius:28px;box-shadow:0 18px 40px rgba(15,23,42,.06);}",
    ".compact-hero{padding-bottom:28px;}",
    ".dashboard-title{font-size:clamp(30px,4vw,44px);font-weight:800;line-height:1.08;color:var(--text);max-width:12ch;}",
    ".dashboard-copy{font-size:15px;line-height:1.7;color:var(--text2);margin-top:12px;max-width:64ch;}",
    ".dashboard-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;}",
    ".stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:24px;}",
    ".stat-chip{display:grid;gap:4px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.9);border:1px solid rgba(108,99,255,.12);}",
    ".stat-chip strong{font-size:24px;font-weight:800;color:var(--text);}",
    ".stat-chip span{font-size:13px;color:var(--text2);}",
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
    ".study-fav-btn{width:auto;height:auto;padding:7px 12px;border-radius:999px;font-size:12px;font-weight:800;color:var(--text2);}",
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
    ".set-header-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;background:linear-gradient(135deg,#ffffff,#eef2ff 60%,#f8fafc);border:1px solid var(--border);border-radius:28px;box-shadow:0 18px 40px rgba(15,23,42,.06);margin-top:32px;}",
    ".set-header-main{min-width:0;}",
    ".set-header-title{font-size:clamp(30px,4vw,44px);font-weight:800;line-height:1.08;color:var(--text);}",
    ".set-header-copy{margin-top:12px;font-size:15px;line-height:1.7;color:var(--text2);max-width:62ch;}",
    ".set-meta-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px;}",
    ".set-meta-card{display:grid;gap:6px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.92);border:1px solid rgba(108,99,255,.12);}",
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
    ".detail-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;margin-top:20px;align-items:start;}",
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
    ".composer-actions{display:grid;gap:10px;}",
    // preview card
    ".preview-card{width:min(500px,100%);height:230px;perspective:1200px;cursor:pointer;margin:0 auto;}",
    ".preview-inner{width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,0,.2,1);}",
    ".preview-card.flipped .preview-inner{transform:rotateY(180deg);}",
    ".preview-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:var(--r);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:26px;}",
    ".preview-front{background:var(--surface);border:1.5px solid var(--border);}",
    ".preview-back{transform:rotateY(180deg);background:linear-gradient(135deg,var(--accent),#9333ea);}",
    ".preview-lang{font-size:11px;color:var(--text3);margin-bottom:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}",
    ".preview-word{font-size:clamp(20px,4vw,36px);font-weight:800;text-align:center;color:var(--text);}",
    ".preview-def{font-size:clamp(13px,2vw,17px);text-align:center;color:#fff;line-height:1.6;}",
    ".prev-nav-btn{background:var(--surface);border:1.5px solid var(--border);border-radius:50%;width:38px;height:38px;color:var(--text2);font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}",
    ".prev-nav-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff;}",
    // card rows
    ".card-row{display:grid;grid-template-columns:32px 1fr 18px 1fr 86px;align-items:start;gap:10px;padding:12px 14px;background:var(--surface);border-radius:var(--r-sm);border:1px solid transparent;transition:background .15s;}",
    ".card-row:hover{background:var(--surface2);border-color:var(--border);}",
    ".card-row-editing{background:var(--surface2)!important;border:1.5px solid var(--accent)!important;grid-template-columns:32px 1fr 56px!important;}",
    ".card-row-adding{background:rgba(108,99,255,.04)!important;border:1.5px dashed var(--accent)!important;grid-template-columns:32px 1fr 56px!important;}",
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
    ".gen-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#9333ea);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}",
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
    ".study-nav{display:flex;align-items:center;justify-content:space-between;padding:13px 24px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.92);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;}",
    ".study-deck-title{font-size:14px;font-weight:700;color:var(--text);}",
    ".study-progress-bar{height:4px;background:var(--surface3);}",
    ".study-progress-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--coral));transition:width .35s ease;}",
    ".mode-switch-btn{font-family:var(--ff);font-size:13px;font-weight:600;padding:6px 13px;border-radius:var(--r-sm);background:var(--surface2);border:1.5px solid var(--border);color:var(--text2);cursor:pointer;}",
    ".flip-stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;gap:26px;}",
    ".fc{width:min(560px,90vw);height:288px;perspective:1200px;cursor:pointer;}",
    ".fc-inner{width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,0,.2,1);}",
    ".fc.flipped .fc-inner{transform:rotateY(180deg);}",
    ".fc-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:var(--r);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;}",
    ".fc-front{background:var(--surface);border:1.5px solid var(--border);}",
    ".fc-back{transform:rotateY(180deg);background:linear-gradient(135deg,var(--accent),#9333ea);}",
    ".fc-lang{font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.08em;position:absolute;top:16px;}",
    ".fc-term{font-size:clamp(24px,5vw,50px);font-weight:800;text-align:center;color:var(--text);}",
    ".fc-def{font-size:clamp(13px,2.2vw,19px);text-align:center;color:#fff;line-height:1.65;}",
    ".fc-nav{background:var(--surface);border:1.5px solid var(--border);border-radius:50%;width:48px;height:48px;font-size:21px;color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}",
    ".fc-nav:hover{background:var(--accent);border-color:var(--accent);color:#fff;}",
    ".quiz-stage{flex:1;display:flex;flex-direction:column;align-items:center;padding:28px 20px;gap:18px;max-width:660px;margin:0 auto;width:100%;}",
    ".choices-grid{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:9px;}",
    ".choice-btn{padding:16px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-sm);font-family:var(--ff);font-size:14px;color:var(--text);cursor:pointer;text-align:center;line-height:1.5;transition:all .18s;}",
    ".choice-btn:hover{border-color:var(--accent);background:var(--accent-dim);}",
    ".c-correct{border-color:var(--green)!important;background:var(--green-dim)!important;color:var(--green)!important;font-weight:700;}",
    ".c-wrong{border-color:var(--red)!important;background:var(--red-dim)!important;color:var(--red)!important;}",
    ".write-textarea{width:100%;min-height:100px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:14px;font-family:var(--ff);font-size:15px;color:var(--text);outline:none;resize:none;line-height:1.6;}",
    ".write-textarea:focus{border-color:var(--accent);}",
    ".write-textarea:disabled{opacity:.45;}",
    ".result-stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;gap:14px;text-align:center;}",
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
    "@media(max-width:1100px){.quizlet-shell{grid-template-columns:1fr;}.app-sidebar{position:static;}.sidebar-group{grid-template-columns:repeat(2,minmax(0,1fr));}.set-header-card,.detail-layout{grid-template-columns:1fr;}.composer-panel{position:static;}.set-action-row{min-width:0;flex-direction:row;flex-wrap:wrap;}.set-meta-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}",
    "@media(max-width:860px){.study-set-card{grid-template-columns:1fr;}.study-set-thumb{min-height:140px;}.term-row{grid-template-columns:1fr;}.term-row-editing{grid-template-columns:1fr;}.term-edit-grid{grid-template-columns:1fr;}.term-actions{justify-content:flex-start;}.navbar{grid-template-columns:1fr;gap:10px;}.navbar-left,.navbar-center,.navbar-right{justify-content:flex-start;}.section-head{align-items:flex-start;flex-direction:column;}}",
    "@media(max-width:640px){.page-shell,.page{padding:0 16px 72px;}.dashboard-title,.set-header-title{max-width:none;}.stats-row,.set-meta-grid{grid-template-columns:1fr;}.sidebar-group{grid-template-columns:1fr;}.study-set-content{padding:18px;}}",

  ].join("\n");
  return <style dangerouslySetInnerHTML={{__html: css}}/>;
}



