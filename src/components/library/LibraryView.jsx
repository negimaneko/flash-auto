import { useState, useEffect, useCallback, useRef } from "react";
import { Navbar } from "../shared/Navbar.jsx";
import { AppSidebar } from "../layout/AppSidebar.jsx";
import { DeckCard } from "../home/DeckCard.jsx";
import { fetchPublicDecks } from "../../api.js";

export function LibraryView({ onBack, onOpenDetail, onToggleFav, onMenuClick, favoritedIds }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [decks, setDecks] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  // API からデッキを取得
  const loadDecks = useCallback(async (q, tag) => {
    setLoading(true);
    setError(null);
    try {
      const { decks: fetched } = await fetchPublicDecks({ q: q || undefined, tag: tag || undefined });
      setDecks(fetched);
      // 取得結果のタグを既存と合わせて一覧に反映
      const fetchedTags = fetched.flatMap((d) => d.tags || []);
      setAllTags(prev => {
        const merged = new Set([...(q || tag ? prev : []), ...fetchedTags]);
        return [...merged].sort();
      });
    } catch (e) {
      console.error("公開デッキ取得エラー:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    loadDecks("", null);
  }, [loadDecks]);

  // 検索入力のデバウンス
  const handleSearch = useCallback((value) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadDecks(value, activeTag);
    }, 400);
  }, [loadDecks, activeTag]);

  // タグ切り替え
  const handleTagClick = useCallback((tag) => {
    setActiveTag(tag);
    loadDecks(query, tag);
  }, [loadDecks, query]);

  // お気に入り状態をローカルに反映
  const displayDecks = decks.map((d) => ({
    ...d,
    favorited: favoritedIds ? favoritedIds.has(d.publicId) : false,
  }));

  return (
    <div className="page">
      <Navbar onMenuClick={onMenuClick} right={<button className="nbtn ghost" onClick={onBack}>ホームへ戻る</button>} />

      <div className="app-shell">
        <AppSidebar
          active="library"
          onHome={onBack}
          onLibrary={() => {}}
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
                onChange={(e) => handleSearch(e.target.value)}
                maxLength={100}
              />
            </div>

            {allTags.length > 0 && (
              <div className="tag-row">
                <button className={`tag ${!activeTag ? "active" : ""}`} onClick={() => handleTagClick(null)}>
                  すべて
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className={`tag ${activeTag === tag ? "active" : ""}`}
                    onClick={() => handleTagClick(tag)}
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
                <h2 className="section-heading">
                  {loading ? "読み込み中..." : `${displayDecks.length}件のセット`}
                </h2>
              </div>
            </div>

            {error && (
              <p style={{ color: "var(--c-err)", padding: "1rem" }}>{error}</p>
            )}

            <div className="set-feed">
              {displayDecks.map((deck) => (
                <DeckCard
                  key={deck.id}
                  deck={deck}
                  onClick={() => onOpenDetail(deck)}
                  onFav={(e) => { e.stopPropagation(); onToggleFav(deck); }}
                  onEdit={(e) => e.stopPropagation()}
                  onDelete={(e) => e.stopPropagation()}
                />
              ))}
              {!loading && !error && displayDecks.length === 0 && (
                <p style={{ padding: "2rem 1rem", opacity: 0.6 }}>
                  公開されたセットはまだありません。
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
