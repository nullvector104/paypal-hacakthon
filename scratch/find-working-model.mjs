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

console.log(`Found ${models.length} candidate models. Testing each...`);

for (const m of models) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
    });
    if (res.status === 200) {
      console.log(`\n🎉🎉 FOUND AVAILABLE MODEL WITH QUOTA: "${m}"`);
      process.exit(0);
    } else {
      const err = await res.text();
      let msg = "";
      try {
        msg = JSON.parse(err).error?.message?.slice(0, 80) || err.slice(0, 80);
      } catch {
        msg = err.slice(0, 80);
      }
      console.log(`- ${m}: ${res.status} (${msg})`);
    }
  } catch (e) {
    console.log(`- ${m}: Fetch error (${e.message})`);
  }
}

console.log("No available model with quota found.");
