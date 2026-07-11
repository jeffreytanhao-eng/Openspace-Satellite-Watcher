import crypto from 'crypto';

/**
 * 时序安全的密码比较，防止时序侧信道攻击
 */
export function timingSafeEqualHash(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  // 长度不同时返回false，但仍用相同时间比较（避免泄露长度信息）
  if (bufA.length !== bufB.length) {
    // 做一个dummy比较消耗相同时间
    const dummy = Buffer.alloc(bufA.length);
    try { crypto.timingSafeEqual(bufA, dummy); } catch {}
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 验证密码（从请求头中获取）
 */
export function verifyPassword(request: { headers: Headers | { get: (name: string) => string | null } }): boolean {
  const headerObj = 'headers' in request ? request.headers : request;
  const provided =
    (typeof headerObj.get === 'function' ? headerObj.get('x-admin-password') : null) ||
    (typeof headerObj.get === 'function' ? headerObj.get('X-Admin-Password') : null);
  const expected = process.env.ADMIN_PASSWORD;
  if (!provided || !expected) return false;
  return timingSafeEqualHash(provided, expected);
}
