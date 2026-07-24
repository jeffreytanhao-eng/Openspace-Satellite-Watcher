import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/security';
import { invalidateCache } from '@/lib/cache';
import { syncDatabases } from '@/lib/db-sync';

// POST /api/sync - 手动触发 HK ↔ Neon 数据库同步（需要密码）
export async function POST(request: Request) {
  if (!verifyPassword(request)) {
    return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
  }

  const result = await syncDatabases();

  if (result.success) {
    // 清除 API 内存缓存，使前端立即获取同步后的数据
    invalidateCache();
  }

  return NextResponse.json({ success: result.success, data: result });
}
