import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "";
for (const line of env.split("\n")) {
  if (line.startsWith("LLM_API_KEY=")) apiKey = line.split("=")[1].trim().replace(/["']/g, "");
}

async function test(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    console.log(`[${model}] Status:`, res.status, res.statusText);
    const text = await res.text();
    console.log(`[${model}] Body:`, text.slice(0, 300));
  } catch (e) {
    clearTimeout(timeout);
    console.log(`[${model}] Error:`, e.name, e.message);
  }
}

async function main() {
  await test("gemini-3.8-flash");
  await test("gemini-3.7-flash");
}
main();
