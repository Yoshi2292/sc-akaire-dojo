import { FIELDS } from "../theme";

const VALID_TYPES = ["kijutsu", "recall"];
const VALID_FIELDS = FIELDS.map((f) => f.id);

/* 過去問JSONインポート（4.3） */
export function validateQuestions(input) {
  let arr;
  try {
    arr = JSON.parse(input);
  } catch {
    throw new Error("JSONの形式が正しくありません。");
  }
  if (!Array.isArray(arr)) throw new Error("配列形式（[ {...}, {...} ]）で入力してください。");
  if (arr.length === 0) throw new Error("データが空です。");

  const errors = [];
  const items = arr.map((raw, i) => {
    const n = i + 1;
    const limits = Array.isArray(raw.charLimits)
      ? raw.charLimits.map(Number).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    if (!VALID_TYPES.includes(raw.type)) errors.push(`${n}件目: type は "kijutsu" か "recall" である必要があります`);
    if (!VALID_FIELDS.includes(raw.field)) errors.push(`${n}件目: field が不正です（${VALID_FIELDS.join("/")}）`);
    if (!raw.question || !String(raw.question).trim()) errors.push(`${n}件目: question は必須です`);
    if (!raw.modelAnswer || !String(raw.modelAnswer).trim()) errors.push(`${n}件目: modelAnswer は必須です`);
    return {
      id: "json-" + Date.now() + "-" + i,
      type: raw.type,
      field: raw.field,
      scenario: raw.scenario ? String(raw.scenario) : undefined,
      exhibit: typeof raw.exhibit === "string" ? raw.exhibit : undefined,
      question: raw.question,
      charLimit: raw.charLimit ? Number(raw.charLimit) : undefined,
      // 複数解答欄（「それぞれXX字以内」など）: 各解答欄の字数制限と任意ラベル
      charLimits: limits.length >= 2 ? limits : undefined,
      answerLabels: limits.length >= 2 && Array.isArray(raw.answerLabels)
        ? raw.answerLabels.map(String)
        : undefined,
      modelAnswer: raw.modelAnswer,
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
      source: raw.source || "json",
      ref: raw.ref ? String(raw.ref) : undefined,
    };
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return items;
}

/* 全データのエクスポート／インポート（iPhone⇄Mac移行用） */
export function exportAllData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `akaire-data-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseFullDataImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSONの形式が正しくありません。");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("エクスポートしたファイルの形式と一致しません。");
  }
  return {
    history: Array.isArray(parsed.history) ? parsed.history : [],
    custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    review: Array.isArray(parsed.review) ? parsed.review : [],
  };
}
