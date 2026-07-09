import { C } from "../theme";
import { Tag } from "./ui";

/* 朱入れ結果カード — このアプリの署名要素 */
export function ShuResult({ result, q }) {
  const tone = result.verdict === "合格レベル" ? C.pass : result.verdict === "あと一歩" ? C.warn : C.shu;
  const toneBg = result.verdict === "合格レベル" ? C.passSoft : result.verdict === "あと一歩" ? C.warnSoft : C.shuSoft;
  return (
    <div style={{
      borderLeft: `4px solid ${C.shu}`, background: "#FFFDF8",
      borderRadius: "0 12px 12px 0", padding: "18px 18px 18px 20px",
      position: "relative", border: `1px solid ${C.line}`, borderLeftWidth: 4, borderLeftColor: C.shu,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div style={{
          fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', serif",
          fontSize: 40, fontWeight: 700, color: C.shu, lineHeight: 1,
        }}>
          {result.score}<span style={{ fontSize: 16, color: C.inkSoft, fontWeight: 400 }}> /10</span>
        </div>
        <span style={{
          background: toneBg, color: tone, fontWeight: 700, fontSize: 14,
          padding: "4px 12px", borderRadius: 6,
        }}>{result.verdict}</span>
      </div>

      {result.good && (
        <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: C.ink }}>
          <b style={{ color: C.pass }}>◯ </b>{result.good}
        </p>
      )}
      {result.improve && (
        <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.7, color: C.shu }}>
          <b>✗ </b>{result.improve}
        </p>
      )}
      {result.missing && result.missing.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>不足:</span>
          {result.missing.map((k, i) => <Tag key={i} tone="shu">{k}</Tag>)}
        </div>
      )}
      <div style={{
        marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${C.line}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, letterSpacing: 1, marginBottom: 6 }}>模範解答</div>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.8, color: C.ink }}>{q.modelAnswer}</p>
      </div>
      <div style={{
        position: "absolute", top: 12, right: 14,
        fontFamily: "'Hiragino Mincho ProN', serif", color: C.shu,
        border: `2px solid ${C.shu}`, borderRadius: "50%", width: 34, height: 34,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 700, opacity: 0.85, transform: "rotate(-8deg)",
      }}>朱</div>
    </div>
  );
}
