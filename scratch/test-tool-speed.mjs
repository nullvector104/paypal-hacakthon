import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "";
for (const line of env.split("\n")) {
  if (line.startsWith("LLM_API_KEY=")) apiKey = line.split("=")[1].trim().replace(/["']/g, "");
}

async function testToolCalling(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const start = Date.now();
  
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: "How much did I spend on Food?" }]
      }
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: "get_tag_summary",
            description: "Gets spending and limit for a tag",
            parameters: {
              type: "OBJECT",
              properties: {
                tagName: { type: "STRING", description: "Name of the tag" }
              },
              required: ["tagName"]
            }
          }
        ]
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const duration = Date.now() - start;
    const data = await res.json();
    console.log(`[${model}] Tool call turn 1: ${duration}ms, Status: ${res.status}`);
    const call = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (call) {
      console.log(`✅ Model invoked tool: ${call.name} with args:`, call.args);
    } else {
      console.log("No functionCall part:", JSON.stringify(data.candidates?.[0]?.content?.parts));
    }
  } catch (err) {
    console.log(`Error in [${model}]:`, err.message);
  }
}

async function main() {
  await testToolCalling("gemini-3.1-flash-lite");
  await testToolCalling("gemini-3.5-flash");
}

main();

