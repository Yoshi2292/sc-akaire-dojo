import { gradePrompt, genPrompt } from "./prompts";
import { fieldLabel } from "../theme";

const APP_TOKEN_KEY = "akaire-app-token";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export function getAppToken() {
  return localStorage.getItem(APP_TOKEN_KEY) || "";
}
export function setAppToken(token) {
  localStorage.setItem(APP_TOKEN_KEY, token);
}

async function callMessages(prompt) {
  const res = await fetch(`${API_BASE}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": getAppToken(),
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error("API: " + (data.error.message || JSON.stringify(data.error)));
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/* ---- ローカル開発用モック（VITE_API_BASE_URL 未設定時のみ）----
   Worker実装完了後、.envでVITE_API_BASE_URLを設定すれば自動的に本物のAPIに切り替わる。 */
function mockDelay() {
  return new Promise((r) => setTimeout(r, 500));
}

async function mockGrade(q, answer) {
  await mockDelay();
  const lenOk = !q.charLimit || answer.length <= q.charLimit;
  const hitKeywords = (q.keywords || []).filter((k) => answer.includes(k));
  const score = Math.max(3, Math.min(10, 5 + hitKeywords.length * 2 - (lenOk ? 0 : 2)));
  const verdict = score >= 8 ? "合格レベル" : score >= 6 ? "あと一歩" : "要復習";
  return {
    score,
    verdict,
    good: "[MOCK] 論点の方向性は模範解答に近いです。",
    improve: "[MOCK] これはローカルモックの採点結果です。Worker接続後は実際のAI採点に置き換わります。",
    missing: (q.keywords || []).filter((k) => !answer.includes(k)).slice(0, 3),
  };
}

async function mockGenerate(fieldId, type) {
  await mockDelay();
  const fl = fieldLabel(fieldId);
  if (type === "recall") {
    return {
      type: "recall",
      field: fieldId,
      question: `[MOCK] ${fl}分野の重要な仕組みを書き出せ。`,
      modelAnswer: "[MOCK] これはローカルモックの生成結果です。",
      keywords: ["mock1", "mock2"],
    };
  }
  return {
    type: "kijutsu",
    field: fieldId,
    scenario: `[MOCK] ${fl}分野を題材にしたシナリオ（モック）。`,
    question: "[MOCK] 下線部の理由を40字以内で述べよ。",
    charLimit: 40,
    modelAnswer: "[MOCK] これはローカルモックの模範解答です。",
    keywords: ["mock1", "mock2"],
  };
}

export async function gradeAnswer(q, answer) {
  if (!API_BASE) return mockGrade(q, answer);
  return callMessages(gradePrompt(q, answer));
}

export async function generateQuestion(fieldId, type) {
  if (!API_BASE) return mockGenerate(fieldId, type);
  return callMessages(genPrompt(fieldId, type));
}

export const isMockMode = !API_BASE;
