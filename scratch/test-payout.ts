import { createPayPalPayout } from "../lib/paypal";

async function main() {
  try {
    const res = await createPayPalPayout({
      receiverEmail: "sb-k911j123456@personal.example.com",
      amountValue: "5.00",
      currencyCode: "USD",
      note: "Test Payout",
    });
    console.log("Payout Success:", res);
  } catch (err: any) {
    console.error("Payout Error:", err.message);
  }
}

main();
