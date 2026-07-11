import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqualHash } from '@/lib/security';

// ── 内存级 IP 限流（单机部署，无需 Redis） ──
interface RateLimitEntry { count: number; resetAt: number; }
const ipBuckets = new Map<string, RateLimitEntry>();

// 定期清理过期条目（每5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipBuckets) {
    if (entry.resetAt < now) ipBuckets.delete(ip);
  }
}, 5 * 60 * 1000);

type RateLimit = { windowMs: number; max: number; };
const RATE_LIMITS: Record<string, RateLimit> = {
  // 静态资源：宽松（Next.js 自行处理缓存）
  '/_next/': { windowMs: 60_000, max: 200 },
  '/static/': { windowMs: 60_000, max: 200 },
  '/models/': { windowMs: 60_000, max: 60 },
  '/cesium/': { windowMs: 60_000, max: 60 },
  '/audio/': { windowMs: 60_000, max: 30 },
  // 读 API：适中
  '/api/space-objects': { windowMs: 60_000, max: 30 },
  '/api/tags': { windowMs: 60_000, max: 30 },
  '/api/nasa-image/proxy': { windowMs: 60_000, max: 20 },
  '/api/nasa-media': { windowMs: 60_000, max: 20 },
  // 外部API代理/CPU密集：严格
  '/api/tle/import': { windowMs: 60_000, max: 10 },
  '/api/space-objects/search': { windowMs: 60_000, max: 15 },
  // 需要密码的敏感操作：非常严格
  '/api/tle/refresh': { windowMs: 60_000, max: 5 },
  '/api/admin': { windowMs: 60_000, max: 10 },
  // 页面 SSR：适中
  '/': { windowMs: 60_000, max: 30 },
};

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return request.ip || 'unknown';
}

function checkRateLimit(ip: string, path: string): { limited: boolean; retryAfter?: number } {
  // 精确匹配优先，前缀匹配次之
  let limit: RateLimit | undefined;
  for (const [prefix, rl] of Object.entries(RATE_LIMITS)) {
    if (path === prefix || path.startsWith(prefix)) { limit = rl; break; }
  }
  if (!limit) return { limited: false };

  const key = `${ip}:${limit.windowMs}`;
  const now = Date.now();
  const entry = ipBuckets.get(key);

  if (!entry || entry.resetAt < now) {
    ipBuckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { limited: false };
  }

  entry.count++;
  if (entry.count > limit.max) {
    return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { limited: false };
}

// 全局并发连接限制（简单计数器）
let concurrentRequests = 0;
const MAX_CONCURRENT = 50;

export function middleware(request: NextRequest) {
  const ip = getClientIp(request);
  const { pathname } = request.nextUrl;

  // 并发限制
  if (concurrentRequests >= MAX_CONCURRENT && pathname.startsWith('/api/')) {
    return new NextResponse(
      JSON.stringify({ success: false, error: '服务器繁忙，请稍后再试' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '10' } }
    );
  }

  // API 请求增加并发计数
  const isApi = pathname.startsWith('/api/');
  if (isApi) concurrentRequests++;

  // 限流检查
  const rl = checkRateLimit(ip, pathname);
  if (rl.limited) {
    if (isApi) concurrentRequests--;
    return new NextResponse(
      JSON.stringify({ success: false, error: '请求过于频繁，请稍后再试' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rl.retryAfter || 60),
        },
      }
    );
  }

  // 添加安全响应头
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-RateLimit-Limit', '60');
  // 隐藏服务器信息
  response.headers.delete('X-Powered-By');

  // 请求完成后减少并发计数
  if (isApi) {
    const finish = () => {
      concurrentRequests = Math.max(0, concurrentRequests - 1);
    };
    // 通过 setTimeout 让并发计数在响应发送后递减
    setTimeout(finish, 100);
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
