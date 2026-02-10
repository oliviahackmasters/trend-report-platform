import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { readSessionToken, isExpired } from "../lib/sessionToken.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function deleteVectorStore(vectorStoreId) {
  await openai.vector_stores.del(vectorStoreId);
}

function extractCitations(response) {
  // Responses can include file_search tool call results if you request include[].
  // For MVP we return the model text; citations will be added in Phase 2 if needed.
  // Docs: include tool call content via include query param. :contentReference[oaicite:6]{index=6}
  return [];
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
    try { await deleteVectorStore(session.vsid); } catch {}
    return json(res, 410, { error: "Session expired. Please start a new session." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const question = (body.question || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!question) return json(res, 400, { error: "Missing question." });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `
You are a helpful assistant for trend reports.
Answer ONLY using the uploaded documents when possible.
If the answer is not in the documents, say so and ask what to upload next.
Be concise and structured.
`;

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
    }); :contentReference[oaicite:7]{index=7}

    json(res, 200, {
      answer: resp.output_text || "",
      citations: extractCitations(resp)
    });
  } catch (err) {
    json(res, 500, { error: "OpenAI request failed", details: String(err?.message || err) });
  }
}
