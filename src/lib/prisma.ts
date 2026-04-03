// Prisma client setup
// Run `npx prisma generate` after setting up DATABASE_URL to enable database persistence.
// Until then, the app uses the in-memory session store.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;

export async function initPrisma(): Promise<void> {
  if (prisma) return;
  try {
    // @ts-expect-error - Dynamic import of generated module that may not exist yet
    const mod = await import('../generated/prisma');
    const globalForPrisma = globalThis as unknown as { prisma: unknown };
    prisma = globalForPrisma.prisma || new mod.PrismaClient();
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
  } catch {
    // Prisma client not generated yet
  }
}

export { prisma };
