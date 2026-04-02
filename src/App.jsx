import { useState, useCallback, useMemo, useEffect } from "react";
import "./App.css";
import { getAnonymousUserId, trackEvent, isNewUser } from "./lib/tracking.js";
import { SPLASH_DURATION_MS } from "./constants.js";
import { SEED_DECKS } from "./data.js";
import { normalizeDeck, normalizeDecks, uid } from "./utils.js";
import { publishDeck, togglePublicFav } from "./api.js";
import { supabase } from "./lib/supabase.js";

import { ErrorBoundary } from "./components/shared/ErrorBoundary.jsx";
import { SplashScreen } from "./components/shared/SplashScreen.jsx";
import { Toast } from "./components/shared/Navbar.jsx";
import { FeedbackFab } from "./components/shared/FeedbackFab.jsx";
import { MobileDrawer } from "./components/layout/MobileDrawer.jsx";
import { HomeView } from "./components/home/HomeView.jsx";
import { LibraryView } from "./components/library/LibraryView.jsx";
import { GenerateView } from "./components/generate/GenerateView.jsx";
import { CreateView } from "./components/create/CreateView.jsx";
import { DetailView } from "./components/detail/DetailView.jsx";
import { FlipView } from "./components/study/FlipView.jsx";
import { QuizView } from "./components/study/QuizView.jsx";
import { StatsView } from "./components/stats/StatsView.jsx";

