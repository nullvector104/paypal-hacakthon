import { prisma } from "../lib/prisma";

async function main() {
  const tables: any = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  console.log("Current tables in DB:", tables.map((t: any) => t.table_name));

  for (const t of tables) {
    const tableName = t.table_name;
    const count: any = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
    console.log(`Table ${tableName}: ${count[0].cnt} rows`);
  }
}

main().finally(() => prisma.$disconnect());
