import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught error:", error?.message || error);
    console.error("[ErrorBoundary] Component stack:", info?.componentStack || "unknown");
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleFullReset = () => {
    try { localStorage.removeItem("flash_auto_decks"); } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#f0fdf4", fontFamily: "system-ui, sans-serif", padding: "20px",
        }}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "40px 32px",
            maxWidth: "480px", width: "100%", textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 8px", color: "#1a1a1a" }}>
              エラーが発生しました
            </h1>
            <p style={{ fontSize: "14px", color: "#666", margin: "0 0 24px", lineHeight: 1.6 }}>
              アプリの表示中に問題が起きました。<br/>
              下のボタンで復帰できます。
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={this.handleReset} style={{
                padding: "10px 24px", borderRadius: "10px", border: "none",
                background: "#16b981", color: "#fff", fontWeight: 700,
                fontSize: "14px", cursor: "pointer",
              }}>
                もう一度試す
              </button>
              <button onClick={this.handleFullReset} style={{
                padding: "10px 24px", borderRadius: "10px",
                border: "1.5px solid #e5e5e5", background: "#fff",
                color: "#666", fontWeight: 600, fontSize: "14px", cursor: "pointer",
              }}>
                アプリをリセット
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
