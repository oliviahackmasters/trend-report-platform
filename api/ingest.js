import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { put, list } from "@vercel/blob";

import { openai } from "../lib/openaiClient.js";
import { getVectorStores } from "../lib/vs.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function guessYear(filename) {
  const m = String(filename || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : "";
}

/**
 * Heuristic "company/source" guess:
 * - If filename starts with something like "EIU_" or "McKinsey-" etc, use that token
 * - Otherwise blank
 */
function guessCompanyFromFilename(filename) {
  const base = String(filename || "").replace(/\.[^.]+$/, "");
  const token = base.split(/[_-]/)[0]?.trim() || "";
  if (/^[A-Za-z]{2,20}$/.test(token)) return token.toUpperCase();
  return "";
}

/**
 * Heuristic topic tags from filename keywords
 * (edit freely; keep short + useful)
 */
function guessTopicsFromFilename(filename) {
  const lower = String(filename || "").toLowerCase();

  const map = [
    ["health", "Health"],
    ["wellness", "Health"],
    ["retail", "Retail"],
    ["consumer", "Consumer"],
    ["goods", "Consumer Goods"],
    ["luxury", "Luxury"],
    ["fashion", "Fashion"],
    ["beauty", "Beauty"],
    ["travel", "Travel"],
    ["hospital", "Hospitality"],
    ["finance", "Finance"],
    ["bank", "Banking"],
    ["ai", "AI"],
    ["genai", "AI"],
    ["technology", "Technology"],
    ["tech", "Technology"],
    ["sustain", "Sustainability"],
    ["climate", "Climate"],
    ["energy", "Energy"],
    ["media", "Media"],
    ["culture", "Culture"],
    ["education", "Education"],
    ["work", "Work"],
  ];

  const topics = [];
  for (const [needle, label] of map) {
    if (lower.includes(needle)) topics.push(label);
  }
  return Array.from(new Set(topics));
}

/**
 * Optional LLM refinement.
 * For now: refine tags from filename only (stable + fast + no extra parsing).
 * You can later swap prompt/input to include extracted text snippets.
 */
async function refineTagsWithModel({ filename, year, company, topics }) {
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const prompt = `
You are tagging a trend report for a library.

Return STRICT JSON only, no markdown:
{"year":"", "company":"", "topics":[...]}

Rules:
- year: 4-digit year if clearly implied, else "".
- company: publisher/source if clearly implied from filename, else "".
- topics: 3–8 short topic tags in Title Case, deduplicated.

Filename: ${filename}

Current guesses:
year=${year || ""}
company=${company || ""}
topics=${(topics || []).join(", ")}
`.trim();

    const resp = await openai.responses.create({
      model,
      input: [{ role: "user", content: prompt }],
      max_output_tokens: 200
    });

    const txt = (resp.output_text || "").trim();
    const parsed = JSON.parse(txt);

    // Basic shape validation
    const out = {
      year: typeof parsed.year === "string" ? parsed.year : "",
      company: typeof parsed.company === "string" ? parsed.company : "",
      topics: Array.isArray(parsed.topics) ? parsed.topics.map(String) : []
    };

    // normalize
    out.year = out.year.match(/\b(19\d{2}|20\d{2})\b/) ? out.year : "";
    out.company = out.company.trim().slice(0, 60);
    out.topics = Array.from(new Set(out.topics.map(t => t.trim()).filter(Boolean))).slice(0, 12);

    return out;
  } catch {
    return null;
  }
}

function mergeTags({ base, refined, manual }) {
  // manual overrides win; refined next; base last
  const year =
    String(manual?.year || refined?.year || base?.year || "").trim().slice(0, 4);

  const company =
    String(manual?.company || refined?.company || base?.company || "").trim().slice(0, 60);

  const topicsManual = Array.isArray(manual?.topics) ? manual.topics : [];
  const topicsRefined = Array.isArray(refined?.topics) ? refined.topics : [];
  const topicsBase = Array.isArray(base?.topics) ? base.topics : [];

  const topics = Array.from(
    new Set([...topicsManual, ...topicsRefined, ...topicsBase].map(t => String(t).trim()).filter(Boolean))
  ).slice(0, 12);

  return { year, company, topics };
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") return json(res, 405, { error: "Use POST" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const blobUrl = body.blobUrl;
  const filename = body.filename || "report.pdf";
  const pathname = body.pathname || "";
  const size = Number(body.size || 0);
  const tagsIn = body.tags || {};

  if (!blobUrl) return json(res, 400, { error: "Missing blobUrl" });

  const vsid = process.env.BASE_VECTOR_STORE_ID;
  if (!vsid) return json(res, 500, { error: "Missing BASE_VECTOR_STORE_ID" });

  try {
    // Download blob
    const resp = await fetch(blobUrl);
    if (!resp.ok) throw new Error("Could not fetch blob: " + resp.status);

    const buf = Buffer.from(await resp.arrayBuffer());

    // Hash for duplicates (exact byte match)
    const hash = crypto.createHash("sha256").update(buf).digest("hex");

    // If metadata exists, treat as duplicate and stop
    const metaKey = `trend-library/meta/${hash}.json`;
    const existing = await list({ prefix: metaKey });

    if ((existing.blobs || []).length) {
      return json(res, 200, { ok: true, duplicate: true, hash });
    }

    // Write temp file for OpenAI upload
    const tmpPath = path.join(os.tmpdir(), `ingest-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, buf);

    // Upload to OpenAI
    const createdFile = await openai.files.create({
      file: fs.createReadStream(tmpPath),
      purpose: "assistants"
    });

    // Attach to vector store
    const vectorStores = getVectorStores(openai);
    const vsFile = await vectorStores.files.create(vsid, { file_id: createdFile.id });

    fs.unlinkSync(tmpPath);

    // -----------------------
    // ✅ AUTO TAGGING
    // -----------------------
    const baseTags = {
      year: guessYear(filename),
      company: guessCompanyFromFilename(filename),
      topics: guessTopicsFromFilename(filename)
    };

    const manualTags = {
      year: String(tagsIn.year || "").trim(),
      company: String(tagsIn.company || "").trim(),
      topics: Array.isArray(tagsIn.topics) ? tagsIn.topics : []
    };

    // Optional refinement (filename-only)
    const refinedTags = await refineTagsWithModel({
      filename,
      year: baseTags.year,
      company: baseTags.company,
      topics: baseTags.topics
    });

    const finalTags = mergeTags({
      base: baseTags,
      refined: refinedTags,
      manual: manualTags
    });

    const addedAt = new Date().toISOString();

    // Persist metadata as a blob JSON (same as you already do)
    const meta = {
      hash,
      filename,
      pathname,
      blobUrl,
      size,
      addedAt,
      tags: finalTags,
      openaiFileId: createdFile.id,
      vsFileId: vsFile?.id || null
    };

    await put(metaKey, JSON.stringify(meta, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false
    });

    return json(res, 200, { ok: true, hash, duplicate: false, tags: finalTags });
  } catch (e) {
    return json(res, 500, { error: "INGEST FAILED", details: String(e?.message || e) });
  }
}
