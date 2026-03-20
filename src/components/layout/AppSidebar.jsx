import { FEEDBACK_FORM_URL } from "../shared/FeedbackFab.jsx";

export function AppSidebar({active,onHome,onMyLibrary,onLibrary,credits}) {
  const items = [
    { id: "home", label: "ホーム", icon: "🏠", action: onHome },
    { id: "my-library", label: "マイセット", icon: "📚", desc: "作成した単語帳", action: onMyLibrary || onHome },
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
        <div className="credit-text">
          <span className="credit-main">AI生成 残り<strong>{credits !== undefined ? credits : "—"}</strong>回</span>
          <span className="credit-sub">1日3回まで無料・翌日リセット</span>
        </div>
      </div>

      <a className="sidebar-feedback" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
        💬 ご意見・不具合報告
      </a>
    </aside>
  );
}
