import { useState } from "react";

export const FEEDBACK_FORM_URL = "https://forms.gle/6fggs7Ce7SoXBs9E8";

export function FeedbackFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="feedback-fab" onClick={() => setOpen(true)} aria-label="フィードバック" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>ご意見</span>
      </button>
      {open && (
        <div className="feedback-overlay" onClick={() => setOpen(false)}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            <button className="feedback-close" onClick={() => setOpen(false)}>✕</button>
            <div className="feedback-modal-icon">💬</div>
            <h3 className="feedback-modal-title">ご意見・ご感想をお聞かせください</h3>
            <p className="feedback-modal-desc">
              Flash Autoをより良くするために、あなたの声を聞かせてください。<br/>
              使いやすさ・分かりにくかった点・不具合など、なんでもOKです。<br/>
              <strong>所要時間：約1分</strong>
            </p>
            <a
              className="nbtn primary feedback-modal-btn"
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              フィードバックを送る →
            </a>
            <button className="nbtn ghost feedback-modal-skip" onClick={() => setOpen(false)}>
              あとで
            </button>
          </div>
        </div>
      )}
    </>
  );
}
