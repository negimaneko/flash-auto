export function Navbar({left,center,right,onMenuClick}) {
  return (
    <header className="navbar">
      <div className="navbar-left">
        {onMenuClick && <button className="hamburger-btn" onClick={onMenuClick} aria-label="メニュー"><span/><span/><span/></button>}
        {left||<div className="logo">Flash Auto</div>}
      </div>
      <div className="navbar-center">{center}</div>
      <div className="navbar-right">{right}</div>
    </header>
  );
}

export function Toast({msg,type}) {
  return <div className={"toast-popup "+(type==="err"?"tp-err":"tp-ok")}>{msg}</div>;
}
