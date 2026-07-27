import { useState, useEffect, useRef } from "react";
import { C, FIELDS, fieldLabel } from "./theme";
import { SEED } from "./data/seed";
import MURAYAMA_RAW from "./data/murayama_kouiu_recall.json";
import { loadData, saveData, emptyData } from "./lib/storage";
import { gradeAnswer, generateQuestion, getAppToken, setAppToken, isMockMode } from "./lib/api";
import { validateQuestions, exportAllData, parseFullDataImport } from "./lib/importExport";
import { Btn, Tag, Card, CharGauge, btnBase } from "./components/ui";
import { ShuResult } from "./components/ShuResult";

/* ---- 複数解答欄（設問内に「それぞれXX字以内」など複数の記述を求める場合）---- */
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
const partLabel = (q, i) => (q.answerLabels && q.answerLabels[i]) || CIRCLED[i] || `(${i + 1})`;
// charLimits に2つ以上あれば複数解答モード。1つ/未設定は従来どおり単一欄。
const answerParts = (q) => (Array.isArray(q?.charLimits) && q.charLimits.length >= 2 ? q.charLimits : null);
const MURAYAMA = MURAYAMA_RAW.map((q, idx) => ({ id: `murayama-${idx + 1}`, ...q }));
// 複数解答を採点用の1つの文字列に結合（gradePromptの文言は不変のまま）
const composeAnswer = (q, answer, answers) => {
  const parts = answerParts(q);
  if (!parts) return answer;
  return parts.map((_lim, i) => `${partLabel(q, i)} ${(answers[i] || "").trim()}`).join("\n");
};

