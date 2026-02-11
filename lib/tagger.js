// lib/tagger.js
import crypto from "crypto";

/** Basic keyword map – tweak freely */
const TOPIC_KEYWORDS = [
  ["health", "Health"],
  ["retail", "Retail"],
  ["consumer", "Consumer"],
  ["goods", "Consumer Goods"],
  ["luxury", "Luxury"],
  ["fashion", "Fashion"],
  ["beauty", "Beauty"],
  ["finance", "Finance"],
  ["bank", "Banking"],
  ["ai", "AI"],
  ["genai", "AI"],
  ["technology", "Technology"],
  ["sustain", "Sustainability"],
  ["climate", "Climate"],
  ["energy", "Energy"],
  ["media", "Media"],
  ["culture", "Culture"],
];

export function hashForDedup(input) {
  return crypto.createHash("sha256").update(String(input || "")).digest("hex").slice(0, 16);
}

export function inferTagsFromFilename(filename = "") {
  const base = filename.replace(/\.[^.]+$/, "");
  const lower = base.toLowerCase();

  // Year: first 19xx/20xx we see
  const yearMatch = base.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : "";

  // “Company”: first token before "_" or "-" if it looks like a brand/source
  // e.g. "EIU Consumer Goods..." => EIU
  const firstToken = base.split(/[_-]/)[0].trim();
  const company = /^[A-Za-z]{2,12}$/.test(firstToken) ? firstToken.toUpperCase() : "";

  // Topics from keywords
  const topics = [];
  for (const [needle, label] of TOPIC_KEYWORDS) {
    if (lower.includes(needle)) topics.push(label);
  }

  // Make topics unique
  const uniqTopics = [...new Set(topics)];

  return { year, company, topics: uniqTopics };
}
