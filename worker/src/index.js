// Cloudflare Worker — Anthropic API 制限付き透過プロキシ
// デプロイ: wrangler deploy
// シークレット設定: wrangler secret put ANTHROPIC_API_KEY / wrangler secret put APP_TOKEN

const ALLOWED_ORIGINS = new Set([
  "https://yoshi2292.github.io",
  "http://localhost:5173",
]);

const ALLOWED_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_CAP = 1000;

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/v1/messages") {
      return new Response("Not Found", { status: 404, headers: cors });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    const token = request.headers.get("X-App-Token");
    if (!token || token !== env.APP_TOKEN) {
      return new Response("Unauthorized", { status: 401, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400, headers: cors });
    }

    if (!Array.isArray(body.messages)) {
      return new Response("Bad Request: messages required", { status: 400, headers: cors });
    }

    // 悪用防止: model/max_tokensはサーバ側で強制し、messages以外の任意フィールドは除去する
    const safeBody = {
      model: ALLOWED_MODEL,
      max_tokens: Math.min(Number(body.max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP),
      messages: body.messages,
    };

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(safeBody),
    });

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
