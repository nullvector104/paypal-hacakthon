import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const defaultTags = [
    { name: "Food", monthlyLimit: 250.0 },
    { name: "Games", monthlyLimit: 100.0 },
    { name: "Electronics", monthlyLimit: 400.0 },
    { name: "Clothing", monthlyLimit: 150.0 },
    { name: "Other", monthlyLimit: 100.0 },
  ];

  for (const tag of defaultTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }

  // Seed default Demo Club & Members
  let club = await prisma.club.findFirst({
    where: { name: "Robotics Club" },
  });

  if (!club) {
    club = await prisma.club.create({
      data: {
        name: "Robotics Club",
        description: "Campus autonomous robotics treasury & competition budget",
        balance: 1450.0,
        members: {
          create: [
            {
              name: "Alex Vance (Treasurer)",
              email: "treasurer@roboticsclub.org",
              role: "TREASURER",
            },
            {
              name: "Jordan Lee (Member)",
              email: "jordan@roboticsclub.org",
              role: "MEMBER",
            },
            {
              name: "Sam Taylor (Member)",
              email: "sam@roboticsclub.org",
              role: "MEMBER",
            },
          ],
        },
      },
    });

    // Add club tags
    await prisma.tag.upsert({
      where: { name: "Club Hardware" },
      update: {},
      create: {
        name: "Club Hardware",
        monthlyLimit: 600.0,
        clubId: club.id,
      },
    });

    await prisma.tag.upsert({
      where: { name: "Competition Fees" },
      update: {},
      create: {
        name: "Competition Fees",
        monthlyLimit: 450.0,
        clubId: club.id,
      },
    });
  }

  console.log("Database seeded with default tags, club, and members successfully.");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
