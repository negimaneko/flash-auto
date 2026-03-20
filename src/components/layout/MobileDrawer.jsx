import { FEEDBACK_FORM_URL } from "../shared/FeedbackFab.jsx";

export function MobileDrawer({open,onClose,credits,onHome,onMyLibrary,onLibrary,onGenerate,onNew,activeView}) {
  const items = [
    { id:"home", label:"ホーム", icon:"🏠", action:onHome },
    { id:"my-library", label:"マイセット", icon:"📚", desc:"作成した単語帳", action:onMyLibrary || onHome },
    { id:"library", label:"公開ライブラリ", icon:"🌐", action:onLibrary },
  ];
  return (
    <>
      <div className={`drawer-overlay ${open?"drawer-overlay-on":""}`} onClick={onClose}/>
      <nav className={`drawer ${open?"drawer-on":""}`}>
        <div className="drawer-header">
          <div className="sidebar-brand-mark">F</div>
          <div>
            <div className="sidebar-brand-title">Flash Auto</div>
            <div className="sidebar-brand-sub">学習セット</div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {items.map(item=>(
            <button key={item.id} className={`drawer-item ${activeView===item.id?"drawer-item-on":""}`} onClick={item.action}>
              <span className="drawer-item-icon">{item.icon}</span>
              <div>
                <div className="drawer-item-label">{item.label}</div>
                {item.desc && <div className="drawer-item-desc">{item.desc}</div>}
              </div>
            </button>
          ))}
          <div className="drawer-divider"/>
          <div className="drawer-credit">
            <svg className="credit-gem" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 10 12 22 22 10"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="12" y1="2" x2="7" y2="10"/><line x1="12" y1="2" x2="17" y2="10"/><line x1="7" y1="10" x2="12" y2="22"/><line x1="17" y1="10" x2="12" y2="22"/></svg>
            <div className="credit-text">
              <span className="credit-main">AI生成 残り<strong>{credits}</strong>回</span>
              <span className="credit-sub">1日3回まで無料・翌日リセット</span>
            </div>
          </div>
          <a className="drawer-feedback" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            💬 ご意見・不具合報告
          </a>
        </div>
      </nav>
    </>
  );
}
