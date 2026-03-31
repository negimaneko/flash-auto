import { useState } from "react";
import { Navbar } from "../shared/Navbar.jsx";
import { uid, getLangLabel } from "../../utils.js";
import { aiSuggest } from "../../api.js";

export function DetailView({deck,onBack,onStartMode,onToggleFav,onEdit,onDelete,onUpdateCard,onAddCard,onDeleteCard,showToast}) {
  const [editingId,setEditingId]=useState(null);
  const [editWord,setEditWord]=useState("");
  const [editDef,setEditDef]=useState("");
  const [newWord,setNewWord]=useState("");
  const [newDef,setNewDef]=useState("");
  const [generatingEdit,setGeneratingEdit]=useState(false);
  const [generatingNew,setGeneratingNew]=useState(false);

  const startEdit=(card)=>{
    setEditingId(card.id);
    setEditWord(card.word);
    setEditDef(card.definition);
  };

  const cancelEdit=()=>{
    setEditingId(null);
    setEditWord("");
    setEditDef("");
  };

  const saveEdit=()=>{
    if(!editWord.trim() || !editDef.trim()){
      showToast("単語と定義の両方を入力してください","err");
      return;
    }
    onUpdateCard(deck.id,editingId,editWord.trim(),editDef.trim());
    setEditingId(null);
    showToast("カードを更新しました");
  };

  const addCard=()=>{
    if(!newWord.trim() || !newDef.trim()){
      showToast("単語と定義の両方を入力してください","err");
      return;
    }
    onAddCard(deck.id,{id:uid(),word:newWord.trim(),definition:newDef.trim()});
    setNewWord("");
    setNewDef("");
    showToast("カードを追加しました");
  };

  const removeCard=(card)=>{
    if(deck.cards.length <= 1){
      showToast("最後のカードは削除できません","err");
      return;
    }
    onDeleteCard(deck.id,card.id);
    showToast(card.word + " を削除しました");
  };

  const generateEditDefinition = async () => {
    if (!editWord.trim()) {
      showToast("先に単語を入力してください", "err");
      return;
    }
    setGeneratingEdit(true);
    try {
      const definition = await aiSuggest({
        term: editWord.trim(),
        wordLang: deck.wordLang || "ja",
        defLang: deck.defLang || "ja",
        detailLevel: deck.detailLevel || 2,
        deckName: deck.name,
        otherWords: (deck.cards || [])
          .filter((card)=>card.id !== editingId)
          .map((card)=>card.word),
      });
      setEditDef(definition);
      showToast("定義を生成しました");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI生成に失敗しました", "err");
    } finally {
      setGeneratingEdit(false);
    }
  };

  const generateNewDefinition = async () => {
    if (!newWord.trim()) {
      showToast("先に単語を入力してください", "err");
      return;
    }
    setGeneratingNew(true);
    try {
      const definition = await aiSuggest({
        term: newWord.trim(),
        wordLang: deck.wordLang || "ja",
        defLang: deck.defLang || "ja",
        detailLevel: deck.detailLevel || 2,
        deckName: deck.name,
        otherWords: (deck.cards || []).map((card)=>card.word),
      });
      setNewDef(definition);
      showToast("定義を生成しました");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI生成に失敗しました", "err");
    } finally {
      setGeneratingNew(false);
    }
  };

  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewFlipped, setPreviewFlipped] = useState(false);

  const previewCard = deck.cards[previewIdx] || deck.cards[0];
  const previewPrev = () => { if (previewIdx > 0) { setPreviewFlipped(false); setPreviewIdx(i => i - 1); } };
  const previewNext = () => { if (previewIdx < deck.cards.length - 1) { setPreviewFlipped(false); setPreviewIdx(i => i + 1); } };

  const [testSubMenu, setTestSubMenu] = useState(false);
  const modes=[
    { id:"flip", label:"フラッシュカード", desc:"1枚ずつカードをめくって確認します。", color:"#22c55e" },
    { id:"quiz-choice", label:"4択クイズ", desc:"4つの選択肢から答えます。", color:"#0ea5e9" },
    { id:"quiz-write", label:"記述クイズ", desc:"答えを自分で入力します。", color:"#f97316" },
    { id:"test", label:"テスト", desc:"全問正解で単語帳クリア！形式を選べます。", color:"#8b5cf6" },
  ];
  const masteredCount = (deck.masteredIds || []).length;

  return (
    <div className="page detail-page">
      <Navbar
        left={<button className="nbtn ghost" onClick={onBack}>戻る</button>}
        center={<div className="study-deck-title">学習セット</div>}
        right={(
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
            <button className={"nbtn fav-heart-btn"+(deck.favorited?" fav-on":"")} onClick={onToggleFav} title={deck.favorited?"保存済み":"保存"}><svg width="24" height="24" viewBox="0 0 24 24" fill={deck.favorited?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>
            <button className="nbtn" onClick={onEdit}>単語帳編集</button>
            <button className="nbtn danger" onClick={onDelete}>削除</button>
          </div>
        )}
      />

      <section className="set-header-card">
        <div className="set-header-main">
          <div className="section-kicker">{deck.author === "サンプル" ? "サンプルセット" : deck.isPublic ? "公開セット" : "マイセット"}</div>
          <h1 className="set-header-title">{deck.name}</h1>
          <p className="set-header-copy">セット概要を確認してから、フラッシュカードかクイズにすぐ入れる構成です。</p>
          <div className="set-meta-grid">
            <div className="set-meta-card"><span>用語数</span><strong>{deck.cards.length}</strong></div>
            <div className="set-meta-card"><span>習得済み</span><strong>{masteredCount}</strong></div>
            <div className="set-meta-card"><span>言語</span><strong>{getLangLabel(deck.wordLang)} → {getLangLabel(deck.defLang)}</strong></div>
          </div>
          {deck.tags?.length ? (
            <div className="tile-tags detail-tags">
              {deck.tags.map((tag)=><span key={tag} className="tile-tag">{tag}</span>)}
            </div>
          ) : null}
        </div>

        <div className="set-action-row">
          {modes.map(m=>(
            <button key={m.id} className={m.id==="flip"?"nbtn primary":"nbtn ghost"} style={m.id==="test"?{borderColor:m.color,color:m.color}:undefined} onClick={()=>m.id==="test"?setTestSubMenu(true):onStartMode(m.id)}>
              <span>{m.id==="flip"?m.label+"開始":m.label}</span>
              <span className="action-desc">{m.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="set-section">
        <div className="section-head">
          <div>
            <div className="section-kicker">プレビュー</div>
            <h2 className="section-heading">単語カード</h2>
          </div>
        </div>
        <div className="detail-flip-area">
          <button
            type="button"
            className={"detail-flip-card" + (previewFlipped ? " flipped" : "")}
            onClick={() => setPreviewFlipped(v => !v)}
          >
            <div className="detail-flip-inner">
              <div className="detail-flip-face detail-flip-front">
                <div className="detail-flip-text">{previewCard?.word || "-"}</div>
              </div>
              <div className="detail-flip-face detail-flip-back">
                <div className="detail-flip-text">{previewCard?.definition || "-"}</div>
              </div>
            </div>
          </button>
          <div className="detail-flip-nav">
            <button
              className={"flip-arrow-btn" + (previewIdx === 0 ? " disabled" : "")}
              onClick={previewPrev}
              disabled={previewIdx === 0}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="flip-counter">{previewIdx + 1} / {deck.cards.length}</span>
            <button
              className={"flip-arrow-btn" + (previewIdx === deck.cards.length - 1 ? " disabled" : "")}
              onClick={previewNext}
              disabled={previewIdx === deck.cards.length - 1}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </section>

      <section className="set-section">
        <div className="section-head">
          <div>
            <div className="section-kicker">学習モード</div>
            <h2 className="section-heading">このセットの学習方法</h2>
          </div>
        </div>
        <div className="mode-grid">
          {modes.map((mode)=>(
            <button key={mode.id} className="mode-big-btn" style={{ "--mc": mode.color }} onClick={()=>{
              if (mode.id === "test") { setTestSubMenu(true); } else { onStartMode(mode.id); }
            }}>
              <strong>{mode.label}</strong>
              <span>{mode.desc}</span>
            </button>
          ))}
        </div>

        {testSubMenu && (
          <div className="test-submenu-overlay" onClick={() => setTestSubMenu(false)}>
            <div className="test-submenu-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>テスト形式を選択</h3>
              <p style={{ margin: "0 0 16px", color: "var(--text3)", fontSize: 14 }}>全問正解すると単語帳をクリアできます。</p>
              <div style={{ display: "grid", gap: 10 }}>
                <button className="mode-big-btn" style={{ "--mc": "#0ea5e9" }} onClick={() => { setTestSubMenu(false); onStartMode("quiz-choice"); }}>
                  <strong>選択式テスト</strong>
                  <span>4つの選択肢から正しい定義を選びます。</span>
                </button>
                <button className="mode-big-btn" style={{ "--mc": "#f97316" }} onClick={() => { setTestSubMenu(false); onStartMode("quiz-write"); }}>
                  <strong>記述式テスト</strong>
                  <span>定義を自分で書いて答えます。</span>
                </button>
              </div>
              <button className="nbtn ghost" style={{ marginTop: 12, width: "100%" }} onClick={() => setTestSubMenu(false)}>キャンセル</button>
            </div>
          </div>
        )}
      </section>

      <div className="detail-layout">
        <section className="terms-panel">
          <div className="section-head">
            <div>
              <div className="section-kicker">用語一覧</div>
              <h2 className="section-heading">セット内容</h2>
            </div>
          </div>
          <div className="terms-list">
          {deck.cards.map((card,index)=>{
            const isEditing = editingId===card.id;
            return (
              <div key={card.id} className={`term-row ${isEditing ? "term-row-editing" : ""}`}>
                <div className="term-index">{index + 1}</div>
                {isEditing ? (
                  <div className="term-edit-panel">
                    <div className="term-edit-grid">
                      <input className="settings-select" value={editWord} onChange={(e)=>setEditWord(e.target.value)} placeholder="単語" maxLength={100} />
                      <textarea
                        className="settings-select"
                        value={editDef}
                        onChange={(e)=>setEditDef(e.target.value)}
                        placeholder="定義"
                        rows={4}
                        maxLength={500}
                        style={{ resize:"vertical" }}
                      />
                    </div>
                    <div className="term-actions">
                      <button className="nbtn" onClick={generateEditDefinition} disabled={generatingEdit}>
                        {generatingEdit ? "生成中..." : "定義を生成"}
                      </button>
                      <button className="nbtn primary" onClick={saveEdit}>保存</button>
                      <button className="nbtn ghost" onClick={cancelEdit}>キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="term-cell">
                      <span className="term-label">単語</span>
                      <div className="term-value">{card.word}</div>
                    </div>
                    <div className="term-cell">
                      <span className="term-label">定義</span>
                      <div className="term-value">{card.definition}</div>
                    </div>
                    <div className="term-actions">
                      <button className="nbtn ghost icon-btn" onClick={()=>startEdit(card)} title="編集">&#9998;</button>
                      <button className="nbtn danger icon-btn" onClick={()=>removeCard(card)} title="削除">&#128465;</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          </div>
        </section>

      </div>
    </div>
  );
}
