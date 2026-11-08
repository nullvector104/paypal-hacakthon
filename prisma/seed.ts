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

  // Seed default Demo Organization & Members
  let club = await prisma.club.findFirst({
    where: { name: { in: ["Apex Robotics Dynamics Corp", "Robotics Club"] } },
  });

  if (!club) {
    club = await prisma.club.create({
      data: {
        name: "Apex Robotics Dynamics Corp",
        description: "Autonomous robotics engineering, global component procurement & R&D treasury vault",
        balance: 1450.0,
        members: {
          create: [
            {
              name: "Alex Vance (Finance Controller)",
              email: "treasurer@roboticsclub.org",
              role: "TREASURER",
            },
            {
              name: "Jordan Lee (Lead Systems Engineer)",
              email: "jordan@roboticsclub.org",
              role: "MEMBER",
            },
            {
              name: "Sam Taylor (Hardware Operations Lead)",
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
