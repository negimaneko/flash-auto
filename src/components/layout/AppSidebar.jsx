import { Home, BookOpen, Globe, BarChart3, MessageCircle } from "lucide-react";
import { FEEDBACK_FORM_URL } from "../shared/FeedbackFab.jsx";

export function AppSidebar({active,onHome,onMyLibrary,onLibrary,onStats}) {
  const items = [
    { id: "home", label: "ホーム", icon: <Home size={18} />, action: onHome },
    { id: "my-library", label: "マイセット", icon: <BookOpen size={18} />, desc: "作成した単語帳", action: onMyLibrary || onHome },
    { id: "library", label: "公開ライブラリ", icon: <Globe size={18} />, action: onLibrary },
    { id: "stats", label: "学習統計", icon: <BarChart3 size={18} />, desc: "進捗を確認", action: onStats },
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

      <a className="sidebar-feedback" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={16} /> ご意見・不具合報告
      </a>
    </aside>
  );
}
