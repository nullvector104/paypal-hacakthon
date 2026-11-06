import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "";
for (const line of env.split("\n")) {
  if (line.startsWith("LLM_API_KEY=")) apiKey = line.split("=")[1].trim().replace(/["']/g, "");
}

async function test(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const start = Date.now();
  console.log(`Testing ${model}...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
    });
    const duration = Date.now() - start;
    const text = await res.text();
    console.log(`[${model}] (${duration}ms) Status: ${res.status}`);
    console.log(text.slice(0, 400));
    return res.status === 200;
  } catch (e) {
    console.log(`[${model}] Error:`, e.message);
    return false;
  }
}

async function main() {
  await test("gemini-flash-latest");
}
main();
