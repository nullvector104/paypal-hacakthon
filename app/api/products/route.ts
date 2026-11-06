import { NextRequest, NextResponse } from "next/server";
import { searchChannel3Products } from "@/lib/channel3";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "essentials";
    const limit = parseInt(searchParams.get("limit") || "12", 10);

    const products = await searchChannel3Products(query, limit);

    return NextResponse.json({
      query,
      count: products.length,
      products,
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/products:", error);
    const message = error instanceof Error ? error.message : "Failed to search products";
    return NextResponse.json({ error: message, products: [] }, { status: 500 });
  }
}
