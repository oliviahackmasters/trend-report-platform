import Busboy from "busboy";
import fs from "fs";
import os from "os";
import path from "path";
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

  const bb = Busboy({ headers: req.headers, limits: { files: 5, fileSize: 25 * 1024 * 1024 } });

  const uploaded = [];
  const tasks = [];

  bb.on("file", (fieldname, file, info) => {
    const filename = info?.filename || "";
    const lower = filename.toLowerCase();

    if (!lower.endsWith(".pdf")) {
      file.resume();
      return;
    }

    const tmpPath = path.join(os.tmpdir(), `${Date.now()}-${filename.replace(/[^\w.\-]/g, "_")}`);
    const writeStream = fs.createWriteStream(tmpPath);
    file.pipe(writeStream);

    const task = new Promise((resolve, reject) => {
      writeStream.on("finish", async () => {
        try {
          const createdFile = await openai.files.create({
            file: fs.createReadStream(tmpPath),
            purpose: "assistants"
          });

          await openai.vector_stores.files.create(session.vsid, { file_id: createdFile.id });

          uploaded.push({ fileId: createdFile.id, filename });
          fs.unlink(tmpPath, () => {});
          resolve();
        } catch (err) {
          fs.unlink(tmpPath, () => {});
          reject(err);
        }
      });

      writeStream.on("error", reject);
    });

    tasks.push(task);
  });

  bb.on("finish", async () => {
    try {
      await Promise.all(tasks);
      return json(res, 200, { uploaded });
    } catch (err) {
      return json(res, 500, { error: "Upload failed", details: String(err?.message || err) });
    }
  });

  req.pipe(bb);
}
