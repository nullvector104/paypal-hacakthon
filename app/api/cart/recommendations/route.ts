import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchChannel3Products, SimplifiedProduct } from "@/lib/channel3";

// Map common product categories/keywords to smart pairing recommendation searches
const PAIRING_RULES: Array<{
  triggerKeywords: string[];
  searchTerms: string[];
  reason: string;
}> = [
  {
    triggerKeywords: ["yogurt", "yoghurt", "milk", "cereal", "granola", "dairy"],
    searchTerms: ["granola", "berries", "honey", "chia seeds"],
    reason: "Frequently paired with yogurt for a complete breakfast bowl",
  },
  {
    triggerKeywords: ["coffee", "espresso", "latte", "cappuccino", "brew"],
    searchTerms: ["creamer", "cookies", "biscuit", "sugar"],
    reason: "Popular companion for morning espresso and brewed coffee",
  },
  {
    triggerKeywords: ["chips", "tortilla", "nacho", "snack", "popcorn"],
    searchTerms: ["salsa", "dip", "soda", "sparkling water"],
    reason: "Classic party snack & refreshing beverage combination",
  },
  {
    triggerKeywords: ["arduino", "raspberry", "esp32", "microcontroller", "motor", "sensor"],
    searchTerms: ["jumper wires", "breadboard", "usb cable", "sensor kit"],
    reason: "Essential robotics prototyping accessories for your controller",
  },
  {
    triggerKeywords: ["cable", "charger", "adapter", "usb", "power bank"],
    searchTerms: ["cable organizer", "wall adapter", "screen protector"],
    reason: "Recommended tech essentials often bundled with chargers",
  },
  {
    triggerKeywords: ["tea", "green tea", "chai"],
    searchTerms: ["honey", "biscuits", "lemon"],
    reason: "Natural sweeteners and treats paired with brewed tea",
  },
];

export async function GET(req: NextRequest) {
  try {
    // 1. Fetch current cart items
    const cartItems = await prisma.cartItem.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (cartItems.length === 0) {
      return NextResponse.json({
        recommendations: [],
        reason: "Add items to your cart to see intelligent bundle pairings.",
      });
    }

    // 2. Identify the most relevant pairing rule based on cart items
    const cartText = cartItems.map((i) => i.title.toLowerCase()).join(" ");
    const cartProductIds = new Set(cartItems.map((i) => i.productId));

    let matchedRule = PAIRING_RULES.find((rule) =>
      rule.triggerKeywords.some((kw) => cartText.includes(kw))
    );

    // Fallback pairing rule if no specific keyword matched
    if (!matchedRule) {
      matchedRule = {
        triggerKeywords: [],
        searchTerms: ["essentials", "snacks", "drinks"],
        reason: "Top-rated companion essentials popular with club carts",
      };
    }

    // 3. Search products from Channel3 or fallback catalog for the recommendation terms
    const candidates: SimplifiedProduct[] = [];
    for (const term of matchedRule.searchTerms.slice(0, 2)) {
      try {
        const found = await searchChannel3Products(term, 4);
        for (const item of found) {
          if (!cartProductIds.has(item.id) && !candidates.some((c) => c.id === item.id)) {
            candidates.push(item);
          }
        }
      } catch (err) {
        console.warn(`Pairing search failed for term '${term}':`, err);
      }
      if (candidates.length >= 4) break;
    }

    return NextResponse.json({
      success: true,
      reason: matchedRule.reason,
      recommendations: candidates.slice(0, 4),
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/cart/recommendations:", error);
    return NextResponse.json(
      { recommendations: [], error: "Failed to load bundle pairings" },
      { status: 500 }
    );
  }
}
