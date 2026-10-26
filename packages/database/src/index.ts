import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export const db = new PrismaClient({
  // Database-only transactions remain bounded, with room for a busy local Docker host.
  transactionOptions: { maxWait: 5000, timeout: 15000 },
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  }),
});
export * from '@prisma/client';
