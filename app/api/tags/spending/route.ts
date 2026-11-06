import { NextRequest, NextResponse } from "next/server";
import { getTagSpendingSummaries } from "@/lib/spending";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clubIdParam = searchParams.get("clubId");
    const clubId = clubIdParam === "all" ? undefined : clubIdParam || null;

    const tags = await getTagSpendingSummaries(clubId);
    return NextResponse.json({ tags });
  } catch (error: unknown) {
    console.error("Error in GET /api/tags/spending:", error);
    const message = error instanceof Error ? error.message : "Calculation error";
    return NextResponse.json({ error: message, tags: [] }, { status: 500 });
  }
}
