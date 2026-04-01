import { useState, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { Navbar } from "../shared/Navbar.jsx";
import { CharCount } from "../shared/CharCount.jsx";
import { AppSidebar } from "../layout/AppSidebar.jsx";
import { DeckCard } from "./DeckCard.jsx";
import { LIMITS } from "../../constants.js";
import { getAnonymousUserId, trackEvent } from "../../lib/tracking.js";
import { fetchDeckFromCacheOrGenerate } from "../../api.js";
import { uid } from "../../utils.js";

export function HomeView({decks,onOpenDetail,onNew,onGenerate,onLibrary,onStats,onToggleFav,onEdit,onDelete,onMenuClick,onSaveGeneratedDeck,onSaveAndStartFlash,onImport}) {
  const [filter,setFilter] = useState("all");
  const [quickTopic, setQuickTopic] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResult, setQuickResult] = useState(null);
  const [quickError, setQuickError] = useState("");
  const [credits, setCredits] = useState(null);
  const appOpenRef = useRef(Date.now());
  const importRef = useRef(null);

  const QUICK_SAMPLES = ["AI入門", "量子力学の応用", "TOEFL初級", "経済学の応用", "心理学の基礎", "鬼滅の刃キャラ", "宇宙の雑学"];

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
      if (result.credits) setCredits(result.credits);
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
      if (e.credits) setCredits(e.credits);
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
          <button className="nbtn ai-btn" onClick={onGenerate}><Sparkles size={16} color="#f59e0b" fill="#f59e0b" /> AI作成</button>
          <button className="nbtn primary" onClick={onNew}>手動作成</button>
        </div>
      }/>
      <div className="app-shell">
        <AppSidebar
          active="home"
          onHome={()=>setFilter("all")}
          onMyLibrary={()=>{setFilter("all");setTimeout(()=>document.getElementById("my-set-section")?.scrollIntoView({behavior:"smooth"}),50);}}
          onLibrary={onLibrary}
          onStats={onStats}
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
                  onKeyDown={e => {
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    if (!quickLoading && quickTopic.trim() && quickTopic.length <= LIMITS.TOPIC) {
                      handleQuickGenerate();
                    }
                  }}
                  placeholder="例：量子力学、TOEFL、経済学..."
                  disabled={quickLoading}
                  maxLength={LIMITS.TOPIC}
                  style={quickTopic.length > LIMITS.TOPIC ? { borderColor:"var(--red)" } : {}}
                />
                <button className="nbtn ai-btn quick-gen-btn" onClick={handleQuickGenerate} disabled={quickLoading || !quickTopic.trim() || quickTopic.length > LIMITS.TOPIC}>
                  {quickLoading ? "生成中..." : <><Sparkles size={16} color="#f59e0b" fill="#f59e0b" /> 無料で単語帳を作る</>}
                </button>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:2 }}>
                {credits ? (
                  <span style={{ color: credits.limit - credits.used <= 2 ? "var(--red)" : "var(--text3)", fontSize: 13 }}>
                    今日の残り：{credits.limit - credits.used} / {credits.limit}回
                  </span>
                ) : <span />}
                {quickTopic.length > 0 && <CharCount value={quickTopic} max={LIMITS.TOPIC} />}
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
                  <button className="nbtn accent" onClick={() => onSaveAndStartFlash(quickResult)}>保存して学習を始める</button>
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
              <button className="nbtn ghost" onClick={() => importRef.current?.click()}>インポート</button>
              <input ref={importRef} type="file" accept=".json" style={{ display:"none" }} onChange={e => { if (e.target.files[0]) { onImport(e.target.files[0]); e.target.value = ""; } }} />
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
                maxLength={100}
              />
              {searchQuery && (
                <button className="set-search-clear" onClick={() => setSearchQuery("")} aria-label="クリア"><X size={14} /></button>
              )}
            </div>

            {shown.length===0 ? (
              <div className="empty-state empty-panel">
                <div className="empty-emoji">SET</div>
                <p>{searchQuery.trim() ? `「${searchQuery.trim()}」に一致するセットが見つかりませんでした。` : filter==="fav" ? "保存済みのセットはまだありません。" : "まだセットがありません。まずは1つ作成してください。"}</p>
                {filter==="all" && (
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
                    <button className="nbtn ai-btn" onClick={onGenerate}><Sparkles size={16} color="#f59e0b" fill="#f59e0b" /> AI作成</button>
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
