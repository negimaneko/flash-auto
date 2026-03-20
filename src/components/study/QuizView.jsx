import { useState, useEffect, useRef } from "react";
import { ResultDonut } from "../shared/CircularProgress.jsx";
import { shuffle } from "../../utils.js";
import { aiEval, aiMastery } from "../../api.js";
import { trackEvent } from "../../lib/tracking.js";

export function QuizView({deck,mode,onBack,onCleared,onUpdateStreaks,showToast}) {
  const cards = deck?.cards || [];
  const [answerDir, setAnswerDir] = useState(null);
  const [queue, setQueue] = useState(() => shuffle(cards));
  const [qi, setQi] = useState(0);
  const [choices, setChoices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [answering, setAnswering] = useState(false);
  const [writeResultShown, setWriteResultShown] = useState(false);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);
  const [startTime, setStartTime] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const submittingRef = useRef(false);

  const resetQuiz = () => {
    const shuffled = shuffle(cards);
    setQueue(shuffled);
    setQi(0);
    setSelectedId(null);
    setInput("");
    setFeedback("");
    setWriteResultShown(false);
    setAnswering(false);
    setResults([]);
    setDone(false);
    setStartTime(Date.now());
    submittingRef.current = false;
  };

  useEffect(() => {
    resetQuiz();
    setAnswerDir(null);
  }, [deck?.id, cards.length]);

  const getQA = (card) => {
    if (!card) return { question: "-", answer: "-" };
    if (answerDir === "word") return { question: card.definition, answer: card.word };
    return { question: card.word, answer: card.definition };
  };

  useEffect(() => {
    if (mode !== "choice" || !answerDir) return;
    const current = queue[qi];
    if (!current) {
      setChoices([]);
      return;
    }
    const others = shuffle(cards.filter((c) => c.id !== current.id)).slice(0, 3);
    setChoices(shuffle([current, ...others]));
  }, [mode, qi, queue, cards, answerDir]);

  if (!cards.length) {
    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">クイズ: {deck?.name || "無題"}</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="study-wrap">
          <div className="empty-state">
            <h3>カードがありません</h3>
            <p>クイズを始める前にカードを追加してください。</p>
          </div>
        </div>
      </div>
    );
  }

  if (!answerDir) {
    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">{mode === "choice" ? "4択クイズ" : "記述クイズ"}: {deck.name}</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="quiz-dir-wrap">
          <h2 className="quiz-dir-title">解答形式を選んでください</h2>
          <p className="quiz-dir-sub">{deck.cards.length}問 ・ {mode === "choice" ? "4択" : "記述"}</p>
          <div className="quiz-dir-grid">
            <button className="quiz-dir-btn" onClick={() => { resetQuiz(); setAnswerDir("def"); }}>
              <strong>定義を解答</strong>
              <span>単語を見て、定義を答えます</span>
            </button>
            <button className="quiz-dir-btn" onClick={() => { resetQuiz(); setAnswerDir("word"); }}>
              <strong>単語を解答</strong>
              <span>定義を見て、単語を答えます</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = queue[qi];
  const correctCount = results.filter((r) => r.correct).length;
  const percent = cards.length ? Math.round((correctCount / cards.length) * 100) : 0;

  const finishQuiz = async (finalResults) => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    setElapsedSec(elapsed);
    onUpdateStreaks(deck.id, finalResults);
    trackEvent("review_card", {
      deck_id: deck.id,
      card_count: finalResults.length,
      correct_count: finalResults.filter((r) => r.correct).length,
      mode: mode === "choice" ? "quiz_choice" : "quiz_write",
      elapsed_sec: elapsed,
    });
    if (finalResults.every((r) => r.correct)) {
      onCleared(deck.id);
      showToast?.("単語帳達成です！", "success");
      setDone(true);
      submittingRef.current = false;
      return;
    }

    try {
      const mastery = await aiMastery(finalResults);
      if (mastery.cleared) {
        onCleared(deck.id);
        showToast?.(mastery.message || "単語帳達成です！", "success");
      } else if (mastery.message) {
        showToast?.(mastery.message, "info");
      }
    } catch {
      const correctCount = finalResults.filter((r) => r.correct).length;
      const total = finalResults.length;
      showToast?.(`結果: ${correctCount}/${total} 正解（AI判定は利用できませんでした）`, "info");
    }
    setDone(true);
    submittingRef.current = false;
  };

  const commitResult = async (isCorrect, message) => {
    const nextResults = [...results, { id: current.id, correct: isCorrect }];
    setResults(nextResults);
    setFeedback(message);

    if (qi >= queue.length - 1) {
      await finishQuiz(nextResults);
      return;
    }

    if (mode === "write") {
      setWriteResultShown(true);
      setAnswering(false);
    } else {
      setTimeout(() => {
        setQi((i) => i + 1);
        setSelectedId(null);
        setInput("");
        setFeedback("");
        setAnswering(false);
        submittingRef.current = false;
      }, 700);
    }
  };

  const advanceWriteQuiz = () => {
    setQi((i) => i + 1);
    setInput("");
    setFeedback("");
    setWriteResultShown(false);
    setAnswering(false);
    submittingRef.current = false;
  };

  const submitChoice = async (choice) => {
    if (!current || selectedId || done) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    const ok = choice.id === current.id;
    setSelectedId(choice.id);
    const { answer } = getQA(current);
    await commitResult(ok, ok ? "正解" : "答え: " + answer);
  };

  const submitWrite = async () => {
    if (!current || answering || done) return;
    if (submittingRef.current) return;
    const guess = input.trim();
    if (!guess) return;

    submittingRef.current = true;
    setAnswering(true);
    const { answer } = getQA(current);
    let ok = false;
    let message = "もう一度挑戦してください";

    const normalizedGuess = guess.toLowerCase();
    const normalizedAnswer = String(answer || "").trim().toLowerCase();
    if (normalizedGuess && normalizedGuess === normalizedAnswer) {
      ok = true;
      message = "正解";
    } else {
      try {
        const judged = await aiEval(current.word, current.definition, guess, deck.defLang);
        ok = Boolean(judged?.correct);
        message = judged?.feedback || (ok ? "正解" : "答え: " + answer);
      } catch {
        ok = false;
        message = "答え: " + answer;
      }
    }

    await commitResult(ok, message);
  };

  if (done) {
    const incorrectCount = cards.length - correctCount;
    const formatTime = (sec) => {
      if (sec < 60) return `${sec}秒`;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return s > 0 ? `${m}分${s}秒` : `${m}分`;
    };

    const masteryMap = cards.map(c => {
      const r = results.find(x => x.id === c.id);
      const prevStreak = c.streak || 0;
      const newStreak = r ? (r.correct ? prevStreak + 1 : 0) : prevStreak;
      return { id: c.id, mastered: newStreak >= 2 };
    });
    const masteredCount = masteryMap.filter(m => m.mastered).length;
    const masteryPercent = cards.length ? Math.round((masteredCount / cards.length) * 100) : 0;

    const isChoiceMode = mode === "choice";

    return (
      <div className="study-page">
        <div className="study-nav">
          <button className="nbtn ghost" onClick={onBack}>戻る</button>
          <span className="study-deck-title">{isChoiceMode ? "クイズ結果" : "テスト結果"}</span>
          <div style={{ width: 96 }} />
        </div>
        <div className="study-wrap">
          <div className="result-summary-card">
            <div className="result-time">あなたのタイム：{formatTime(elapsedSec)}</div>

            <div className="result-donut-row">
              <ResultDonut percent={percent} />
              <div className="result-stats">
                <div className="result-stat-item">
                  <span className="result-stat-label" style={{ color: "var(--accent)" }}>正解</span>
                  <span className="result-stat-value result-stat-correct">{correctCount}</span>
                </div>
                <div className="result-stat-item">
                  <span className="result-stat-label" style={{ color: "var(--coral)" }}>不正解</span>
                  <span className="result-stat-value result-stat-incorrect">{incorrectCount}</span>
                </div>
              </div>
            </div>

            {isChoiceMode && (
              <div className="mastery-section">
                <div className="mastery-header">達成度（暗記率）</div>
                <div className="mastery-sub">2回連続正解で暗記と判定されます</div>
                <div className="result-donut-row" style={{ marginTop: 16 }}>
                  <ResultDonut percent={masteryPercent} colorVar="--green" bgColorVar="--border" />
                  <div className="result-stats">
                    <div className="result-stat-item">
                      <span className="result-stat-label" style={{ color: "var(--green)" }}>暗記済み</span>
                      <span className="result-stat-value" style={{ color: "var(--green)", border: "2px solid var(--green)", background: "var(--green-dim)" }}>{masteredCount}</span>
                    </div>
                    <div className="result-stat-item">
                      <span className="result-stat-label" style={{ color: "var(--text3)" }}>未暗記</span>
                      <span className="result-stat-value" style={{ color: "var(--text3)", border: "2px solid var(--border)", background: "var(--surface2)" }}>{cards.length - masteredCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="result-message">
              {percent === 100
                ? "満点です！すべてのカードをマスターしました。"
                : percent >= 70
                  ? "よく頑張りました。間違えたカードを復習しましょう。"
                  : "間違えたカードを見直して再挑戦しましょう。"}
            </div>

            <div className="result-answers-title">あなたの回答</div>
            <div className="result-answers-list">
              {queue.map((card, i) => {
                const r = results.find(x => x.id === card.id);
                const m = isChoiceMode ? masteryMap.find(x => x.id === card.id) : null;
                return (
                  <div key={card.id} className={`result-answer-row ${r?.correct ? "correct" : "incorrect"}`}>
                    <div className="result-answer-icon">{r?.correct ? "\u2713" : "\u2717"}</div>
                    <div className="result-answer-word">
                      {card.word}
                      {m?.mastered && <span className="mastery-badge">暗記済</span>}
                    </div>
                    <div className="result-answer-def">{card.definition}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
              <button className="nbtn" onClick={onBack}>単語帳に戻る</button>
              <button className="nbtn primary" onClick={() => { resetQuiz(); }}>もう一度</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="study-page">
      <div className="study-nav">
        <button className="nbtn ghost" onClick={onBack}>戻る</button>
        <span className="study-deck-title">クイズ: {deck.name}</span>
        <div className="study-progress">{qi + 1} / {queue.length}</div>
      </div>

      <div className="quiz-body">
        <div className="quiz-card">
          <div className="fc-text">{getQA(current).question}</div>
        </div>

        {mode === "choice" ? (
          <div className="choice-grid">
            {choices.map((choice) => {
              let cls = "choice-btn";
              if (selectedId) {
                if (choice.id === current.id) cls += " c-correct";
                else if (choice.id === selectedId) cls += " c-wrong";
              }
              const { answer } = getQA(choice);
              return (
                <button
                  key={choice.id}
                  className={cls}
                  onClick={() => submitChoice(choice)}
                  disabled={Boolean(selectedId)}
                >
                  {answer}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, width: "100%" }}>
            <textarea
              className="write-textarea"
              rows={3}
              placeholder={answerDir === "word" ? "単語を入力" : "定義を入力"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={answering || writeResultShown}
            />
            {!writeResultShown ? (
              <button className="nbtn primary" onClick={submitWrite} disabled={answering || !input.trim()}>
                {answering ? "判定中..." : "送信"}
              </button>
            ) : (
              <button className="nbtn primary" onClick={advanceWriteQuiz}>
                Next →
              </button>
            )}
          </div>
        )}

        {feedback ? <div className="quiz-feedback">{feedback}</div> : null}
      </div>
    </div>
  );
}
