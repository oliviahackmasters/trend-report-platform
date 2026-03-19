import { list } from "@vercel/blob";

async function main() {
  const listRes = await list({ prefix: "trend-library/meta/" });
  console.log(JSON.stringify(listRes, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
