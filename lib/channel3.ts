/**
 * Server-only Channel3 Product Search Client
 * Endpoint: POST https://api.trychannel3.com/v1/search
 * Docs: docs.trychannel3.com
 */

export interface SimplifiedProduct {
  id: string;
  title: string;
  imageUrl: string;
  cheapestPrice: number;
  currency: string;
  offerUrl: string;
  domain?: string;
}

interface Channel3Offer {
  url: string;
  domain?: string;
  price?: {
    price?: number;
    currency?: string;
    compare_at_price?: number | null;
  };
  availability?: string;
}

interface Channel3Product {
  id: string;
  title: string;
  description?: string;
  images?: Array<string | { url: string }>;
  offers?: Channel3Offer[];
}

interface Channel3SearchResponse {
  products?: Channel3Product[];
  next_page_token?: string;
}

/**
 * Searches Channel3 products and returns simplified product cards with the cheapest offer.
 */
export async function searchChannel3Products(
  query: string,
  limit: number = 12
): Promise<SimplifiedProduct[]> {
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) {
    throw new Error("Missing CHANNEL3_API_KEY in server environment variables.");
  }

  const response = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: query.trim(),
      limit,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Channel3 search failed:", response.status, errorBody);
    throw new Error(`Channel3 search failed with status ${response.status}`);
  }

  const data = (await response.json()) as Channel3SearchResponse;
  const products = data.products || [];

  return products.map((p) => {
    // 1. Resolve image URL safely
    let imageUrl = "";
    if (p.images && p.images.length > 0) {
      const firstImg = p.images[0];
      if (typeof firstImg === "string") {
        imageUrl = firstImg;
      } else if (firstImg && typeof firstImg === "object" && "url" in firstImg) {
        imageUrl = firstImg.url;
      }
    }

    // 2. Find cheapest offer
    let cheapestOffer: Channel3Offer | null = null;
    let minPrice = Infinity;

    if (p.offers && p.offers.length > 0) {
      for (const offer of p.offers) {
        const priceVal = offer.price?.price;
        if (typeof priceVal === "number" && priceVal < minPrice) {
          minPrice = priceVal;
          cheapestOffer = offer;
        }
      }
    }

    return {
      id: p.id,
      title: p.title,
      imageUrl,
      cheapestPrice: cheapestOffer?.price?.price ?? 0,
      currency: cheapestOffer?.price?.currency || "USD",
      offerUrl: cheapestOffer?.url || "",
      domain: cheapestOffer?.domain || "",
    };
  });
}
