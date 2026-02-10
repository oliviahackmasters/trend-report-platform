import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { readSessionToken, isExpired } from "../lib/sessionToken.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function safeDeleteVectorStore(vectorStoreId) {
  try { await openai.vector_stores.del(vectorStoreId); } catch {}
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") return json(res, 405, { error: "Use POST." });

  const token = req.headers["x-session-token"];
  const session = readSessionToken(token);
  if (!session?.vsid) return json(res, 400, { error: "Missing/invalid session token." });

  if (isExpired(session.createdAt)) {
    await safeDeleteVectorStore(session.vsid);
    return json(res, 410, { error: "Session expired. Please start a new session." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const question = String(body.question || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!question) return json(res, 400, { error: "Missing question." });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = [
    "You are a trends research assistant.",
    "Answer using ONLY the uploaded documents when possible.",
    "If the answer is not in the documents, say: NOT IN DOCUMENTS, then suggest what to upload.",
    "Keep answers structured and concise."
  ].join("\n");

  const input = [
    { role: "system", content: system },
    ...history.slice(-8),
    { role: "user", content: question }
  ];

  try {
    const resp = await openai.responses.create({
      model,
      input,
      tools: [{ type: "file_search", vector_store_ids: [session.vsid] }],
      max_output_tokens: 900
    });

    return json(res, 200, { answer: resp.output_text || "" });
  } catch (err) {
    return json(res, 500, { error: "OpenAI request failed", details: String(err?.message || err) });
  }
}
