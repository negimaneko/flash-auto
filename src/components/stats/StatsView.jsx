import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Navbar } from "../shared/Navbar.jsx";
import { AppSidebar } from "../layout/AppSidebar.jsx";

function DonutChart({ value, size = 120, stroke = 10, color = "var(--accent)" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = c * Math.min(value, 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="stats-donut">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${c - filled}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dasharray .6s ease" }}
      />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="stats-donut-label">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

function ProgressBar({ value, color = "var(--accent)" }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div className="stats-progress-track">
      <div className="stats-progress-fill" style={{ width: `${pct}%`, background: color, transition: "width .5s ease" }} />
    </div>
  );
}

export function StatsView({ decks, onBack, onOpenDetail, onMenuClick }) {
  const stats = useMemo(() => {
    const totalDecks = decks.length;
    const totalCards = decks.reduce((s, d) => s + (d.cards?.length || 0), 0);
    const totalMastered = decks.reduce((s, d) => s + (d.masteredIds?.length || 0), 0);
    const clearedDecks = decks.filter(d => d.cleared).length;
    const overallRate = totalCards > 0 ? totalMastered / totalCards : 0;

    const perDeck = decks.map(d => {
      const cardCount = d.cards?.length || 0;
      const mastered = d.masteredIds?.length || 0;
      const rate = cardCount > 0 ? mastered / cardCount : 0;
      return { id: d.id, name: d.name, cardCount, mastered, rate, cleared: d.cleared };
    }).sort((a, b) => b.rate - a.rate);

    return { totalDecks, totalCards, totalMastered, clearedDecks, overallRate, perDeck };
  }, [decks]);

  return (
    <div className="page">
      <Navbar onMenuClick={onMenuClick} centerTitle="学習統計" onBack={onBack} />
      <div className="app-shell">
        <AppSidebar active="stats" onHome={onBack} />
        <main className="shell-main">
          <section className="stats-hero">
            <div className="section-kicker">学習の記録</div>
            <h1 className="section-heading">学習統計ダッシュボード</h1>

            <div className="stats-overview">
              <div className="stats-donut-section">
                <DonutChart value={stats.overallRate} size={140} stroke={12} />
                <div className="stats-donut-caption">全体の習得率</div>
              </div>
              <div className="stats-summary-cards">
                <div className="stats-card">
                  <div className="stats-card-value">{stats.totalDecks}</div>
                  <div className="stats-card-label">デッキ数</div>
                </div>
                <div className="stats-card">
                  <div className="stats-card-value">{stats.totalCards}</div>
                  <div className="stats-card-label">総カード数</div>
                </div>
                <div className="stats-card">
                  <div className="stats-card-value stats-card-accent">{stats.totalMastered}</div>
                  <div className="stats-card-label">習得済み</div>
                </div>
                <div className="stats-card">
                  <div className="stats-card-value stats-card-green">{stats.clearedDecks}</div>
                  <div className="stats-card-label">クリア済み</div>
                </div>
              </div>
            </div>
          </section>

          <section className="stats-deck-section">
            <div className="section-kicker">デッキ別</div>
            <h2 className="section-heading" style={{ fontSize: 22 }}>進捗一覧</h2>

            {stats.perDeck.length === 0 ? (
              <p className="muted" style={{ marginTop: 16 }}>デッキがまだありません。</p>
            ) : (
              <div className="stats-deck-list">
                {stats.perDeck.map(d => (
                  <button key={d.id} className="stats-deck-row" onClick={() => onOpenDetail && onOpenDetail(decks.find(dk => dk.id === d.id))}>
                    <div className="stats-deck-info">
                      <div className="stats-deck-name">
                        {d.cleared && <span className="stats-cleared-badge"><Trophy size={14} /></span>}
                        {d.name}
                      </div>
                      <div className="stats-deck-meta">
                        {d.mastered} / {d.cardCount} 習得
                      </div>
                    </div>
                    <div className="stats-deck-bar-area">
                      <ProgressBar value={d.rate} color={d.cleared ? "var(--green)" : "var(--accent)"} />
                    </div>
                    <div className="stats-deck-pct">
                      {Math.round(d.rate * 100)}%
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
