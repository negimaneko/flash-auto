import { useState, useCallback, useEffect } from "react";
import "./App.css";
import { getAnonymousUserId, trackEvent, isNewUser } from "./lib/tracking.js";
import { AI_GENERATE_DAILY_LIMIT, SPLASH_DURATION_MS } from "./constants.js";
import { SEED_DECKS } from "./data.js";
import { normalizeDeck, normalizeDecks, uid } from "./utils.js";

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
  const [toast, setToast] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [appCredits, setAppCredits] = useState(AI_GENERATE_DAILY_LIMIT);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const newUser = isNewUser();
    const userId = getAnonymousUserId();
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

  useEffect(() => {
    try {
      localStorage.setItem("flash_auto_decks", JSON.stringify(decks));
    } catch (e) {
      console.error("localStorage保存エラー:", e);
      setToast({ msg: "保存容量がいっぱいです。不要な単語帳を削除してください。", type: "err" });
      setTimeout(() => setToast(null), 4000);
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
  const saveAndStartFlash = (deck) => {
    const normalizedDeck = normalizeDeck(deck);
    setDecks(prev=>[...prev, normalizedDeck]);
    setActiveDeck(normalizedDeck);
    setView("flip");
    showToast("単語帳を保存しました");
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
                               onSaveGeneratedDeck={saveGeneratedDeck}
                               onSaveAndStartFlash={saveAndStartFlash}/>}
      {view==="library"   && <LibraryView decks={decks.filter(d=>d.isPublic)} onBack={goHome} onOpenDetail={openDetail} onToggleFav={toggleFavorite} onMenuClick={()=>setMenuOpen(true)} credits={appCredits}/>}
      {view==="generate"  && <GenerateView onSave={saveGeneratedDeck} onBack={goHome} showToast={showToast} onCreditsUpdate={setAppCredits}/>}
      {view==="create"    && <CreateView initial={editDeck} onSave={saveDeck} onBack={goHome} showToast={showToast}/>}
      {view==="detail"    && activeDeck && <DetailView deck={syncActive(activeDeck.id)} onBack={goHome}
                               onStartMode={startMode}
                               onToggleFav={()=>toggleFavorite(activeDeck.id)}
                               onEdit={()=>{setEditDeck(syncActive(activeDeck.id));setView("create");}}
                               onDelete={()=>{if(!window.confirm("この単語帳を削除しますか？\nこの操作は元に戻せません"))return;setDecks(p=>p.filter(d=>d.id!==activeDeck.id));showToast("削除しました");goHome();}}
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
