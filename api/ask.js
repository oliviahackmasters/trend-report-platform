import { list } from "@vercel/blob";
import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { getVectorStoreIdForSector } from "../lib/vs.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  try {
    if (req.method !== "POST") {
      return json(res, 405, { error: "Use POST." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const sector = String(body.sector || "luxury").trim().toLowerCase();
    const vsid = getVectorStoreIdForSector(sector);
    if (!vsid) {
      return json(res, 500, { error: `Missing vector store ID for sector: ${sector}` });
    }

    const question = String(body.question || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!question) {
      return json(res, 400, { error: "Missing question." });
    }

    // Log for debugging + confirm sector + corpus size
    let docCount = 0;
    try {
      const prefixes = sector === "luxury"
        ? ["trend-library/meta/luxury/", "trend-library/meta/"]
        : [`trend-library/meta/${sector}/`];

      for (const prefix of prefixes) {
        const metas = await list({ prefix });
        docCount += (metas.blobs || []).length;
      }
    } catch (e) {
      // best-effort logging; ignore failures
    }

    console.log(`ASK sector=${sector} vsid=${vsid} docs=${docCount} question=${question.slice(0,200)}`);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = [
      "You are a trends research assistant.",
      `Answer using ONLY the uploaded documents in the "${sector}" sector when possible.`,
      "If the answer is not in the documents, say: NOT IN DOCUMENTS, then suggest what to upload.",
      "Keep answers structured and concise.",
      "Explore non-sustainability related themes and/or trends unless specifically prompted to do so."
    ].join("\n");

    const input = [
      { role: "system", content: system },
      ...history.slice(-8),
      { role: "user", content: question }
    ];

    const resp = await openai.responses.create({
      model,
      input,
      tools: [{ type: "file_search", vector_store_ids: [vsid] }],
      max_output_tokens: 1500
    });

    console.log(`ASK RESULT sector=${sector} vsid=${vsid} answerTokens=${(resp?.output_tokens || 0)}`);

    return json(res, 200, { answer: resp.output_text || "" });
  } catch (err) {
    return json(res, 500, { error: "ASK FAILED", details: String(err?.message || err) });
  }
}