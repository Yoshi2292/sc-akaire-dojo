/* ---------------- ストレージ ---------------- */
export const STORE_KEY = "akaire-data-v1";
export const emptyData = { history: [], custom: [], review: [], stats: { attempted: 0, answered: 0 } };

export function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...emptyData, ...JSON.parse(raw) };
  } catch (e) {
    console.error("読み込みに失敗:", e);
  }
  return { ...emptyData };
}

export function saveData(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("保存に失敗:", e);
  }
}
