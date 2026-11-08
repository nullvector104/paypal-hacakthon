import { prisma } from "../lib/prisma";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Restoring original database records from backup-data.json...");
  const backupFile = path.join(__dirname, "backup-data.json");
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found at ${backupFile}`);
  }

  const raw = fs.readFileSync(backupFile, "utf8");
  const clubs = JSON.parse(raw);

  for (const c of clubs) {
    await prisma.club.update({
      where: { id: c.id },
      data: {
        name: c.name,
        description: c.description,
      },
    });

    for (const m of c.members) {
      await prisma.clubMember.update({
        where: { id: m.id },
        data: {
          name: m.name,
        },
      });
    }

    if (c.duesCycles) {
      for (const d of c.duesCycles) {
        await prisma.duesCycle.update({
          where: { id: d.id },
          data: {
            title: d.title,
          },
        });
      }
    }

    if (c.events) {
      for (const ev of c.events) {
        await prisma.eventFundraiser.update({
          where: { id: ev.id },
          data: {
            title: ev.title,
            description: ev.description,
          },
        });
      }
    }
  }

  console.log("Original records restored successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

