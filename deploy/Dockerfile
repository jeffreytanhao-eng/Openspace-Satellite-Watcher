# ============================================================
# TREA 卫星观测平台 — HK 服务器部署镜像
# 三阶段:deps(装依赖+prisma generate) → builder(next build→standalone) → runner(运行时)
# builder 与 runner 同为 node:20-alpine → Prisma 引擎 native target 匹配(linux-musl)
# ============================================================

# ---------- Stage 1: deps ----------
# 安装依赖;postinstall 会跑 prisma generate(仅解析 schema,不连库)
# DATABASE_URL 用占位值即可(prisma generate 不连接数据库)
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 先拷贝 package.json + lockfile + scripts + prisma(postinstall 需要 setup-env.cjs 与 schema.prisma)
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY prisma ./prisma

# 占位 DATABASE_URL(避免 prisma generate 报缺 URL)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npm ci

# ---------- Stage 2: builder ----------
# next build → 产出 .next/standalone
FROM deps AS builder
WORKDIR /app
COPY . .
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
# package.json 的 build 脚本 = node scripts/setup-env.cjs = next build
RUN npm run build

# ---------- Stage 3: runner ----------
# 最小运行时镜像
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 非 root 用户运行
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone 服务端(含 Next tracer 追踪出的最小 node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# standalone 不含静态资源,需手动拷贝
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma generated client(引擎 .node 二进制不被 Next tracer 追踪,必须显式拷贝)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
