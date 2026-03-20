import { useRef } from "react";

export function RichTextEditor({ value, onChange, placeholder, style, disabled }) {
  const taRef = useRef(null);

  const wrapSelection = (tag) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return;
    const before = value.substring(0, start);
    const selected = value.substring(start, end);
    const after = value.substring(end);
    const wrapped = `<${tag}>${selected}</${tag}>`;
    onChange(before + wrapped + after);

    setTimeout(() => {
      ta.focus();
      const newPos = start + wrapped.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <div className={`rt-container ${disabled ? "disabled" : ""}`} style={style}>
      <div className="rt-toolbar">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrapSelection("b"); }} className="rt-btn" title="太字"><b>B</b></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrapSelection("i"); }} className="rt-btn" title="斜体"><i>I</i></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrapSelection("u"); }} className="rt-btn" title="下線" style={{ textDecoration: "underline" }}>U</button>
      </div>
      <textarea
        ref={taRef}
        className="rt-textarea"
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
