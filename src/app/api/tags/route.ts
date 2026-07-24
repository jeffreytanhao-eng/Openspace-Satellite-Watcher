import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mockTags } from '@/lib/mock/satellites';
import { getCached, setCache } from '@/lib/cache';

const CACHE_KEY = 'tags';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// GET：从数据库读取所有标签，DB不可用时返回默认标签
export async function GET() {
  const cached = getCached<ReturnType<typeof NextResponse.json>>(CACHE_KEY, CACHE_TTL);
  if (cached) return cached;

  try {
    const tags = await prisma.userTag.findMany({
      include: { objects: true },
      orderBy: { name: 'asc' },
    });
    const data = tags.map(t => ({
      ...t,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : (t.createdAt ?? null),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : (t.updatedAt ?? null),
    }));
    const response = NextResponse.json({ success: true, data });
    setCache(CACHE_KEY, response);
    return response;
  } catch (error) {
    console.warn('DB unavailable, returning mock tags:', (error as Error).message);
    return NextResponse.json({ success: true, data: mockTags.map((t, i) => ({ id: `tag-${i+1}`, ...t, objects: [] })) });
  }
}

// 写操作暂不开放
export async function POST() {
  return NextResponse.json({ success: false, error: '标签写入功能将在下个版本开放' }, { status: 403 });
}
export async function PUT() {
  return NextResponse.json({ success: false, error: '标签写入功能将在下个版本开放' }, { status: 403 });
}
export async function PATCH() {
  return NextResponse.json({ success: false, error: '标签写入功能将在下个版本开放' }, { status: 403 });
}
export async function DELETE() {
  return NextResponse.json({ success: false, error: '标签写入功能将在下个版本开放' }, { status: 403 });
}
