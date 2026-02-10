import crypto from "crypto";

const TTL_MS = Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000); // 24h default

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

export function makeSessionToken(payload) {
  const secret = process.env.SESSION_SIGNING_SECRET || process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Missing SESSION_SIGNING_SECRET (or OPENAI_API_KEY).");

  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function readSessionToken(token) {
  const secret = process.env.SESSION_SIGNING_SECRET || process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Missing SESSION_SIGNING_SECRET (or OPENAI_API_KEY).");
  if (!token || typeof token !== "string" || !token.includes(".")) return null;

  const [body, sig] = token.split(".");
  const expected = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  if (sig !== expected) return null;

  const payload = JSON.parse(b64urlDecode(body));
  return payload;
}

export function isExpired(createdAtMs) {
  return Date.now() - createdAtMs > TTL_MS;
}

export function getTtlMs() {
  return TTL_MS;
}
