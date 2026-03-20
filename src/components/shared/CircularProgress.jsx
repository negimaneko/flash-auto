import { useState, useEffect } from "react";

export function CircularProgress({ percent }) {
  const [animVal, setAnimVal] = useState(0);
  const R = 70, STROKE = 10, SIZE = (R + STROKE) * 2;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    let start = null;
    const duration = 1200;
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
    const animate = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      setAnimVal(Math.round(ease(progress) * percent));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [percent]);

  const offset = C - (animVal / 100) * C;
  return (
    <div style={{position:"relative",width:SIZE,height:SIZE,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width={SIZE} height={SIZE} style={{transform:"rotate(-90deg)"}}>
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none"
          stroke="url(#achGrad)" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{transition:"stroke-dashoffset 0.05s linear"}}
        />
        <defs>
          <linearGradient id="achGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{position:"absolute",display:"flex",flexDirection:"column",alignItems:"center"}}>
        <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:".05em"}}>進捗</span>
        <span style={{fontSize:36,fontWeight:800,color:"var(--text)"}}>{animVal}<span style={{fontSize:18}}>%</span></span>
      </div>
    </div>
  );
}

export function ResultDonut({ percent, colorVar = "--accent", bgColorVar = "--coral" }) {
  const [animVal, setAnimVal] = useState(0);
  const R = 64, STROKE = 14, SIZE = (R + STROKE) * 2;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    let start = null;
    const duration = 1200;
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
    const animate = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      setAnimVal(Math.round(ease(progress) * percent));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [percent]);

  const correctOffset = C - (animVal / 100) * C;
  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none" stroke={`var(${bgColorVar})`} strokeWidth={STROKE} />
        <circle cx={R+STROKE} cy={R+STROKE} r={R} fill="none"
          stroke={`var(${colorVar})`} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={correctOffset}
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
      </svg>
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: "var(--text)" }}>{animVal}<span style={{ fontSize: 16 }}>%</span></span>
      </div>
    </div>
  );
}
