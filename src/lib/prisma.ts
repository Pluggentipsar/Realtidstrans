// Prisma client setup
// Run `npx prisma generate` after setting up DATABASE_URL to enable database persistence.
// Until then, the app uses the in-memory session store.

let prisma: unknown = null;

try {
  // Dynamic import - will fail gracefully if prisma client hasn't been generated
  const { PrismaClient } = require('@/generated/prisma');
  const globalForPrisma = globalThis as unknown as { prisma: unknown };
  prisma = globalForPrisma.prisma || new PrismaClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
} catch {
  // Prisma client not generated yet — using in-memory store
}

export { prisma };