export { ErrorBoundary };

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
  const [isTestMode, setIsTestMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  // 公開デッキのお気に入り管理（publicId の Set）
  const [publicFavIds, setPublicFavIds] = useState(() => {
    try {
      const saved = localStorage.getItem("flash_auto_pub_favs");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    try {
      localStorage.setItem("flash_auto_pub_favs", JSON.stringify([...publicFavIds]));
    } catch {}
  }, [publicFavIds]);

  useEffect(() => {
    const newUser = isNewUser();
    const userId = getAnonymousUserId();
    if (!userId) return;
    // ボット対策：ページ読み込みから3秒後にトラッキングを送る
    const timerId = setTimeout(() => {
      if (newUser) {
        trackEvent("signup_guest");
      } else {
        trackEvent("return_visit");
      }
      trackEvent("app_open", { is_return: !newUser });
    }, 3000);
    return () => clearTimeout(timerId);
  }, []);

  useEffect(() => {
    const timerId = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timerId);
  }, []);

  // Supabase Auth セッション監視
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("flash_auto_decks", JSON.stringify(decks));
    } catch (e) {
      console.error("localStorage保存エラー:", e);
      setToast({ msg: "保存容量がいっぱいです。不要な単語帳を削除してください。", type: "err" });
      setTimeout(() => setToast(null), 4000);
    }
  }, [decks]);

  const handleGoogleLogin = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }, []);
  const handleLogout = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }, []);
  const showToast = useCallback((msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);},[]);
  const goHome = useCallback(() => { setView("home"); setActiveDeck(null); setEditDeck(null); }, []);
  const openDetail = useCallback((deck) => { setActiveDeck(normalizeDeck(deck)); setView("detail"); }, []);
  const startMode = useCallback((mode) => {
    if (mode==="flip") { setView("flip"); }
    else if (mode==="quiz-choice") { setQuizMode("choice"); setIsTestMode(false); setView("quiz"); }
    else if (mode==="quiz-write")  { setQuizMode("write");  setIsTestMode(false); setView("quiz"); }
    else if (mode==="test-choice") { setQuizMode("choice"); setIsTestMode(true);  setView("quiz"); }
    else if (mode==="test-write")  { setQuizMode("write");  setIsTestMode(true);  setView("quiz"); }
  }, []);
  const saveDeck = useCallback((deck) => {
    const normalizedDeck = normalizeDeck(deck);
    setDecks(prev => {
      const ex = prev.find(d=>d.id===normalizedDeck.id);
      return ex ? prev.map(d=>d.id===normalizedDeck.id ? normalizedDeck : d) : [...prev, normalizedDeck];
    });
    // 公開フラグが ON なら Supabase にも投稿（非同期・失敗してもローカル保存は成功扱い）
    if (normalizedDeck.isPublic) {
      showToast("保存して公開中...");
      const userId = user?.id ?? getAnonymousUserId();
      publishDeck(normalizedDeck, userId).then(() => {
        showToast("保存・公開しました");
      }).catch((e) => {
        console.error("公開投稿エラー:", e);
        showToast("保存しました（公開は失敗）", "err");
      });
    } else {
      showToast("保存しました");
    }
    goHome();
  }, [showToast, goHome]);
  const saveGeneratedDeck = useCallback((deck) => {
    const normalizedDeck = normalizeDeck(deck);
    setDecks(prev=>[...prev, normalizedDeck]);
    setActiveDeck(normalizedDeck);
    setView("detail");
    showToast("単語帳を作成しました");
    trackEvent("save_deck", {
      deck_id: normalizedDeck.id,
      card_count: normalizedDeck.cards.length,
    });
  }, [showToast]);
  const saveAndStartFlash = useCallback((deck) => {
    const normalizedDeck = normalizeDeck(deck);
    setDecks(prev=>[...prev, normalizedDeck]);
    setActiveDeck(normalizedDeck);
    setView("flip");
    showToast("単語帳を保存しました");
    trackEvent("save_deck", {
      deck_id: normalizedDeck.id,
      card_count: normalizedDeck.cards.length,
    });
  }, [showToast]);
  const toggleFavorite = useCallback((id) => {
    setDecks(prev=>prev.map(d=>d.id===id
      ? {...d, favorited:!d.favorited, favCount:(d.favCount||0)+(d.favorited?-1:1)} : d));
  }, []);
  const togglePublicFavorite = useCallback((deck) => {
    if (!deck.publicId) return;
    const wasFav = publicFavIds.has(deck.publicId);
    const delta = wasFav ? -1 : 1;
    setPublicFavIds(prev => {
      const next = new Set(prev);
      wasFav ? next.delete(deck.publicId) : next.add(deck.publicId);
      return next;
    });
    // 保存時にマイセットにコピー（まだ追加されていなければ）
    if (!wasFav) {
      setDecks(prev => {
        const alreadyCopied = prev.some(d => d.id === "copy-" + deck.publicId);
        if (alreadyCopied) return prev;
        return [...prev, normalizeDeck({
          id: "copy-" + deck.publicId,
          name: deck.name,
          author: deck.author || "コピー",
          isPublic: false,
          wordLang: deck.wordLang || "en",
          defLang: deck.defLang || "ja",
          detailLevel: deck.detailLevel || 2,
          tags: deck.tags || [],
          cards: (deck.cards || []).map(c => ({ id: uid(), word: c.word || "", definition: c.definition || "" })),
          cleared: false, masteredIds: [], favorited: true, favCount: 0,
        })];
      });
      showToast(deck.name + " をマイセットに追加しました");
    }
    togglePublicFav(deck.publicId, delta).catch((e) => {
      console.error("公開fav更新エラー:", e);
      setPublicFavIds(prev => {
        const next = new Set(prev);
        wasFav ? next.add(deck.publicId) : next.delete(deck.publicId);
        return next;
      });
    });
  }, [publicFavIds, showToast]);
  const markCleared = useCallback((id) => setDecks(prev=>prev.map(d=>d.id===id?{...d,cleared:true}:d)), []);
  const updateCard = useCallback((deckId, cardId, nw, nd) => {
    const patch = d => d.id===deckId ? normalizeDeck({...d,cards:d.cards.map(c=>c.id===cardId?{...c,word:nw,definition:nd}:c)}) : d;
    setDecks(prev=>prev.map(patch));
    setActiveDeck(prev=>prev&&prev.id===deckId ? patch(prev) : prev);
  }, []);
  const addCard = useCallback((deckId, card) => {
    const patch = d => d.id===deckId ? normalizeDeck({...d,cards:[...d.cards,card]}) : d;
    setDecks(prev=>prev.map(patch));
    setActiveDeck(prev=>prev&&prev.id===deckId ? patch(prev) : prev);
  }, []);
  const deleteCard = useCallback((deckId, cardId) => {
    const patch = d => d.id===deckId ? normalizeDeck({...d,cards:d.cards.filter(c=>c.id!==cardId)}) : d;
    setDecks(prev=>prev.map(patch));
    setActiveDeck(prev=>prev&&prev.id===deckId ? patch(prev) : prev);
  }, []);
  const updateStreaks = useCallback((deckId, results) => {
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
  }, []);
  const importDeck = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.format !== "flash_auto_deck" || !data.deck) {
          showToast("対応していないファイル形式です", "err");
          return;
        }
        const d = data.deck;
        if (!d.name || !Array.isArray(d.cards) || d.cards.length === 0) {
          showToast("デッキ名またはカードがありません", "err");
          return;
        }
        const newDeck = normalizeDeck({
          id: "imp-" + uid(),
          name: d.name,
          author: d.author || "インポート",
          isPublic: false,
          wordLang: d.wordLang || "ja",
          defLang: d.defLang || "ja",
          detailLevel: d.detailLevel || 2,
          tags: d.tags || [],
          cards: d.cards.map(c => ({ id: uid(), word: c.word || "", definition: c.definition || "" })),
          cleared: false,
          masteredIds: [],
          favorited: false,
          favCount: 0,
        });
        setDecks(prev => [...prev, newDeck]);
        showToast(d.name + " をインポートしました");
      } catch {
        showToast("ファイルを読み込めませんでした", "err");
      }
    };
    reader.readAsText(file);
  }, [showToast]);

  const syncActive = useMemo(() => {
    return (id) => normalizeDeck(decks.find(d=>d.id===id) || activeDeck);
  }, [decks, activeDeck]);

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
        onHome={()=>{goHome();setMenuOpen(false);}}
        onMyLibrary={()=>{goHome();setMenuOpen(false);setTimeout(()=>document.getElementById("my-set-section")?.scrollIntoView({behavior:"smooth"}),100);}}
        onLibrary={()=>{setView("library");setMenuOpen(false);}}
        onGenerate={()=>{setView("generate");setMenuOpen(false);}}
        onNew={()=>{setEditDeck(null);setView("create");setMenuOpen(false);}}
        onStats={()=>{setView("stats");setMenuOpen(false);}}
        activeView={view}
      />
      {view==="home"      && <HomeView decks={decks} onOpenDetail={openDetail}
                               onNew={()=>{setEditDeck(null);setView("create");}}
                               onGenerate={()=>setView("generate")}
                               onLibrary={()=>setView("library")}
                               onStats={()=>setView("stats")}
                               onToggleFav={toggleFavorite}
                               onEdit={d=>{setEditDeck(d);setView("create");}}
                               onDelete={id=>{setDecks(p=>p.filter(d=>d.id!==id));showToast("削除しました");}}
                               onMenuClick={()=>setMenuOpen(true)}
                               onSaveGeneratedDeck={saveGeneratedDeck}
                               onSaveAndStartFlash={saveAndStartFlash}
                               onImport={importDeck}
                               user={user} onLogin={handleGoogleLogin} onLogout={handleLogout}/>}
      {view==="stats"     && <StatsView decks={decks} onBack={goHome} onOpenDetail={openDetail} onMenuClick={()=>setMenuOpen(true)}/>}
      {view==="library"   && <LibraryView onBack={goHome} onOpenDetail={openDetail} onToggleFav={togglePublicFavorite} onMenuClick={()=>setMenuOpen(true)} favoritedIds={publicFavIds}/>}
      {view==="generate"  && <GenerateView onSave={saveGeneratedDeck} onBack={goHome} showToast={showToast}/>}
      {view==="create"    && <CreateView initial={editDeck} onSave={saveDeck} onBack={goHome} showToast={showToast}/>}
      {view==="detail"    && activeDeck && <DetailView deck={syncActive(activeDeck.id)} onBack={goHome}
                               onStartMode={startMode}
                               onToggleFav={()=>activeDeck.isPublic ? togglePublicFavorite(activeDeck) : toggleFavorite(activeDeck.id)}
                               onEdit={()=>{setEditDeck(syncActive(activeDeck.id));setView("create");}}
                               onDelete={()=>{if(!window.confirm("この単語帳を削除しますか？\nこの操作は元に戻せません"))return;setDecks(p=>p.filter(d=>d.id!==activeDeck.id));showToast("削除しました");goHome();}}
                               onUpdateCard={updateCard} onAddCard={addCard} onDeleteCard={deleteCard} showToast={showToast}/>}
      {view==="flip"      && activeDeck && <FlipView  deck={syncActive(activeDeck.id)} onBack={()=>{
        trackEvent("review_card", { deck_id: activeDeck.id, card_count: syncActive(activeDeck.id).cards.length, mode: "flip" });
        setView("detail");
      }}/>}
      {view==="quiz"      && activeDeck && <QuizView  deck={syncActive(activeDeck.id)} mode={quizMode} isTest={isTestMode} onBack={()=>setView("detail")} onCleared={markCleared} onUpdateStreaks={updateStreaks} showToast={showToast}/>}
      <FeedbackFab/>
    </div>
  );
}
