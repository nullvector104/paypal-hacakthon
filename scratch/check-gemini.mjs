import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "";
for (const line of env.split("\n")) {
  if (line.startsWith("LLM_API_KEY=")) apiKey = line.split("=")[1].trim().replace(/["']/g, "");
}

async function run() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log("All Models:");
  for (const m of data.models || []) {
    if (m.supportedGenerationMethods?.includes("generateContent")) {
      console.log(`- ${m.name}`);
    }
  }

  // Let's test the 429 message specifically on gemini-3.5-flash to read the exact quota error
  const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const res35 = await fetch(testUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
  });
  console.log("\nFull 429 response on gemini-3.5-flash:");
  console.log(await res35.text());
}

run();
