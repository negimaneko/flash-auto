import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

export function FlipView({deck,onBack}) {
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
          <RefreshCw size={14} /> {frontIsWord ? "単語が表" : "定義が表"}
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
