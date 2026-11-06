/**
 * scripts/llm-smoke.ts
 *
 * Smoke test for Gemini LLM wrapper:
 * 1. Provides ONE read-only tool: get_tag_summary (queries real data from Neon PostgreSQL via Prisma).
 * 2. Prompts the model: "how close am I to my Food limit?".
 * 3. Prints:
 *    - The tool call (name and arguments)
 *    - The tool result (real DB data)
 *    - The final answer synthesized by Gemini.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/llm-smoke.ts
 */

import { prisma } from "../lib/prisma";
import { callLLM, ToolDefinition } from "../lib/llm";
import { getCurrentMonthRange } from "../lib/spending";

async function main() {
  console.log("==================================================");
  console.log("   ORBIT AI SMOKE TEST: Tool Calling with Gemini   ");
  console.log("==================================================\n");

  // Define ONE tool: get_tag_summary
  const getTagSummaryTool: ToolDefinition = {
    name: "get_tag_summary",
    description: "Fetches current month spending, limit, and remaining budget for a specific expense category tag.",
    parameters: {
      type: "OBJECT",
      properties: {
        tagName: {
          type: "STRING",
          description: "The name of the tag/category to inspect (e.g. 'Food', 'Clothing', 'Games').",
        },
      },
      required: ["tagName"],
    },
    execute: async (args: { tagName: string }) => {
      const { start, end } = getCurrentMonthRange();

      // Query real tag from database
      const tag = await prisma.tag.findFirst({
        where: {
          name: {
            equals: args.tagName.trim(),
            mode: "insensitive",
          },
        },
      });

      if (!tag) {
        return {
          error: `Category tag "${args.tagName}" not found in database.`,
        };
      }

      // Query real completed outgoing movements in current calendar month
      const movements = await prisma.movement.findMany({
        where: {
          tagId: tag.id,
          status: "COMPLETED",
          direction: "OUTGOING",
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        select: { amount: true },
      });

      const totalSpent = movements.reduce((sum, m) => sum + m.amount, 0);
      const remaining = Math.max(0, tag.monthlyLimit - totalSpent);
      const percentageUsed = tag.monthlyLimit > 0 ? (totalSpent / tag.monthlyLimit) * 100 : 0;

      return {
        tagId: tag.id,
        tagName: tag.name,
        monthlyLimit: tag.monthlyLimit,
        currentSpent: parseFloat(totalSpent.toFixed(2)),
        remainingBudget: parseFloat(remaining.toFixed(2)),
        percentageUsed: parseFloat(percentageUsed.toFixed(1)),
        isOverLimit: totalSpent >= tag.monthlyLimit,
        isWarning80: percentageUsed >= 80,
      };
    },
  };

  const userPrompt = "how close am I to my Food limit?";
  console.log(`User Prompt: "${userPrompt}"\n`);
  console.log("Calling Gemini LLM with get_tag_summary tool...\n");

  const startTime = Date.now();
  const result = await callLLM(userPrompt, {
    systemPrompt:
      "You are Orbit's smart financial and treasury assistant. Use the provided tool to look up real user budget data before answering.",
    tools: [getTagSummaryTool],
    maxIterations: 4,
  });
  const duration = Date.now() - startTime;

  if (!result.success) {
    console.error("❌ LLM Call Failed with typed error:");
    console.error(JSON.stringify(result.error, null, 2));
    process.exit(1);
  }

  console.log("--------------------------------------------------");
  console.log("1. TOOL CALL(S) LOGGED:");
  if (result.toolCallsLogged.length === 0) {
    console.log("   (No tools called)");
  } else {
    for (const log of result.toolCallsLogged) {
      console.log(`   Tool Name: ${log.tool}`);
      console.log(`   Arguments: ${JSON.stringify(log.args)}`);
      console.log(`   Duration : ${log.durationMs}ms`);
      console.log("\n2. TOOL EXECUTION RESULT (Real Database):");
      console.log(`   ${JSON.stringify(log.result, null, 2)}\n`);
    }
  }

  console.log("--------------------------------------------------");
  console.log("3. FINAL ANSWER SYNTHESIZED BY GEMINI:");
  console.log(result.text.trim());
  console.log("--------------------------------------------------");
  console.log(`Total Roundtrip Time: ${duration}ms\n`);
}

main()
  .catch((err) => {
    console.error("Fatal error in smoke test:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
