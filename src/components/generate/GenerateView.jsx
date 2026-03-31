import { useState } from "react";
import { Navbar } from "../shared/Navbar.jsx";
import { CharCount } from "../shared/CharCount.jsx";
import { LanguageInput } from "../shared/LanguageInput.jsx";
import { LIMITS, DETAIL_LEVELS } from "../../constants.js";
import { getAnonymousUserId, trackEvent } from "../../lib/tracking.js";
import { fetchDeckFromCacheOrGenerate } from "../../api.js";
import { uid, normalizeLanguageValue, getLangLabel } from "../../utils.js";

export function GenerateView({onSave,onBack,showToast}) {
  const [topic, setTopic] = useState("");
  const [mustIncludeWords, setMustIncludeWords] = useState("");
  const [wordLang, setWordLang] = useState("technical");
  const [defLang, setDefLang] = useState("ja");
  const [detailLevel, setDetailLevel] = useState(2);
  const [generated, setGenerated] = useState(null);
  const [generatedCacheId, setGeneratedCacheId] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState("");
  const [newWord, setNewWord] = useState("");
  const [newDef, setNewDef] = useState("");
  const [credits, setCredits] = useState(null);

  const selectedDetail = DETAIL_LEVELS.find((item) => item.id === detailLevel) || DETAIL_LEVELS[1];

  const updateCard = (cardId, key, value) => {
    setGenerated((current) => {
      if (!current) return current;
      return {
        ...current,
        cards: current.cards.map((card) =>
          card.id === cardId ? { ...card, [key]: value } : card,
        ),
      };
    });
  };

  const deleteCard = (cardId) => {
    setGenerated((current) => {
      if (!current) return current;
      if (current.cards.length <= 1) {
        showToast("最後のカードは削除できません", "err");
        return current;
      }
      return {
        ...current,
        cards: current.cards.filter((card) => card.id !== cardId),
      };
    });
  };

  const addCard = () => {
    if (!newWord.trim() || !newDef.trim()) {
      showToast("単語と定義の両方を入力してください", "err");
      return;
    }
    setGenerated((current) => {
      if (!current) return current;
      return {
        ...current,
        cards: [
          ...current.cards,
          { id: uid(), word: newWord.trim(), definition: newDef.trim() },
        ],
      };
    });
    setNewWord("");
    setNewDef("");
  };

  const applyGeneratedDeckResult = (deck, cacheId, fallbackDefLang, source) => {
    setFromCache(source === "cache");
    const cards = (deck?.cards || []).map((card) => ({
      id: uid(),
      word: card.word,
      definition: card.definition,
    }));

    setGenerated({
      id: "gen-" + uid(),
      name: deck?.deckName || topic.trim(),
      author: "AIアシスタント",
      isPublic: false,
      wordLang: deck?.wordLang || "technical",
      defLang: deck?.defLang || fallbackDefLang,
      detailLevel: deck?.detailLevel || detailLevel,
      tags: deck?.tags || [],
      aiGenerated: true,
      cleared: false,
      masteredIds: [],
      favorited: false,
      favCount: 0,
      cards,
    });
    setGeneratedCacheId(cacheId || null);
  };

  const startGenerate = async () => {
    if (!topic.trim()) {
      showToast("テーマを入力してください", "err");
      return;
    }

    setLoading(true);
    setError("");
    const t0 = Date.now();

    try {
      const normalizedDefLang = normalizeLanguageValue(defLang);
      const userId = getAnonymousUserId();
      if (!userId) {
        throw new Error("匿名ユーザーIDを作成できませんでした。");
      }

      const normalizedWordLang = normalizeLanguageValue(wordLang);
      const result = await fetchDeckFromCacheOrGenerate({
        action: "initial",
        topic: topic.trim(),
        wordLang: normalizedWordLang,
        defLang: normalizedDefLang,
        detailLevel,
        userId,
        ...(mustIncludeWords.trim() ? { mustIncludeWords: mustIncludeWords.trim() } : {}),
      });
      applyGeneratedDeckResult(result.deck, result.cacheId, normalizedDefLang, result.source);
      if (result.credits) setCredits(result.credits);
      trackEvent("generate_theme_deck", {
        theme: topic.trim(),
        deck_id: result.cacheId || null,
        generation_latency_ms: Date.now() - t0,
        generation_success: true,
        from_cache: result.source === "cache",
        action: "initial",
      });

      if (result.source === "cache") {
        showToast("以前に生成済みの内容を表示しました");
      } else {
        showToast("新しい単語帳を生成しました");
      }
    } catch (e) {
      if (e.credits) setCredits(e.credits);
      const message = e instanceof Error ? e.message : "生成に失敗しました。";
      trackEvent("generate_theme_deck", {
        theme: topic.trim(),
        generation_latency_ms: Date.now() - t0,
        generation_success: false,
        generation_error: message,
        action: "initial",
      });
      setError(message);
      showToast(message, "err");
    } finally {
      setLoading(false);
    }
  };

  const continueGenerate = async () => {
    if (!generated) {
      showToast("先に単語帳を生成してください", "err");
      return;
    }

    setContinuing(true);
    setError("");
    const t0 = Date.now();

    try {
      const userId = getAnonymousUserId();
      if (!userId) {
        throw new Error("匿名ユーザーIDを作成できませんでした。");
      }

      const result = await fetchDeckFromCacheOrGenerate({
        action: "continue",
        cacheId: generatedCacheId,
        topic: topic.trim() || generated.name,
        defLang: generated.defLang,
        detailLevel: generated.detailLevel || detailLevel,
        userId,
        existingWords: generated.cards.map((card) => card.word),
      });

      const mergedDeck = {
        ...result.deck,
        deckName: result.deck?.deckName || generated.name,
        tags: result.deck?.tags || generated.tags,
        wordLang: result.deck?.wordLang || generated.wordLang,
        defLang: result.deck?.defLang || generated.defLang,
        detailLevel: result.deck?.detailLevel || generated.detailLevel,
        cards: result.deck?.deckName
          ? result.deck.cards
          : [...generated.cards.map(c => ({ word: c.word, definition: c.definition })), ...(result.deck?.cards || [])],
      };
      applyGeneratedDeckResult(mergedDeck, result.cacheId || generatedCacheId, generated.defLang);
      if (result.credits) setCredits(result.credits);
      trackEvent("generate_theme_deck", {
        theme: topic.trim() || generated.name,
        deck_id: result.cacheId || generatedCacheId || null,
        generation_latency_ms: Date.now() - t0,
        generation_success: true,
        added_count: result.addedCount || 0,
        action: "continue",
      });
      showToast(`${result.addedCount || 0}枚のカードを追加しました`);
    } catch (e) {
      if (e.credits) setCredits(e.credits);
      const message = e instanceof Error ? e.message : "続きの生成に失敗しました。";
      trackEvent("generate_theme_deck", {
        theme: topic.trim() || generated?.name,
        generation_latency_ms: Date.now() - t0,
        generation_success: false,
        generation_error: message,
        action: "continue",
      });
      setError(message);
      showToast(message, "err");
    } finally {
      setContinuing(false);
    }
  };

  const saveDeck = () => {
    if (!generated) return;
    onSave(generated);
  };

  return (
    <div className="page-shell">
      <Navbar
        left={<button className="nbtn ghost" onClick={onBack}>戻る</button>}
        center={<div className="nav-title">AI作成</div>}
      />

      <div className="hero-panel">
        <div className="section-title">学習単語帳を生成</div>
        <p style={{ color: "var(--text2)", marginTop: 8 }}>
          テーマを入力し、出力設定を選んで、生成されたカードを確認してから保存できます。
        </p>

        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span>テーマ</span>
            <input
              className="settings-select"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例：量子力学の入門（※1回につき10〜15枚のカードが生成されます）"
              maxLength={LIMITS.TOPIC}
              style={topic.length > LIMITS.TOPIC ? { borderColor: "var(--red)" } : {}}
            />
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ color: "var(--text3)", fontSize: 13 }}>
                例：量子力学の入門（※1回につき10〜15枚のカードが生成されます）
              </span>
              <CharCount value={topic} max={LIMITS.TOPIC} />
            </div>
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span>必ず含める単語 <span style={{ color: "var(--text3)", fontWeight: 400 }}>（任意）</span></span>
            <input
              className="settings-select"
              value={mustIncludeWords}
              onChange={(e) => setMustIncludeWords(e.target.value)}
              placeholder="例：entropy, quantum, photon（カンマ区切りで入力）"
              maxLength={LIMITS.MUST}
              style={mustIncludeWords.length > LIMITS.MUST ? { borderColor: "var(--red)" } : {}}
            />
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ color: "var(--text3)", fontSize: 13 }}>
                入力した単語は必ず単語帳に含まれます
              </span>
              <CharCount value={mustIncludeWords} max={LIMITS.MUST} />
            </div>
          </label>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span>単語の言語</span>
              <LanguageInput value={wordLang} onChange={setWordLang} includeSpecial />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>定義の言語</span>
              <LanguageInput value={defLang} onChange={setDefLang} />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>説明の詳しさ</span>
              <select className="settings-select" value={detailLevel} onChange={(e) => setDetailLevel(Number(e.target.value))}>
                {DETAIL_LEVELS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ color: "var(--text3)", fontSize: 13 }}>
            <span>AI生成は基本10枚、必要なら超重要語句を最大5枚まで追加します / {selectedDetail.desc}</span>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="nbtn primary" onClick={startGenerate} disabled={loading || !topic.trim() || topic.length > LIMITS.TOPIC || mustIncludeWords.length > LIMITS.MUST}>
              {loading ? "生成中..." : "単語帳を生成"}
            </button>
            <button className="nbtn" onClick={onBack}>キャンセル</button>
            {credits && (
              <span style={{ color: credits.limit - credits.used <= 2 ? "var(--red)" : "var(--text3)", fontSize: 13 }}>
                今日の残り：{credits.limit - credits.used} / {credits.limit}回
              </span>
            )}
          </div>

          {error && (
            <div style={{ color: "#b91c1c", background: "#fee2e2", padding: 12, borderRadius: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {generated && (
        <div className="hero-panel" style={{ marginTop: 18 }}>
          <div className="section-title">プレビュー</div>
          {fromCache && (
            <div className="cache-hit-banner">
              <span className="cache-hit-icon">♻️</span>
              <div className="cache-hit-body">
                <strong>以前に生成済みの内容を表示しています</strong>
                <span>同じテーマは再生成されません。内容を変えたい場合は「必ず含める単語」を追加するか、テーマを変えてください。</span>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            <strong>{generated.name}</strong>
            <div style={{ color: "var(--text2)", fontSize: 14 }}>
              {generated.cards.length}枚 / {getLangLabel(generated.defLang)}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {generated.cards.map((card, index) => (
              <div key={card.id} className="card-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>カード {index + 1}</strong>
                  <button className="nbtn danger" onClick={() => deleteCard(card.id)}>削除</button>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    className="settings-select"
                    value={card.word}
                    onChange={(e) => updateCard(card.id, "word", e.target.value)}
                    placeholder="単語"
                    maxLength={LIMITS.WORD}
                    style={card.word.length > LIMITS.WORD ? { borderColor:"var(--red)" } : {}}
                  />
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                    <CharCount value={card.word} max={LIMITS.WORD} />
                  </div>
                  <textarea
                    className="settings-select"
                    value={card.definition}
                    onChange={(e) => updateCard(card.id, "definition", e.target.value)}
                    placeholder="定義"
                    rows={4}
                    maxLength={LIMITS.DEF}
                    style={{ resize: "vertical", ...(card.definition.length > LIMITS.DEF ? { borderColor:"var(--red)" } : {}) }}
                  />
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                    <CharCount value={card.definition} max={LIMITS.DEF} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card-card" style={{ marginTop: 16 }}>
            <strong>カードを追加</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <input
                className="settings-select"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="単語"
                maxLength={LIMITS.WORD}
              />
              <textarea
                className="settings-select"
                value={newDef}
                onChange={(e) => setNewDef(e.target.value)}
                placeholder="定義"
                rows={3}
                maxLength={LIMITS.DEF}
                style={{ resize: "vertical" }}
              />
              <div>
                <button className="nbtn" onClick={addCard}>カードを追加</button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button className="nbtn primary" onClick={saveDeck} disabled={generated?.cards.some(c => c.word.length > LIMITS.WORD || c.definition.length > LIMITS.DEF)}>単語帳を保存</button>
            <button className="nbtn" onClick={startGenerate} disabled={loading}>再生成</button>
            <button className="nbtn" onClick={continueGenerate} disabled={continuing || loading || !generatedCacheId}>
              {continuing ? "追加生成中..." : "続きを5〜10枚追加"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
