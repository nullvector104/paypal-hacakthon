import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "";
for (const line of env.split("\n")) {
  if (line.startsWith("LLM_API_KEY=")) apiKey = line.split("=")[1].trim().replace(/["']/g, "");
}

const candidates = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-pro-latest",
  "gemini-2.5-pro",
  "gemma-4-31b-it",
];

async function testCandidate(m) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Hello" }] }] }),
    });
    const text = await res.text();
    console.log(`[${m}] Status: ${res.status} -> ${res.status === 200 ? "SUCCESS! " + text.slice(0, 80) : text.slice(0, 150)}`);
    return res.status === 200;
  } catch (e) {
    console.log(`[${m}] Error: ${e.message}`);
    return false;
  }
}

async function run() {
  for (const m of candidates) {
    const ok = await testCandidate(m);
    if (ok) {
      console.log(`\n🎉 WORKING MODEL FOUND: ${m}`);
    }
  }
}

run();
