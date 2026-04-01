import { AlertTriangle } from "lucide-react";

export function CharCount({ value, max }) {
  const n = (value || "").length;
  const over = n > max;
  return (
    <span style={{ fontSize: 11, color: over ? "var(--red)" : "var(--text3)", alignSelf: "flex-end" }}>
      {over && <span style={{ marginRight: 4, display: "inline-flex", alignItems: "center", gap: 2 }}><AlertTriangle size={12} /> {max}文字以内で入力してください</span>}
      {n}/{max}
    </span>
  );
}
