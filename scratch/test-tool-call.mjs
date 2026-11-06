import { callLLM } from "../lib/llm.ts";

async function test(modelName) {
  process.env.LLM_MODEL = modelName;
  console.log(`Testing model: ${modelName}`);

  const tool = {
    name: "get_test_info",
    description: "Returns dummy info",
    parameters: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING", description: "Category name" },
      },
      required: ["category"],
    },
    execute: (args) => ({ status: "OK", receivedCategory: args.category }),
  };

  const res = await callLLM("What is the test info for Food?", {
    tools: [tool],
    maxIterations: 2,
  });

  console.log("Success:", res.success);
  if (res.success) {
    console.log("Response text:", res.text);
    console.log("Tool calls logged:", res.toolCallsLogged);
  } else {
    console.log("Error:", res.error);
  }
  return res.success;
}

async function main() {
  const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-flash-lite-latest"];
  for (const m of models) {
    const ok = await test(m);
    if (ok) {
      console.log(`\n🎉 Best working model with tool calling: ${m}`);
      break;
    }
  }
}

main();
