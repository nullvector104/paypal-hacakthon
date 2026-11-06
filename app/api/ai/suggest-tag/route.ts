import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

interface CartItemInput {
  title: string;
  unitPrice?: number;
  quantity?: number;
}

export async function POST(req: NextRequest) {
  // 1. Enforce per-IP rate limiting
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, 20, 60 * 1000); // 20 requests/min

  if (!rateLimit.allowed) {
    console.warn(`[AI RATE LIMIT] IP ${clientIp} exceeded rate limit.`);
    return NextResponse.json(
      {
        tagId: null,
        reason: "Rate limit exceeded. Please wait a moment before requesting another tag suggestion.",
      },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const items: CartItemInput[] = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ tagId: null, reason: "Cart is empty" });
    }

    // 2. Fetch all real tags from the database
    const availableTags = await prisma.tag.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    if (availableTags.length === 0) {
      return NextResponse.json({ tagId: null, reason: "No expense tags defined" });
    }

    // 3. Format items and tags for the LLM
    const itemsDescription = items
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.title}${
            i.unitPrice !== undefined ? ` ($${i.unitPrice.toFixed(2)})` : ""
          }${i.quantity ? ` x${i.quantity}` : ""}`
      )
      .join("\n");

    const tagsList = availableTags
      .map((t) => `- ID: "${t.id}" | Name: "${t.name}"`)
      .join("\n");

    const prompt = `You are Orbit's smart personal expense classifier.
Analyze the following shopping cart items and select the single most appropriate expense category tag ID from the list of available tags.

Available Expense Tags:
${tagsList}

Cart Items:
${itemsDescription}

Rules:
1. You MUST choose a tag ID from the available tags list above.
2. Return a concise, 1-sentence reason explaining why this category matches the items.`;

    // 4. Request Structured JSON Output from Gemini via single LLM wrapper
    const responseSchema = {
      type: "OBJECT",
      properties: {
        tagId: {
          type: "STRING",
          description: "The exact tag ID chosen from the available tags list.",
        },
        reason: {
          type: "STRING",
          description: "Concise 1-sentence explanation for the suggested category.",
        },
      },
      required: ["tagId", "reason"],
    };

    const llmResult = await callLLM<{ tagId: string; reason: string }>(prompt, {
      systemPrompt:
        "You are an expert expense categorization engine. Always return rigid, valid JSON conforming to the response schema.",
      temperature: 0.1,
      responseSchema,
    });

    if (!llmResult.success) {
      console.warn(
        "[AI TAG SUGGESTION FALLBACK] LLM call failed:",
        llmResult.error
      );
      // Fallback: Return null so UI gracefully defaults to manual selection
      return NextResponse.json({ tagId: null, reason: null });
    }

    if (!llmResult.data) {
      console.warn(
        "[AI TAG SUGGESTION FALLBACK] LLM call returned empty data"
      );
      return NextResponse.json({ tagId: null, reason: null });
    }

    const { tagId, reason } = llmResult.data;

    // 5. Authoritatively validate that the suggested tagId exists in the database
    const matchedTag = availableTags.find((t) => t.id === tagId);
    if (!matchedTag) {
      console.warn(
        `[AI TAG SUGGESTION FALLBACK] Model returned tagId "${tagId}" which does not match any database tag.`
      );
      return NextResponse.json({ tagId: null, reason: null });
    }

    console.log(
      `[AI TAG SUGGESTION SUCCESS] Cart classified as "${matchedTag.name}" (${matchedTag.id}): ${reason}`
    );

    return NextResponse.json({
      tagId: matchedTag.id,
      tagName: matchedTag.name,
      reason,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/ai/suggest-tag:", error);
    // On any unexpected error, return null so UI never crashes and falls back cleanly
    return NextResponse.json({ tagId: null, reason: null });
  }
}
