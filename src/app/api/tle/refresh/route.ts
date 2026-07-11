import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Source } from '@prisma/client';
import { verifyPassword } from '@/lib/security';

const CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';
const CONCURRENCY = 5;

interface ParsedTLE {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
  epoch: string;
}

function parseEpoch(line1: string): string {
  const yearStr = line1.slice(18, 20).trim();
  const dayStr = line1.slice(20, 32).trim();
  const fullYear = parseInt(yearStr, 10) >= 57 ? 1900 + parseInt(yearStr, 10) : 2000 + parseInt(yearStr, 10);
  const dayOfYear = parseFloat(dayStr);
  const start = new Date(Date.UTC(fullYear, 0, 1));
  return new Date(start.getTime() + (dayOfYear - 1) * 86400000).toISOString();
}

function parseSingleTLE(tleText: string, expectedId: number): ParsedTLE | null {
  const lines = tleText.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  let name = '';
  let line1 = '';
  let line2 = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && i + 1 < lines.length && lines[i + 1].startsWith('2 ')) {
      name = i > 0 ? lines[i - 1] : `SAT-${expectedId}`;
      line1 = lines[i];
      line2 = lines[i + 1];
      break;
    }
  }
  if (!line1 || !line2) return null;
  const noradId = parseInt(line1.slice(2, 7).trim());
  if (noradId !== expectedId) return null;
  return { noradId, name, line1, line2, epoch: parseEpoch(line1) };
}

async function fetchOne(noradId: number): Promise<{ ok: boolean; data?: ParsedTLE; error?: string }> {
  const url = `${CELESTRAK_BASE_URL}?CATNR=${noradId}&FORMAT=tle`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/plain,*/*',
        'Referer': 'https://celestrak.org/',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.includes('Invalid query') || text.includes('No GP data')) {
      return { ok: false, error: '未找到卫星数据' };
    }
    const parsed = parseSingleTLE(text, noradId);
    if (!parsed) return { ok: false, error: 'TLE 解析失败' };
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: '请求超时或网络错误' };
  }
}

export async function POST(request: NextRequest) {
  // 验证密码
  if (!verifyPassword(request)) {
    return NextResponse.json({ success: false, error: '需要密码验证' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const noradIds: number[] = body.noradIds;
    if (!Array.isArray(noradIds) || noradIds.length === 0) {
      return NextResponse.json({ success: false, error: '请提供要刷新的卫星 NORAD ID 列表' }, { status: 400 });
    }
    if (noradIds.length > 200) {
      return NextResponse.json({ success: false, error: '单次最多刷新 200 颗卫星' }, { status: 400 });
    }

    const updated: ParsedTLE[] = [];
    const failed: { noradId: number; reason: string }[] = [];

    for (let i = 0; i < noradIds.length; i += CONCURRENCY) {
      const chunk = noradIds.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(id => fetchOne(id)));
      results.forEach((res, idx) => {
        if (res.ok && res.data) updated.push(res.data);
        else failed.push({ noradId: chunk[idx], reason: res.error || '未知错误' });
      });
    }

    // 写入数据库
    let savedCount = 0;
    try {
      for (const tle of updated) {
        // 查找对应的卫星
        const spaceObject = await prisma.spaceObject.findUnique({ where: { noradId: tle.noradId } });
        if (spaceObject) {
          const epoch = new Date(tle.epoch);
          await prisma.tLEData.upsert({
            where: {
              spaceObjectId_epoch: { spaceObjectId: spaceObject.id, epoch },
            },
            update: {
              name: tle.name,
              line1: tle.line1,
              line2: tle.line2,
              source: Source.CELESTRAK_API,
            },
            create: {
              spaceObjectId: spaceObject.id,
              name: tle.name,
              line1: tle.line1,
              line2: tle.line2,
              epoch,
              source: Source.CELESTRAK_API,
            },
          });
          savedCount++;
        }
      }
    } catch (dbError) {
      console.error('Save TLE to DB error:', dbError);
      // DB写入失败不影响前端返回数据
    }

    return NextResponse.json({
      success: true,
      data: {
        updated,
        failed,
        saved: savedCount,
        total: noradIds.length,
        updatedCount: updated.length,
        failedCount: failed.length,
      },
    });
  } catch (error) {
    console.error('TLE refresh error:', error);
    return NextResponse.json({ success: false, error: 'TLE 数据刷新失败，请稍后重试' }, { status: 500 });
  }
}
