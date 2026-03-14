import { useState, useCallback, useRef, useEffect, Component } from "react";
import "./App.css";
import { getAnonymousUserId, trackEvent, isNewUser } from "./lib/tracking.js";
import { LANGUAGES, AI_GENERATE_DAILY_LIMIT, LIMITS, DETAIL_LEVELS, WORD_COUNTS, SPLASH_DURATION_MS, SPLASH_LOGO_SRC, SPLASH_LOGO_ALT } from "./constants.js";
import { SEED_DECKS, SAMPLE_CARD_DEFINITIONS } from "./data.js";
import { normalizeLanguageValue, getLangLabel, toLanguageInputValue, getDeckTheme, looksGarbled, cleanText, normalizeCard, normalizeDeck, normalizeDecks, uid, shuffle } from "./utils.js";
import { callAI, fetchDeckFromCacheOrGenerate, aiSuggest, aiEval, aiMastery } from "./api.js";

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
    try { localStorage.removeItem("flash_auto_decks"); } catch {}
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

function CharCount({ value, max }) {
  const n = (value || "").length;
  const over = n > max;
  return (
    <span style={{ fontSize: 11, color: over ? "var(--red)" : "var(--text3)", alignSelf: "flex-end" }}>
      {over && <span style={{ marginRight: 4 }}>⚠ {max}文字以内で入力してください</span>}
      {n}/{max}
    </span>
  );
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
      const saved = localStorage.getItem("flash_auto_decks");
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
      localStorage.setItem("flash_auto_decks", JSON.stringify(decks));
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
        <SplashScreen/>
      </div>
    );
  }

  return (
    <div className="app">
      {toast && <Toast msg={toast.msg} type={toast.type}/>}
      <MobileDrawer open={menuOpen} onClose={()=>setMenuOpen(false)}
        credits={appCredits}
        onHome={()=>{goHome();setMenuOpen(false);}}
        onMyLibrary={()=>{goHome();setMenuOpen(false);setTimeout(()=>document.getElementById("my-set-section")?.scrollIntoView({behavior:"smooth"}),100);}}
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
      {view==="generate"  && <GenerateView onSave={saveGeneratedDeck} onBack={goHome} showToast={showToast} onCreditsUpdate={setAppCredits}/>}
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
function MobileDrawer({open,onClose,credits,onHome,onMyLibrary,onLibrary,onGenerate,onNew,activeView}) {
  const items = [
    { id:"home", label:"ホーム", icon:"🏠", action:onHome },
    { id:"my-library", label:"ライブラリ", icon:"📚", desc:"作成・保存した学習セット", action:onMyLibrary || onHome },
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
              className="nbtn primary feedback-modal-btn"
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
function AppSidebar({active,onHome,onMyLibrary,onLibrary,credits}) {
  const items = [
    { id: "home", label: "ホーム", icon: "🏠", action: onHome },
    { id: "my-library", label: "ライブラリ", icon: "📚", desc: "作成・保存した学習セット", action: onMyLibrary || onHome },
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

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  const shown = (() => {
    let list = filter==="fav" ? decks.filter(d=>d.favorited) : decks;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(d =>
        d.name?.toLowerCase().includes(q) ||
        d.tags?.some(t => t.toLowerCase().includes(q)) ||
        d.cards?.some(c => c.word?.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    if (sortOrder === "newest")    sorted.reverse();
    if (sortOrder === "name-asc")  sorted.sort((a,b) => (a.name||"").localeCompare(b.name||"", "ja"));
    if (sortOrder === "cards-desc") sorted.sort((a,b) => (b.cards?.length||0) - (a.cards?.length||0));
    if (sortOrder === "cards-asc")  sorted.sort((a,b) => (a.cards?.length||0) - (b.cards?.length||0));
    return sorted;
  })();
  const totalCards = decks.reduce((sum, deck)=>sum + deck.cards.length, 0);
  const favoriteCount = decks.filter((deck)=>deck.favorited).length;
  const publicCount = decks.filter((deck)=>deck.isPublic).length;
  return (
    <div className="page">
      <Navbar onMenuClick={onMenuClick} right={
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div className={"credit-badge"+(credits===0?" credit-badge-zero":credits===1?" credit-badge-warn":"")}><svg className="credit-gem" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 10 12 22 22 10"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="12" y1="2" x2="7" y2="10"/><line x1="12" y1="2" x2="17" y2="10"/><line x1="7" y1="10" x2="12" y2="22"/><line x1="17" y1="10" x2="12" y2="22"/></svg><span>{credits}</span></div>
          <button className="nbtn ai-btn" onClick={onGenerate}>✨ AI作成</button>
          <button className="nbtn primary" onClick={onNew}>手動作成</button>
        </div>
      }/>
      <div className="app-shell">
        <AppSidebar
          active="home"
          onHome={()=>setFilter("all")}
          onMyLibrary={()=>{setFilter("all");setTimeout(()=>document.getElementById("my-set-section")?.scrollIntoView({behavior:"smooth"}),50);}}
          onLibrary={onLibrary}
          credits={credits}
        />

        <main className="shell-main">
          <section className="dashboard-hero">
            <div className="section-kicker">AI単語帳</div>
            <h1 className="dashboard-title">テーマを入れるだけ。<br/>AIが単語帳を自動作成。</h1>
            <p className="dashboard-copy">登録不要・無料・ブラウザだけで使える</p>

            <div className="quick-gen-box">
              <div className="quick-gen-input-row">
                <input
                  className="quick-gen-input"
                  value={quickTopic}
                  onChange={e => setQuickTopic(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !quickLoading && quickTopic.trim() && quickTopic.length <= LIMITS.TOPIC && handleQuickGenerate()}
                  placeholder="例：量子力学、TOEFL、経済学..."
                  disabled={quickLoading}
                  style={quickTopic.length > LIMITS.TOPIC ? { borderColor:"var(--red)" } : {}}
                />
                <button className="nbtn ai-btn quick-gen-btn" onClick={handleQuickGenerate} disabled={quickLoading || !quickTopic.trim() || quickTopic.length > LIMITS.TOPIC}>
                  {quickLoading ? "生成中..." : "✨ 無料で単語帳を作る"}
                </button>
              </div>
              {quickTopic.length > 0 && <div style={{ display:"flex", justifyContent:"flex-end", marginTop:2 }}><CharCount value={quickTopic} max={LIMITS.TOPIC} /></div>}
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
              <div className="stat-chip"><strong>{favoriteCount}</strong><span>保存済み</span></div>
              <div className="stat-chip"><strong>{publicCount}</strong><span>公開中</span></div>
            </div>
          </section>

          <section className="set-section" id="my-set-section">
            <div className="section-head">
              <div>
                <div className="section-kicker">マイセット</div>
                <h2 className="section-heading">{filter==="fav" ? "保存済みのセット" : "すべてのセット"}</h2>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <div className="filter-tabs">
                  <button className={"ftab"+(filter==="all"?" ftab-on":"")} onClick={()=>setFilter("all")}>すべて</button>
                  <button className={"ftab"+(filter==="fav"?" ftab-on":"")} onClick={()=>setFilter("fav")}>保存済み</button>
                </div>
                <select className="sort-select" value={sortOrder} onChange={e=>setSortOrder(e.target.value)}>
                  <option value="newest">新しい順</option>
                  <option value="oldest">古い順</option>
                  <option value="name-asc">名前順</option>
                  <option value="cards-desc">用語数が多い順</option>
                  <option value="cards-asc">用語数が少ない順</option>
                </select>
              </div>
            </div>
            <div className="set-search-row">
              <svg className="set-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="set-search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="セット名・タグ・単語で検索..."
              />
              {searchQuery && (
                <button className="set-search-clear" onClick={() => setSearchQuery("")} aria-label="クリア">✕</button>
              )}
            </div>

            {shown.length===0 ? (
              <div className="empty-state empty-panel">
                <div className="empty-emoji">SET</div>
                <p>{searchQuery.trim() ? `「${searchQuery.trim()}」に一致するセットが見つかりませんでした。` : filter==="fav" ? "保存済みのセットはまだありません。" : "まだセットがありません。まずは1つ作成してください。"}</p>
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
            <button className={"fav-btn study-fav-btn"+(deck.favorited?" fav-on":"")} onClick={onFav} title={deck.favorited?"保存済み":"保存"}><svg width="28" height="28" viewBox="0 0 24 24" fill={deck.favorited?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>
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
function GenerateView({onSave,onBack,showToast,onCreditsUpdate}) {
  const [topic, setTopic] = useState("");
  const [mustIncludeWords, setMustIncludeWords] = useState("");
  const [wordLang, setWordLang] = useState("technical");
  const [defLang, setDefLang] = useState("ja");
  const [detailLevel, setDetailLevel] = useState(2);
  const [generated, setGenerated] = useState(null);
  const [generatedCacheId, setGeneratedCacheId] = useState(null);
  const [fromCache, setFromCache] = useState(false);
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

  const applyGeneratedDeckResult = (deck, cacheId, creditsLeft, fallbackDefLang, source) => {
    setFromCache(source === "cache");
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
      const next = Math.max(0, creditsLeft);
      setRemainingCredits(next);
      onCreditsUpdate?.(next);
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
        ...(mustIncludeWords.trim() ? { mustIncludeWords: mustIncludeWords.trim() } : {}),
      });
      applyGeneratedDeckResult(result.deck, result.cacheId, result.remainingCredits, normalizedDefLang, result.source);
      trackEvent("generate_theme_deck", {
        theme: topic.trim(),
        deck_id: result.cacheId || null,
        generation_latency_ms: Date.now() - t0,
        generation_success: true,
        from_cache: result.source === "cache",
        action: "initial",
      });

      if (result.source === "cache") {
        showToast("以前に生成済みの内容を表示しました（クレジット消費なし）");
      } else {
        showToast("新しい単語帳を生成しました");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成に失敗しました。";
      if (typeof e.remainingCredits === "number") {
        setRemainingCredits(e.remainingCredits);
        onCreditsUpdate?.(e.remainingCredits);
      }
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
      if (typeof e.remainingCredits === "number") {
        setRemainingCredits(e.remainingCredits);
        onCreditsUpdate?.(e.remainingCredits);
      }
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
              style={topic.length > LIMITS.TOPIC ? { borderColor: "var(--red)" } : {}}
            />
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ color: "var(--text3)", fontSize: 13 }}>
                例：量子力学の入門（※1回につき10〜15枚のカードが生成されます）
              </span>
              <CharCount value={topic} max={LIMITS.TOPIC} />
            </div>
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span>必ず含める単語 <span style={{ color: "var(--text3)", fontWeight: 400 }}>（任意）</span></span>
            <input
              className="settings-select"
              value={mustIncludeWords}
              onChange={(e) => setMustIncludeWords(e.target.value)}
              placeholder="例：entropy, quantum, photon（カンマ区切りで入力）"
              style={mustIncludeWords.length > LIMITS.MUST ? { borderColor: "var(--red)" } : {}}
            />
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ color: "var(--text3)", fontSize: 13 }}>
                入力した単語は必ず単語帳に含まれます
              </span>
              <CharCount value={mustIncludeWords} max={LIMITS.MUST} />
            </div>
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
          </div>

          {remainingCredits === 0 ? (
            <div className="credit-zero-panel">
              <div className="credit-zero-icon">💤</div>
              <div className="credit-zero-body">
                <strong>本日の生成回数（{AI_GENERATE_DAILY_LIMIT}回）を使い切りました</strong>
                <span>深夜0時にリセットされます。それまでの間、保存済みの単語帳で学習できます。</span>
              </div>
              <button className="nbtn ghost" onClick={onBack}>学習に戻る</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="nbtn primary" onClick={startGenerate} disabled={loading || !topic.trim() || topic.length > LIMITS.TOPIC || mustIncludeWords.length > LIMITS.MUST}>
                {loading ? "生成中..." : "単語帳を生成"}
              </button>
              <button className="nbtn" onClick={onBack}>キャンセル</button>
              {remainingCredits === 1 && (
                <span className="credit-warn-badge">⚠️ 残り1回</span>
              )}
            </div>
          )}

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
          {fromCache && (
            <div className="cache-hit-banner">
              <span className="cache-hit-icon">♻️</span>
              <div className="cache-hit-body">
                <strong>以前に生成済みの内容を表示しています</strong>
                <span>同じテーマは再生成されません。クレジットは消費されていません。内容を変えたい場合は「必ず含める単語」を追加するか、テーマを変えてください。</span>
              </div>
            </div>
          )}
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
                    style={card.word.length > LIMITS.WORD ? { borderColor:"var(--red)" } : {}}
                  />
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                    <CharCount value={card.word} max={LIMITS.WORD} />
                  </div>
                  <textarea
                    className="settings-select"
                    value={card.definition}
                    onChange={(e) => updateCard(card.id, "definition", e.target.value)}
                    placeholder="定義"
                    rows={4}
                    style={{ resize: "vertical", ...(card.definition.length > LIMITS.DEF ? { borderColor:"var(--red)" } : {}) }}
                  />
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                    <CharCount value={card.definition} max={LIMITS.DEF} />
                  </div>
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
            <button className="nbtn primary" onClick={saveDeck} disabled={generated?.cards.some(c => c.word.length > LIMITS.WORD || c.definition.length > LIMITS.DEF)}>単語帳を保存</button>
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
            <button className={"nbtn fav-heart-btn"+(deck.favorited?" fav-on":"")} onClick={onToggleFav} title={deck.favorited?"保存済み":"保存"}><svg width="24" height="24" viewBox="0 0 24 24" fill={deck.favorited?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>
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

  const nameOver = name.length > LIMITS.NAME;
  const cardsHasError = cards.some(c => c.word.length > LIMITS.WORD || c.definition.length > LIMITS.DEF);
  const saveDisabled = nameOver || cardsHasError;

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
        right={<button className="nbtn primary" onClick={handleSave} disabled={saveDisabled}>保存</button>}
      />

      <div style={{ maxWidth:800, margin:"0 auto", padding:"24px 0 100px" }}>
        <div style={{ position:"relative" }}>
          <input className="create-name-input" placeholder="タイトルをつけてください" value={name} onChange={(e)=>setName(e.target.value)} style={nameOver ? { borderColor:"var(--red)" } : {}} />
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:4 }}>
            <CharCount value={name} max={LIMITS.NAME} />
          </div>
        </div>

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
                    <input className="settings-select" value={card.word} onChange={(e)=>updateCard(card.id,"word",e.target.value)} onBlur={()=>handleWordBlur(card.id)} placeholder="単語を入力" style={{ width:"100%", border:"none", borderBottom:`2px solid ${card.word.length>LIMITS.WORD?"var(--red)":"var(--accent)"}`, borderRadius:0, background:"transparent", paddingLeft:0 }} />
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
                      <div style={{ fontSize:12, color:"var(--muted)" }}>用語</div>
                      <CharCount value={card.word} max={LIMITS.WORD} />
                    </div>
                  </div>
                  <div style={{ flex:1, paddingLeft:16, display:"flex", flexDirection:"column" }}>
                    <AutoTextarea className="settings-select" value={card.definition} onChange={(e)=>updateCard(card.id,"definition",e.target.value)} placeholder={generatingCardId===card.id ? "生成中..." : "定義を入力"} disabled={generatingCardId===card.id} rows={1} style={{ width:"100%", border:"none", borderBottom:`2px solid ${card.definition.length>LIMITS.DEF?"var(--red)":"var(--accent)"}`, borderRadius:0, background:"transparent", paddingLeft:0, resize:"none", overflow:"hidden", fontFamily:"inherit", fontSize:"inherit", lineHeight:"1.5" }} />
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
                      <div style={{ fontSize:12, color:"var(--muted)" }}>{generatingCardId===card.id ? "AI生成中..." : "定義"}</div>
                      <CharCount value={card.definition} max={LIMITS.DEF} />
                    </div>
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

