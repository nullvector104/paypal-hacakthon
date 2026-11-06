import { prisma } from "../lib/prisma";

async function main() {
  const movements = await prisma.movement.findMany();
  console.log("Existing movements:", JSON.stringify(movements, null, 2));
}

main().finally(() => prisma.$disconnect());
