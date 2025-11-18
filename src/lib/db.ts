import { PrismaClient } from '@prisma/client'

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Enable WAL mode for SQLite (better concurrency)
export async function enableWALMode() {
  if (process.env.DATABASE_URL?.includes('sqlite')) {
    await prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;')
    await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000;')
  }
}

// Initialize database
export async function initDatabase() {
  await enableWALMode()
  console.log('✓ Database initialized with WAL mode enabled')
}
