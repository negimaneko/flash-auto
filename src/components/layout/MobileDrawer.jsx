import { FEEDBACK_FORM_URL } from "../shared/FeedbackFab.jsx";

export function MobileDrawer({open,onClose,onHome,onMyLibrary,onLibrary,onGenerate,onNew,onStats,activeView}) {
  const items = [
    { id:"home", label:"ホーム", icon:"🏠", action:onHome },
    { id:"my-library", label:"マイセット", icon:"📚", desc:"作成した単語帳", action:onMyLibrary || onHome },
    { id:"library", label:"公開ライブラリ", icon:"🌐", action:onLibrary },
    { id:"stats", label:"学習統計", icon:"📊", desc:"進捗を確認", action:onStats },
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
          <a className="drawer-feedback" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            💬 ご意見・不具合報告
          </a>
        </div>
      </nav>
    </>
  );
}
