import { PrismaClient } from "@prisma/client";

// Standard singleton so Next's dev-mode module reloading doesn't open a new pool
// on every hot reload. Ported from Salon/Apparel verbatim.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
