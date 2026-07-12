import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/security';

// POST /api/admin/verify - verify admin password (lightweight check)
export async function POST(request: Request) {
  if (!verifyPassword(request)) {
    return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
  }
  return NextResponse.json({ success: true });
}
