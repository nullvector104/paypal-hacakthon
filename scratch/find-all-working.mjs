import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "";
for (const line of env.split("\n")) {
  if (line.startsWith("LLM_API_KEY=")) apiKey = line.split("=")[1].trim().replace(/["']/g, "");
}

const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
const listRes = await fetch(listUrl);
const listData = await listRes.json();
const models = (listData.models || [])
  .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
  .map((m) => m.name.replace("models/", ""));

console.log(`Testing all ${models.length} models...`);

const workingModels = [];

for (const m of models) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
    });
    if (res.status === 200) {
      console.log(`✓ 200 OK: ${m}`);
      workingModels.push(m);
    } else {
      // console.log(`✗ ${res.status}: ${m}`);
    }
  } catch (e) {
    // console.log(`! error: ${m}`);
  }
}

console.log("\nALL WORKING MODELS:");
console.log(workingModels);
