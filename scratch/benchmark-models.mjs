import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "";
for (const line of env.split("\n")) {
  if (line.startsWith("LLM_API_KEY=")) apiKey = line.split("=")[1].trim().replace(/["']/g, "");
}

async function testModel(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Respond in 3 words." }] }] }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const duration = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log(`✅ [${model}] ${duration}ms: ${text.trim().replace(/\n/g, ' ')}`);
      return { model, duration, ok: true };
    } else {
      console.log(`❌ [${model}] ${duration}ms Status ${res.status}: ${data.error?.message?.slice(0, 80)}`);
      return { model, duration, ok: false };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const duration = Date.now() - start;
    console.log(`⚠️ [${model}] ${duration}ms: ${err.message}`);
    return { model, duration, ok: false };
  }
}

async function main() {
  const testList = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
  ];
  for (const m of testList) {
    await testModel(m);
  }
}

main();
