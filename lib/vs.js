export function getVectorStores(openai) {
  return openai.vectorStores || openai.vector_stores;
}
