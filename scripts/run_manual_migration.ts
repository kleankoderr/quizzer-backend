import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const migrationPath =
    '/Users/abdullahismail/.gemini/antigravity/brain/f4d6568b-dc5a-420a-a7c7-754593a40365/user_split_migration.sql';
  console.log(`Reading migration from ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    console.log('Executing migration...');
    // Split by semicolon and execute individually
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      console.log(`Executing statement: ${statement.substring(0, 50)}...`);
      await prisma.$executeRawUnsafe(statement);
    }
    console.log(`Executed ${statements.length} statements successfully.`);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
