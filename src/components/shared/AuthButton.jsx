import { LogIn, LogOut } from "lucide-react";

export function AuthButton({ user, onLogin, onLogout, supabaseReady }) {
  if (!supabaseReady) return null;

  if (user) {
    const name = user.user_metadata?.full_name || user.email || "";
    const avatar = user.user_metadata?.avatar_url;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {avatar
          ? <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
          : <div className="auth-avatar-initial">{(name[0] || "U").toUpperCase()}</div>
        }
        <button className="nbtn ghost" onClick={onLogout} title="ログアウト">
          <LogOut size={15} />
        </button>
      </div>
    );
  }

  return (
    <button className="nbtn ghost" onClick={onLogin} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <LogIn size={15} /> ログイン
    </button>
  );
}
