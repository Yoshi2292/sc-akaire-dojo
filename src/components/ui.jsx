import { C } from "../theme";

export const btnBase = {
  border: "none", borderRadius: 8, cursor: "pointer",
  fontFamily: "inherit", fontSize: 15, fontWeight: 600,
  padding: "12px 20px", transition: "opacity .15s",
};

export function Btn({ children, onClick, kind = "ink", disabled, style }) {
  const kinds = {
    ink: { background: C.ink, color: "#fff" },
    shu: { background: C.shu, color: "#fff" },
    ghost: { background: "transparent", color: C.ink, border: `1.5px solid ${C.line}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...btnBase, ...kinds[kind], opacity: disabled ? 0.4 : 1, ...style }}
    >
      {children}
    </button>
  );
}

export function Tag({ children, tone = "ink" }) {
  const tones = {
    ink: { background: "#EDEBE3", color: C.inkSoft },
    shu: { background: C.shuSoft, color: C.shu },
    pass: { background: C.passSoft, color: C.pass },
  };
  return (
    <span style={{
      ...tones[tone], fontSize: 12, fontWeight: 600,
      padding: "3px 10px", borderRadius: 999, display: "inline-block",
    }}>{children}</span>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
      padding: 20, ...style,
    }}>{children}</div>
  );
}

/* 字数ゲージ（原稿用紙風） */
export function CharGauge({ len, limit }) {
  if (!limit) return <span style={{ fontSize: 13, color: C.inkSoft }}>{len}字</span>;
  const over = len > limit;
  const pct = Math.min(100, (len / limit) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        flex: 1, height: 6, background: "#EDEBE3", borderRadius: 3, overflow: "hidden",
        maxWidth: 160,
      }}>
        <div style={{
          width: pct + "%", height: "100%", borderRadius: 3,
          background: over ? C.shu : C.ink, transition: "width .2s",
        }} />
      </div>
      <span style={{
        fontSize: 13, fontVariantNumeric: "tabular-nums",
        color: over ? C.shu : C.inkSoft, fontWeight: over ? 700 : 400,
      }}>
        {len} / {limit}字{over ? " 超過" : ""}
      </span>
    </div>
  );
}
