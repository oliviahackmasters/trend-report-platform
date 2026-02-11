import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const vs = await (client.vectorStores?.create
  ? client.vectorStores.create({ name: "TREND_LIBRARY" })
  : client.vector_stores.create({ name: "TREND_LIBRARY" }));

console.log("BASE_VECTOR_STORE_ID =", vs.id);
