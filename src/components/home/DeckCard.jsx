import { getDeckTheme, getLangLabel } from "../../utils.js";

export function DeckCard({deck,onClick,onFav,onEdit,onDelete}) {
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
