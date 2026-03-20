import { useState, useRef, useEffect } from "react";
import { Navbar } from "../shared/Navbar.jsx";
import { CharCount } from "../shared/CharCount.jsx";
import { LanguageInput } from "../shared/LanguageInput.jsx";
import { AutoTextarea } from "../shared/AutoTextarea.jsx";
import { LIMITS, DETAIL_LEVELS } from "../../constants.js";
import { uid, normalizeLanguageValue } from "../../utils.js";
import { aiSuggest } from "../../api.js";

export function CreateView({initial,onSave,onBack,showToast}) {
  const isEdit = !!initial;
  const [name,setName]=useState(initial?.name || "");
  const [isPublic,setIsPublic]=useState(initial?.isPublic ?? true);
  const [wordLang,setWordLang]=useState(normalizeLanguageValue(initial?.wordLang, "en"));
  const [defLang,setDefLang]=useState(normalizeLanguageValue(initial?.defLang, "ja"));
  const [detailLevel,setDetailLevel]=useState(initial?.detailLevel || 2);
  const [tags,setTags]=useState(initial?.tags || []);
  const [tagInput,setTagInput]=useState("");
  const [cards,setCards]=useState(initial?.cards?.length ? initial.cards : [{ id:uid(), word:"", definition:"" }]);
  const [generatingCardId,setGeneratingCardId]=useState(null);
  const [autoAI,setAutoAI]=useState(true);
  const cardsRef = useRef(cards);
  useEffect(()=>{ cardsRef.current = cards; }, [cards]);

  const updateCard=(id,field,value)=>{
    setCards((prev)=>prev.map((card)=>card.id===id ? { ...card, [field]: value } : card));
  };

  const addCard=()=>{
    setCards((prev)=>[...prev,{ id:uid(), word:"", definition:"" }]);
  };

  const deleteCard=(id)=>{
    if(cards.length <= 1){
      showToast("最後のカードは削除できません","err");
      return;
    }
    setCards((prev)=>prev.filter((card)=>card.id!==id));
  };

  const addTag=()=>{
    const raw = tagInput.trim().replace(/^#+/,"");
    if(!raw) return;
    const nextTag = "#" + raw;
    if(!tags.includes(nextTag)) setTags((prev)=>[...prev,nextTag]);
    setTagInput("");
  };

  const removeTag=(tag)=>{
    setTags((prev)=>prev.filter((item)=>item!==tag));
  };

  const generateCardDefinition = async (cardId) => {
    const latest = cardsRef.current;
    const target = latest.find((card)=>card.id===cardId);
    if (!target?.word.trim()) {
      showToast("先に単語を入力してください", "err");
      return;
    }
    setGeneratingCardId(cardId);
    try {
      const definition = await aiSuggest({
        term: target.word.trim(),
        wordLang,
        defLang,
        detailLevel,
        deckName: name,
        otherWords: latest.filter((card)=>card.id!==cardId).map((card)=>card.word),
      });
      updateCard(cardId, "definition", definition);
      showToast("定義を生成しました");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI生成に失敗しました", "err");
    } finally {
      setGeneratingCardId(null);
    }
  };

  const handleWordBlur = (cardId) => {
    if (!autoAI) return;
    setTimeout(() => {
      const latest = cardsRef.current;
      const target = latest.find((card)=>card.id===cardId);
      if (!target?.word.trim() || target.definition.trim()) return;
      generateCardDefinition(cardId);
    }, 100);
  };

  const nameOver = name.length > LIMITS.NAME;
  const cardsHasError = cards.some(c => c.word.length > LIMITS.WORD || c.definition.length > LIMITS.DEF);
  const saveDisabled = nameOver || cardsHasError;

  const handleSave=()=>{
    if(!name.trim()){
      showToast("単語帳名を入力してください","err");
      return;
    }

    const validCards = cards
      .map((card)=>({ ...card, word: card.word.trim(), definition: card.definition.trim() }))
      .filter((card)=>card.word && card.definition);

    if(validCards.length === 0){
      showToast("少なくとも1枚のカードを追加してください","err");
      return;
    }

    onSave({
      id: isEdit ? initial.id : "my-" + uid(),
      name: name.trim(),
      isPublic,
      wordLang: normalizeLanguageValue(wordLang),
      defLang: normalizeLanguageValue(defLang),
      detailLevel,
      tags,
      author: isEdit ? initial.author : "あなた",
      cards: validCards,
      cleared: isEdit ? initial.cleared : false,
      masteredIds: isEdit ? (initial.masteredIds || []) : [],
      favorited: isEdit ? (initial.favorited || false) : false,
      favCount: isEdit ? (initial.favCount || 0) : 0,
      aiGenerated: isEdit ? (initial.aiGenerated || false) : false,
    });
  };

  return (
    <div className="page">
      <Navbar
        left={<button className="nbtn ghost" onClick={onBack}>戻る</button>}
        center={<span className="nav-center-title">{isEdit ? "単語帳を編集" : "単語帳を作成"}</span>}
        right={<button className="nbtn primary" onClick={handleSave} disabled={saveDisabled}>保存</button>}
      />

      <div style={{ maxWidth:800, margin:"0 auto", padding:"24px 0 100px" }}>
        <div style={{ position:"relative" }}>
          <input className="create-name-input" placeholder="タイトルをつけてください" value={name} onChange={(e)=>setName(e.target.value)} style={nameOver ? { borderColor:"var(--red)" } : {}} />
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:4 }}>
            <CharCount value={name} max={LIMITS.NAME} />
          </div>
        </div>

        <div className="settings-card">
          <div className="create-lang-grid">
            <label style={{ display:"grid", gap:8 }}>
              <span className="settings-label">単語の言語</span>
              <LanguageInput value={wordLang} onChange={setWordLang} includeSpecial />
            </label>

            <label style={{ display:"grid", gap:8 }}>
              <span className="settings-label">定義の言語</span>
              <LanguageInput value={defLang} onChange={setDefLang} />
            </label>
          </div>

          {wordLang === "technical" && (
            <div style={{ color: "var(--text3)", fontSize: 13, marginTop:8 }}>
              専門用語は、日本国内で一般的に使われている用語として扱います。
            </div>
          )}

          <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"end", marginTop:14 }}>
            {wordLang === "technical" && (
              <label style={{ display:"grid", gap:8, flex:"0 0 auto", minWidth:140 }}>
                <span className="settings-label">説明の詳しさ</span>
                <select className="settings-select" value={detailLevel} onChange={(e)=>setDetailLevel(Number(e.target.value))}>
                  {DETAIL_LEVELS.map((level)=>(
                    <option key={level.id} value={level.id}>{level.label}</option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:4 }}>
              <input type="checkbox" checked={autoAI} onChange={(e)=>setAutoAI(e.target.checked)} />
              <span className="settings-label">AIで定義を自動生成</span>
            </label>

            <label style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:4 }}>
              <input type="checkbox" checked={isPublic} onChange={(e)=>setIsPublic(e.target.checked)} />
              <span className="settings-label">公開単語帳にする</span>
            </label>
          </div>
        </div>

        <div className="settings-card" style={{ marginTop:18 }}>
          <div className="section-title">タグ</div>
          <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
            <input className="settings-select" value={tagInput} onChange={(e)=>setTagInput(e.target.value)} placeholder="＃タグを追加" />
            <button className="nbtn" onClick={addTag}>タグ追加</button>
          </div>
          {tags.length > 0 && (
            <div className="tag-row" style={{ marginTop:12 }}>
              {tags.map((tag)=>(
                <button key={tag} className="tag active" onClick={()=>removeTag(tag)}>{tag}</button>
              ))}
            </div>
          )}
        </div>

        <div className="settings-card" style={{ marginTop:18 }}>
          <div className="section-title">カード</div>
          <div style={{ display:"grid", gap:12, marginTop:16 }}>
            {cards.map((card,index)=>(
              <div key={card.id} className="card-card">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <strong>{index + 1}</strong>
                  <button className="nbtn danger" onClick={()=>deleteCard(card.id)}>削除</button>
                </div>
                <div className="create-card-fields">
                  <div style={{ flex:1, paddingRight:16, borderRight:"2px solid var(--border)", display:"flex", flexDirection:"column" }}>
                    <input className="settings-select" value={card.word} onChange={(e)=>updateCard(card.id,"word",e.target.value)} onBlur={()=>handleWordBlur(card.id)} placeholder="単語を入力" style={{ width:"100%", border:"none", borderBottom:`2px solid ${card.word.length>LIMITS.WORD?"var(--red)":"var(--accent)"}`, borderRadius:0, background:"transparent", paddingLeft:0 }} />
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
                      <div style={{ fontSize:12, color:"var(--muted)" }}>用語</div>
                      <CharCount value={card.word} max={LIMITS.WORD} />
                    </div>
                  </div>
                  <div style={{ flex:1, paddingLeft:16, display:"flex", flexDirection:"column" }}>
                    <AutoTextarea className="settings-select" value={card.definition} onChange={(e)=>updateCard(card.id,"definition",e.target.value)} placeholder={generatingCardId===card.id ? "生成中..." : "定義を入力"} disabled={generatingCardId===card.id} rows={1} style={{ width:"100%", border:"none", borderBottom:`2px solid ${card.definition.length>LIMITS.DEF?"var(--red)":"var(--accent)"}`, borderRadius:0, background:"transparent", paddingLeft:0, resize:"none", overflow:"hidden", fontFamily:"inherit", fontSize:"inherit", lineHeight:"1.5" }} />
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
                      <div style={{ fontSize:12, color:"var(--muted)" }}>{generatingCardId===card.id ? "AI生成中..." : "定義"}</div>
                      <CharCount value={card.definition} max={LIMITS.DEF} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:14 }}>
            <button className="nbtn primary" onClick={addCard}>カードを追加</button>
          </div>
        </div>
      </div>
    </div>
  );
}
