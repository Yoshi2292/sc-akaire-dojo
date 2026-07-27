export const C = {
  paper: "#F5F4EF",
  card: "#FFFFFF",
  ink: "#1F2933",
  inkSoft: "#5B6672",
  line: "#E3E0D6",
  shu: "#C73E3A", // 朱 — 採点ペン
  shuSoft: "#FBEDEC",
  pass: "#2E7D5B",
  passSoft: "#EAF4EF",
  warn: "#B7791F",
  warnSoft: "#FBF3E4",
};

export const FIELDS = [
  { id: "server", label: "サーバ運用・ログ", weak: true },
  { id: "auth", label: "認証・アクセス制御" },
  { id: "network", label: "ネットワーク・TLS" },
  { id: "mail", label: "メールセキュリティ" },
  { id: "web", label: "Web・セキュアプログラミング" },
  { id: "incident", label: "インシデント対応" },
  { id: "iot", label: "IoT/組込み" },
  { id: "law", label: "法制度・規格" },
];

export const fieldLabel = (id) => FIELDS.find((f) => f.id === id)?.label || id;
