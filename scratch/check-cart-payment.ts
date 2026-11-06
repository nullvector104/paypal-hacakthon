import { prisma } from "../lib/prisma";

async function main() {
  const movements = await prisma.movement.findMany({
    where: { type: "CART_PAYMENT" },
    orderBy: { createdAt: "desc" },
    take: 2,
    include: { items: true, tag: true },
  });
  console.log("Recent Cart Payment Movements:");
  console.log(JSON.stringify(movements, null, 2));
}

main().finally(() => prisma.$disconnect());
