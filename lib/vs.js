export function getVectorStores(openai) {
  return openai.vectorStores || openai.vector_stores;
}

export function getVectorStoreIdForSector(sector) {
  const base = process.env.BASE_VECTOR_STORE_ID;
  if (!sector) return base;

  const normalized = String(sector || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
  if (!normalized) return base;

  const envKey = `VECTOR_STORE_ID_${normalized}`;
  return process.env[envKey] || base;
}
