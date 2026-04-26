import { setCors } from "../lib/cors.js";

export default function handler(req, res) {
  setCors(req, res);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
}
