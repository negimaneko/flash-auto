import { useState } from "react";
import { Navbar } from "../shared/Navbar.jsx";
import { AppSidebar } from "../layout/AppSidebar.jsx";
import { DeckCard } from "../home/DeckCard.jsx";

export function LibraryView({decks,onBack,onOpenDetail,onToggleFav,onMenuClick}) {
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
                maxLength={100}
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
