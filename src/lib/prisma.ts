import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

// 运行时环境变量 fallback
// setup-env.cjs 在构建时将 POSTGRES_PRISMA_URL 映射为 DATABASE_URL，
// 但运行时的 Serverless 函数中需要直接读取 Vercel 环境变量。
// Vercel 上可能只设置了 POSTGRES_PRISMA_URL 而没有 DATABASE_URL。
function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL
  if (!url) {
    throw new Error(
      '数据库连接 URL 未配置。请在 Vercel Dashboard → Settings → Environment Variables 中设置 DATABASE_URL 或 POSTGRES_PRISMA_URL'
    )
  }
  return url
}

export const prisma = globalThis.prisma || new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl(),
    },
  },
})

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}