/* ---------------- メイン ---------------- */
export default function App() {
  const needsToken = !isMockMode && !getAppToken();
  const [screen, setScreen] = useState(needsToken ? "settings" : "home"); // home | drill | gen | add | settings
  const [data, setData] = useState(emptyData);
  const [tokenInput, setTokenInput] = useState(getAppToken());

  // ドリル状態
  const [drillType, setDrillType] = useState("recall");
  const [fieldFilter, setFieldFilter] = useState("all");
  const [reviewMode, setReviewMode] = useState(false);
  const [q, setQ] = useState(null);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState([]); // 複数解答欄用
  const [result, setResult] = useState(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const startRef = useRef(0);

  // 生成状態
  const [genField, setGenField] = useState("server");
  const [genType, setGenType] = useState("kijutsu");
  const [genQ, setGenQ] = useState(null);
  const [genLoading, setGenLoading] = useState(false);

  // 追加フォーム
  const [form, setForm] = useState({ type: "kijutsu", field: "server", scenario: "", question: "", charLimit: "", charLimits: "", answerLabels: "", modelAnswer: "", keywords: "" });

  // JSONインポート（過去問）
  const [jsonImportText, setJsonImportText] = useState("");
  const [jsonImportPreview, setJsonImportPreview] = useState(null); // 配列 | {error:true, message}

  // 全データのバックアップ（エクスポート／インポート）
  const importFileRef = useRef(null);
  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState("");

  useEffect(() => {
    setData(loadData());
  }, []);

  const persist = (next) => { setData(next); saveData(next); };

  const persistStats = (nextStats) => {
    const next = { ...data, stats: nextStats };
    persist(next);
  };

  /* --- 問題プール --- */
  const pool = (type, field, review) => {
    if (review) {
      return data.review.filter((x) => (type ? x.type === type : true));
    }
    let p = [...SEED, ...MURAYAMA, ...data.custom].filter((x) => x.type === type);
    if (field !== "all") p = p.filter((x) => x.field === field);
    return p;
  };

  const startDrill = (type, review = false) => {
    const p = pool(type, fieldFilter, review);
    if (p.length === 0) return;
    setDrillType(type);
    setReviewMode(review);
    nextQuestion(p, null);
    setScreen("drill");
  };

  const nextQuestion = (p, currentId) => {
    const nextStats = { ...data.stats, attempted: (data.stats?.attempted || 0) + 1 };
    persistStats(nextStats);
    let cand = p.filter((x) => x.id !== currentId);
    if (cand.length === 0) cand = p;
    const nq = cand[Math.floor(Math.random() * cand.length)];
    setQ(nq); setAnswer(""); setAnswers([]); setResult(null); setError("");
    setElapsed(0);
    startRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
  };

  const grade = async () => {
    const parts = answerParts(q);
    if (parts ? parts.some((_l, i) => !(answers[i] || "").trim()) : !answer.trim()) return;
    const combined = composeAnswer(q, answer, answers);
    setGrading(true); setError("");
    if (timerRef.current) clearInterval(timerRef.current);
    const timeSec = Math.floor((Date.now() - startRef.current) / 1000);
    try {
      const r = await gradeAnswer(q, combined);
      setResult(r);
      const entry = { qid: q.id, date: new Date().toISOString(), score: r.score, timeSec, type: q.type, field: q.field };
      const next = { ...data, history: [...data.history, entry].slice(-200) };
      const nextStats = { ...data.stats, answered: (data.stats?.answered || 0) + 1 };
      // 復習リスト管理
      const inReview = next.review.some((x) => x.id === q.id);
      if (r.score < 7 && !inReview) next.review = [...next.review, q];
      if (r.score >= 8 && inReview && reviewMode) next.review = next.review.filter((x) => x.id !== q.id);
      persist({ ...next, stats: nextStats });
    } catch (e) {
      console.error(e);
      setError("採点に失敗しました。通信状態を確認して、もう一度お試しください。");
      // タイマー再開
      startRef.current = Date.now() - elapsed * 1000;
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    }
    setGrading(false);
  };

  const generate = async () => {
    setGenLoading(true); setGenQ(null);
    try {
      const g = await generateQuestion(genField, genType);
      g.id = "ai-" + Date.now();
      g.source = "ai";
      setGenQ(g);
    } catch (e) {
      console.error(e);
      setGenQ({ error: true });
    }
    setGenLoading(false);
  };

  const saveGenerated = (solve) => {
    const next = { ...data, custom: [...data.custom, genQ] };
    persist(next);
    if (solve) {
      const nextStats = { ...data.stats, attempted: (data.stats?.attempted || 0) + 1 };
      persistStats(nextStats);
      setDrillType(genQ.type); setReviewMode(false);
      setQ(genQ); setAnswer(""); setAnswers([]); setResult(null); setError(""); setElapsed(0);
      startRef.current = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
      setScreen("drill");
    }
    setGenQ(null);
  };

  const addCustom = () => {
    if (!form.question.trim() || !form.modelAnswer.trim()) return;
    const limits = form.charLimits.split(/[、,]/).map((s) => parseInt(s.trim(), 10)).filter((v) => Number.isFinite(v) && v > 0);
    const labels = form.answerLabels.split(/[、,]/).map((s) => s.trim()).filter(Boolean);
    const multi = limits.length >= 2;
    const nq = {
      id: "c-" + Date.now(),
      type: form.type,
      field: form.field,
      scenario: form.scenario.trim() || undefined,
      question: form.question.trim(),
      charLimit: !multi && form.charLimit ? parseInt(form.charLimit, 10) : undefined,
      charLimits: multi ? limits : undefined,
      answerLabels: multi && labels.length > 0 ? labels : undefined,
      modelAnswer: form.modelAnswer.trim(),
      keywords: form.keywords.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
      source: "custom",
    };
    persist({ ...data, custom: [...data.custom, nq] });
    setForm({ type: "kijutsu", field: "server", scenario: "", question: "", charLimit: "", charLimits: "", answerLabels: "", modelAnswer: "", keywords: "" });
    setScreen("home");
  };

  /* --- JSONインポート（過去問） --- */
  const previewJsonImport = () => {
    try {
      setJsonImportPreview(validateQuestions(jsonImportText));
    } catch (e) {
      setJsonImportPreview({ error: true, message: e.message });
    }
  };
  const saveJsonImport = () => {
    persist({ ...data, custom: [...data.custom, ...jsonImportPreview] });
    setJsonImportText(""); setJsonImportPreview(null);
    setScreen("home");
  };

  /* --- 全データのバックアップ --- */
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImportError(""); setImportOk("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseFullDataImport(reader.result);
        if (!window.confirm(`現在のデータを置き換えます。よろしいですか？（履歴${imported.history.length}件・追加問題${imported.custom.length}件を読み込みます）`)) return;
        persist(imported);
        setImportOk("インポートしました。");
      } catch (err) {
        setImportError(err.message);
      }
    };
    reader.readAsText(file);
  };

  /* --- 統計 --- */
  const stats = (() => {
    const h = data.history;
    const attempted = data.stats?.attempted || 0;
    if (h.length === 0 && attempted === 0) return null;
    const avg = (arr) => arr.reduce((a, b) => a + b.score, 0) / arr.length;
    const byField = {};
    h.forEach((e) => { (byField[e.field] = byField[e.field] || []).push(e); });
    const today = new Date().toDateString();
    const todayCount = h.filter((e) => new Date(e.date).toDateString() === today).length;
    return {
      total: h.length,
      avg: h.length > 0 ? avg(h) : 0,
      byField,
      todayCount,
      attempted,
      answerRate: attempted > 0 ? h.length / attempted : null,
    };
  })();

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  /* ================= 画面 ================= */
  const wrap = {
    minHeight: "100vh", background: C.paper, color: C.ink,
    fontFamily: "'Hiragino Sans', 'Yu Gothic', -apple-system, sans-serif",
    WebkitFontSmoothing: "antialiased",
  };
  const inner = { maxWidth: 640, margin: "0 auto", padding: "0 16px 60px" };

  const header = (
    <div style={{
      background: C.ink, color: "#F5F4EF", padding: "16px 0",
      marginBottom: 24, borderBottom: `3px solid ${C.shu}`,
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div
          style={{ cursor: "pointer" }}
          onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setScreen("home"); }}
        >
          <span style={{ fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', serif", fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
            <span style={{ color: "#E36B67" }}>朱入れ</span>道場
          </span>
          <span style={{ fontSize: 11.5, marginLeft: 10, opacity: 0.65, letterSpacing: 1 }}>SC 記述トレーニング</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          {stats && screen === "home" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, opacity: 0.75 }}>本日 {stats.todayCount}問</span>
              <span style={{ fontSize: 12.5, opacity: 0.75 }}>
                回答率 {stats.attempted > 0 ? `${Math.round((stats.total / stats.attempted) * 100)}%` : "-"}
              </span>
            </div>
          )}
          <button
            onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setTokenInput(getAppToken()); setScreen("settings"); }}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#F5F4EF", opacity: 0.7, fontSize: 16, padding: 0 }}
            aria-label="設定"
          >⚙</button>
        </div>
      </div>
    </div>
  );

  /* ---- ホーム ---- */
  if (screen === "home") {
    return (
      <div style={wrap}>
        {header}
        <div style={inner}>
          {/* 分野フィルタ */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, letterSpacing: 1, marginBottom: 8 }}>出題分野</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ id: "all", label: "すべて" }, ...FIELDS].map((f) => (
                <button key={f.id} onClick={() => setFieldFilter(f.id)}
                  style={{
                    ...btnBase, padding: "6px 12px", fontSize: 13, borderRadius: 999,
                    background: fieldFilter === f.id ? C.ink : "#EDEBE3",
                    color: fieldFilter === f.id ? "#fff" : C.inkSoft,
                    fontWeight: fieldFilter === f.id ? 700 : 500,
                  }}>
                  {f.label}{f.weak ? " ◎" : ""}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 6 }}>◎ = 重点強化分野</div>
          </div>

          {/* 訓練モード */}
          <div style={{ display: "grid", gap: 12 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>書き出しリコール訓練</div>
                  <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.6 }}>
                    「聞いたことはあるが書けない」を潰す。技術要素を白紙から書き出し、AIが朱入れ。
                  </p>
                </div>
              </div>
              <Btn kind="ink" onClick={() => startDrill("recall")} disabled={pool("recall", fieldFilter, false).length === 0} style={{ marginTop: 14, width: "100%" }}>
                開始（{pool("recall", fieldFilter, false).length}問）
              </Btn>
            </Card>

            <Card>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>記述演習（本試験形式）</div>
              <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.6 }}>
                シナリオ＋字数制限つき設問。経過時間を計測し、読解スピードも鍛える。
              </p>
              <Btn kind="shu" onClick={() => startDrill("kijutsu")} disabled={pool("kijutsu", fieldFilter, false).length === 0} style={{ marginTop: 14, width: "100%" }}>
                開始（{pool("kijutsu", fieldFilter, false).length}問）
              </Btn>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>AI問題生成</div>
                <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: C.inkSoft }}>弱点分野を無限に演習</p>
                <Btn kind="ghost" onClick={() => setScreen("gen")} style={{ width: "100%", padding: "9px 0", fontSize: 14 }}>開く</Btn>
              </Card>
              <Card style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>問題を追加</div>
                <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: C.inkSoft }}>過去問を手動登録</p>
                <Btn kind="ghost" onClick={() => setScreen("add")} style={{ width: "100%", padding: "9px 0", fontSize: 14 }}>開く</Btn>
              </Card>
              <Card style={{ padding: 16, gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>過去問JSONインポート</div>
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkSoft }}>Claudeチャットで変換したJSONを貼り付けて登録</p>
                  </div>
                  <Btn kind="ghost" onClick={() => { setJsonImportText(""); setJsonImportPreview(null); setScreen("import"); }} style={{ padding: "9px 20px", fontSize: 14, flexShrink: 0 }}>開く</Btn>
                </div>
              </Card>
            </div>

            {data.review.length > 0 && (
              <Card style={{ borderColor: C.shu, borderWidth: 1.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: C.shu }}>要復習 {data.review.length}問</div>
                    <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.inkSoft }}>7点未満の問題。8点以上で卒業。</p>
                  </div>
                  <Btn kind="shu" onClick={() => {
                    const p = data.review;
                    setDrillType(null); setReviewMode(true);
                    nextQuestion(p, null); setScreen("drill");
                  }} style={{ padding: "10px 18px" }}>解き直す</Btn>
                </div>
              </Card>
            )}

            {/* 統計 */}
            {stats && (
              <Card>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, letterSpacing: 1, marginBottom: 12 }}>成績</div>
                <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: "'Hiragino Mincho ProN', serif", fontSize: 28, fontWeight: 700 }}>{stats.total}</div>
                    <div style={{ fontSize: 12, color: C.inkSoft }}>累計回答</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Hiragino Mincho ProN', serif", fontSize: 28, fontWeight: 700, color: stats.avg >= 6 ? C.pass : C.shu }}>
                      {stats.avg.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 12, color: C.inkSoft }}>平均点 /10</div>
                    {stats.answerRate !== null && (
                      <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
                        回答率 {Math.round(stats.answerRate * 100)}% ({stats.total}/{stats.attempted})
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {FIELDS.filter((f) => stats.byField[f.id]).map((f) => {
                    const arr = stats.byField[f.id];
                    const avg = arr.reduce((a, b) => a + b.score, 0) / arr.length;
                    return (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12.5, width: 150, color: C.inkSoft }}>{f.label}</span>
                        <div style={{ flex: 1, height: 6, background: "#EDEBE3", borderRadius: 3 }}>
                          <div style={{ width: (avg * 10) + "%", height: "100%", borderRadius: 3, background: avg >= 6 ? C.pass : C.shu }} />
                        </div>
                        <span style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums", width: 28, textAlign: "right" }}>{avg.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---- ドリル ---- */
  if (screen === "drill" && q) {
    const isKijutsu = q.type === "kijutsu";
    return (
      <div style={wrap}>
        {header}
        <div style={inner}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Tag>{fieldLabel(q.field)}</Tag>
              <Tag tone={isKijutsu ? "shu" : "ink"}>{isKijutsu ? "記述演習" : "リコール"}</Tag>
              {reviewMode && <Tag tone="shu">復習</Tag>}
            </div>
            <span style={{
              fontSize: 14, fontVariantNumeric: "tabular-nums",
              color: elapsed > 300 ? C.shu : C.inkSoft, fontWeight: 600,
            }}>⏱ {fmtTime(elapsed)}</span>
          </div>

          <Card style={{ marginBottom: 14 }}>
            {q.scenario && (
              <p style={{
                margin: "0 0 14px", fontSize: 14.5, lineHeight: 1.9, color: C.ink,
                paddingBottom: 14, borderBottom: `1px dashed ${C.line}`,
              }}>{q.scenario}</p>
            )}
            {q.exhibit && (
              <div style={{ margin: "0 0 14px" }}>
                <div style={{ marginBottom: 6 }}><Tag>図表</Tag></div>
                <div style={{
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  fontSize: 12.5, lineHeight: 1.7, color: C.ink,
                  whiteSpace: "pre", overflowX: "auto",
                  background: "#FFFDF8", border: `1px solid ${C.line}`,
                  borderRadius: 8, padding: 12,
                }}>{q.exhibit}</div>
              </div>
            )}
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.8, fontWeight: 700 }}>
              <span style={{ color: C.shu, marginRight: 6 }}>設問</span>{q.question}
            </p>
          </Card>

          {(() => {
            const textareaStyle = {
              width: "100%", boxSizing: "border-box", padding: 14,
              fontSize: 16, lineHeight: 1.8, fontFamily: "inherit",
              border: `1.5px solid ${C.line}`, borderRadius: 10,
              background: "#FFFDF8", color: C.ink, resize: "vertical",
              outline: "none",
            };
            const parts = answerParts(q);
            if (parts) {
              return (
                <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
                  {parts.map((lim, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.shu, marginBottom: 6 }}>
                        解答 {partLabel(q, i)}
                      </div>
                      <textarea
                        value={answers[i] || ""}
                        onChange={(e) => {
                          const na = [...answers]; na[i] = e.target.value; setAnswers(na);
                        }}
                        disabled={grading || !!result}
                        placeholder="ここに答案を書く（自分の言葉で、白紙から）"
                        rows={2}
                        style={textareaStyle}
                      />
                      <div style={{ margin: "6px 2px 0" }}>
                        <CharGauge len={(answers[i] || "").length} limit={lim} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={grading || !!result}
                  placeholder="ここに答案を書く（自分の言葉で、白紙から）"
                  rows={isKijutsu ? 3 : 6}
                  style={textareaStyle}
                />
                <div style={{ margin: "8px 2px 16px" }}>
                  <CharGauge len={answer.length} limit={q.charLimit} />
                </div>
              </>
            );
          })()}

          {error && <p style={{ color: C.shu, fontSize: 14, margin: "0 0 12px" }}>{error}</p>}

          {!result ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn kind="shu" onClick={grade} disabled={grading || (answerParts(q) ? answerParts(q).some((_l, i) => !(answers[i] || "").trim()) : !answer.trim())} style={{ flex: 1 }}>
                {grading ? "朱入れ中…" : "採点する"}
              </Btn>
              <Btn kind="ghost" onClick={() => {
                const p = reviewMode ? data.review : pool(drillType, fieldFilter, false);
                nextQuestion(p, q.id);
              }}>スキップ</Btn>
              <Btn kind="ghost" onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setScreen("home"); }}>
                終了
              </Btn>
            </div>
          ) : (
            <>
              <ShuResult result={result} q={q} />
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <Btn kind="ink" onClick={() => {
                  const p = reviewMode ? data.review : pool(drillType, fieldFilter, false);
                  if (p.length === 0) { setScreen("home"); return; }
                  nextQuestion(p, q.id);
                }} style={{ flex: 1 }}>次の問題</Btn>
                <Btn kind="ghost" onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setScreen("home"); }}>終了</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ---- AI問題生成 ---- */
  if (screen === "gen") {
    return (
      <div style={wrap}>
        {header}
        <div style={inner}>
          <h2 style={{ fontFamily: "'Hiragino Mincho ProN', serif", fontSize: 20, margin: "0 0 16px" }}>AI問題生成</h2>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>分野</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {FIELDS.map((f) => (
                <button key={f.id} onClick={() => setGenField(f.id)}
                  style={{
                    ...btnBase, padding: "6px 12px", fontSize: 13, borderRadius: 999,
                    background: genField === f.id ? C.ink : "#EDEBE3",
                    color: genField === f.id ? "#fff" : C.inkSoft,
                  }}>{f.label}{f.weak ? " ◎" : ""}</button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>形式</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {[["kijutsu", "記述演習（本試験形式）"], ["recall", "書き出しリコール"]].map(([v, l]) => (
                <button key={v} onClick={() => setGenType(v)}
                  style={{
                    ...btnBase, padding: "8px 14px", fontSize: 13.5, borderRadius: 8,
                    background: genType === v ? C.shu : "#EDEBE3",
                    color: genType === v ? "#fff" : C.inkSoft,
                  }}>{l}</button>
              ))}
            </div>
            <Btn kind="ink" onClick={generate} disabled={genLoading} style={{ width: "100%" }}>
              {genLoading ? "作問中…" : "問題を生成する"}
            </Btn>
          </Card>

          {genQ && !genQ.error && (
            <Card style={{ borderColor: C.shu }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <Tag>{fieldLabel(genQ.field)}</Tag>
                <Tag tone="shu">{genQ.type === "kijutsu" ? "記述演習" : "リコール"}</Tag>
              </div>
              {genQ.scenario && <p style={{ fontSize: 14, lineHeight: 1.8, margin: "0 0 10px", color: C.inkSoft }}>{genQ.scenario}</p>}
              <p style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.7, margin: 0 }}>{genQ.question}</p>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <Btn kind="shu" onClick={() => saveGenerated(true)} style={{ flex: 1 }}>この問題を解く</Btn>
                <Btn kind="ghost" onClick={() => saveGenerated(false)}>保存のみ</Btn>
                <Btn kind="ghost" onClick={generate}>作り直す</Btn>
              </div>
            </Card>
          )}
          {genQ && genQ.error && (
            <p style={{ color: C.shu, fontSize: 14 }}>生成に失敗しました。もう一度お試しください。</p>
          )}
          <div style={{ marginTop: 20 }}>
            <Btn kind="ghost" onClick={() => setScreen("home")}>ホームに戻る</Btn>
          </div>
        </div>
      </div>
    );
  }

  /* ---- 問題追加 ---- */
  if (screen === "add") {
    const inputStyle = {
      width: "100%", boxSizing: "border-box", padding: 12, fontSize: 15,
      fontFamily: "inherit", border: `1.5px solid ${C.line}`, borderRadius: 8,
      background: "#fff", color: C.ink, outline: "none", lineHeight: 1.7,
    };
    const label = (t) => <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, margin: "14px 0 6px" }}>{t}</div>;
    return (
      <div style={wrap}>
        {header}
        <div style={inner}>
          <h2 style={{ fontFamily: "'Hiragino Mincho ProN', serif", fontSize: 20, margin: "0 0 4px" }}>問題を追加</h2>
          <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 0 12px" }}>過去問を手動で登録できます（IPA過去問は出典明記のうえ私的学習利用）。</p>
          <Card>
            {label("形式")}
            <div style={{ display: "flex", gap: 6 }}>
              {[["kijutsu", "記述演習"], ["recall", "リコール"]].map(([v, l]) => (
                <button key={v} onClick={() => setForm({ ...form, type: v })}
                  style={{ ...btnBase, padding: "7px 14px", fontSize: 13.5, background: form.type === v ? C.ink : "#EDEBE3", color: form.type === v ? "#fff" : C.inkSoft }}>{l}</button>
              ))}
            </div>
            {label("分野")}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FIELDS.map((f) => (
                <button key={f.id} onClick={() => setForm({ ...form, field: f.id })}
                  style={{ ...btnBase, padding: "6px 12px", fontSize: 12.5, borderRadius: 999, background: form.field === f.id ? C.ink : "#EDEBE3", color: form.field === f.id ? "#fff" : C.inkSoft }}>{f.label}</button>
              ))}
            </div>
            {form.type === "kijutsu" && (<>
              {label("状況設定（本文の要約・任意）")}
              <textarea rows={4} value={form.scenario} onChange={(e) => setForm({ ...form, scenario: e.target.value })} style={inputStyle} placeholder="例: N社のWebサーバで…" />
            </>)}
            {label("設問 *")}
            <textarea rows={2} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} style={inputStyle} placeholder="例: 〜の理由を40字以内で述べよ。" />
            {form.type === "kijutsu" && (<>
              {label("字数制限（数値・任意）")}
              <input type="number" value={form.charLimit} onChange={(e) => setForm({ ...form, charLimit: e.target.value })} style={inputStyle} placeholder="40" />
              {label("複数解答の字数制限（カンマ区切り・任意）")}
              <input value={form.charLimits} onChange={(e) => setForm({ ...form, charLimits: e.target.value })} style={inputStyle} placeholder="例: 25, 25（「それぞれXX字以内」用。2つ以上でこちらが優先）" />
              {form.charLimits.split(/[、,]/).filter((s) => s.trim()).length >= 2 && (<>
                {label("解答ラベル（カンマ区切り・任意）")}
                <input value={form.answerLabels} onChange={(e) => setForm({ ...form, answerLabels: e.target.value })} style={inputStyle} placeholder="例: 利点, 実施内容（省略時は①②③）" />
              </>)}
            </>)}
            {label("模範解答 *")}
            <textarea rows={3} value={form.modelAnswer} onChange={(e) => setForm({ ...form, modelAnswer: e.target.value })} style={inputStyle} />
            {label("採点キーワード（読点区切り・任意）")}
            <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} style={inputStyle} placeholder="例: しきい値、試行回数" />
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <Btn kind="ink" onClick={addCustom} disabled={!form.question.trim() || !form.modelAnswer.trim()} style={{ flex: 1 }}>保存する</Btn>
              <Btn kind="ghost" onClick={() => setScreen("home")}>戻る</Btn>
            </div>
            {data.custom.length > 0 && (
              <p style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 14, marginBottom: 0 }}>登録済み: {data.custom.length}問（AI生成含む）</p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  /* ---- 設定（APP_TOKEN） ---- */
  if (screen === "settings") {
    const inputStyle = {
      width: "100%", boxSizing: "border-box", padding: 12, fontSize: 15,
      fontFamily: "inherit", border: `1.5px solid ${C.line}`, borderRadius: 8,
      background: "#fff", color: C.ink, outline: "none", lineHeight: 1.7,
    };
    return (
      <div style={wrap}>
        {header}
        <div style={inner}>
          <h2 style={{ fontFamily: "'Hiragino Mincho ProN', serif", fontSize: 20, margin: "0 0 4px" }}>設定</h2>
          <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 0 12px", lineHeight: 1.7 }}>
            AI採点・生成にはアクセストークンが必要です。Cloudflare Workerに設定した APP_TOKEN と同じ値を入力してください。
          </p>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 6 }}>アクセストークン</div>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={inputStyle}
              placeholder="APP_TOKEN"
              autoComplete="off"
            />
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <Btn kind="ink" onClick={() => { setAppToken(tokenInput.trim()); setScreen("home"); }} disabled={!tokenInput.trim()} style={{ flex: 1 }}>保存する</Btn>
              {!needsToken && <Btn kind="ghost" onClick={() => setScreen("home")}>戻る</Btn>}
            </div>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 6 }}>データのバックアップ</div>
            <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 12px", lineHeight: 1.7 }}>
              iPhone⇄Mac間でデータを移行できます。エクスポートしたJSONファイルを別端末でインポートしてください（現在のデータを置き換えます）。
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="ghost" onClick={() => exportAllData(data)} style={{ flex: 1 }}>エクスポート</Btn>
              <Btn kind="ghost" onClick={() => importFileRef.current?.click()} style={{ flex: 1 }}>インポート</Btn>
            </div>
            <input ref={importFileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleImportFile} />
            {importError && <p style={{ color: C.shu, fontSize: 13, marginTop: 10, whiteSpace: "pre-wrap" }}>{importError}</p>}
            {importOk && <p style={{ color: C.pass, fontSize: 13, marginTop: 10 }}>{importOk}</p>}
          </Card>
        </div>
      </div>
    );
  }

  /* ---- 過去問JSONインポート ---- */
  if (screen === "import") {
    const inputStyle = {
      width: "100%", boxSizing: "border-box", padding: 12, fontSize: 14,
      fontFamily: "ui-monospace, monospace", border: `1.5px solid ${C.line}`, borderRadius: 8,
      background: "#fff", color: C.ink, outline: "none", lineHeight: 1.6,
    };
    return (
      <div style={wrap}>
        {header}
        <div style={inner}>
          <h2 style={{ fontFamily: "'Hiragino Mincho ProN', serif", fontSize: 20, margin: "0 0 4px" }}>過去問JSONインポート</h2>
          <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 0 12px", lineHeight: 1.7 }}>
            Claudeチャット側でPDFから変換したJSON配列を貼り付けてください（IPA過去問は出典明記のうえ私的学習利用）。
          </p>
          <Card style={{ marginBottom: 14 }}>
            <textarea
              rows={10}
              value={jsonImportText}
              onChange={(e) => { setJsonImportText(e.target.value); setJsonImportPreview(null); }}
              style={inputStyle}
              placeholder='[{"type":"kijutsu","field":"server","scenario":"…","question":"…","charLimit":40,"modelAnswer":"…","keywords":["k1","k2"],"ref":"R7秋 午後 問1"}]'
            />
            <Btn kind="shu" onClick={previewJsonImport} disabled={!jsonImportText.trim()} style={{ marginTop: 12, width: "100%" }}>プレビュー</Btn>
          </Card>

          {jsonImportPreview && jsonImportPreview.error && (
            <p style={{ color: C.shu, fontSize: 13.5, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{jsonImportPreview.message}</p>
          )}
          {jsonImportPreview && !jsonImportPreview.error && (
            <Card style={{ borderColor: C.pass, borderWidth: 1.5 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.pass, marginBottom: 12 }}>
                {jsonImportPreview.length}問を読み込みました
              </div>
              <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                {jsonImportPreview.map((x, i) => (
                  <div key={x.id} style={{ borderTop: i > 0 ? `1px dashed ${C.line}` : "none", paddingTop: i > 0 ? 12 : 0 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <Tag>{fieldLabel(x.field)}</Tag>
                      {x.charLimit && <Tag tone="shu">{x.charLimit}字</Tag>}
                      {Array.isArray(x.charLimits) && x.charLimits.length >= 2 && <Tag tone="shu">{x.charLimits.join("/")}字（複数解答）</Tag>}
                      {x.exhibit && <Tag tone="pass">図表あり</Tag>}
                      {x.ref && <Tag>{x.ref}</Tag>}
                    </div>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, lineHeight: 1.6 }}>{x.question}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkSoft, lineHeight: 1.6 }}>解答: {x.modelAnswer}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn kind="ink" onClick={saveJsonImport} style={{ flex: 1 }}>すべて保存する</Btn>
                <Btn kind="ghost" onClick={() => setJsonImportPreview(null)}>破棄</Btn>
              </div>
            </Card>
          )}
          <div style={{ marginTop: 20 }}>
            <Btn kind="ghost" onClick={() => setScreen("home")}>ホームに戻る</Btn>
          </div>
        </div>
      </div>
    );
  }

  return <div style={wrap}>{header}</div>;
}
