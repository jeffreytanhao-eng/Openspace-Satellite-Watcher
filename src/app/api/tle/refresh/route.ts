import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Source } from '@prisma/client';

const CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';
const CONCURRENCY = 5;

interface ParsedTLE {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
  epoch: Date;
}

function parseEpoch(line1: string): Date {
  const yearStr = line1.slice(18, 20).trim();
  const dayStr = line1.slice(20, 32).trim();
  const fullYear = parseInt(yearStr, 10) >= 57 ? 1900 + parseInt(yearStr, 10) : 2000 + parseInt(yearStr, 10);
  const dayOfYear = parseFloat(dayStr);
  const start = new Date(Date.UTC(fullYear, 0, 1));
  const ms = (dayOfYear - 1) * 86400000;
  return new Date(start.getTime() + ms);
}

function parseTLEText(tleText: string): ParsedTLE[] {
  const lines = tleText.trim().split('\n');
  const results: ParsedTLE[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!line.startsWith('1') && !line.startsWith('2')) {
      const name = line;
      const line1 = lines[i + 1]?.trim();
      const line2 = lines[i + 2]?.trim();

      if (line1?.startsWith('1') && line2?.startsWith('2')) {
        const noradId = parseInt(line1.slice(2, 7).trim());
        if (!isNaN(noradId)) {
          const epoch = parseEpoch(line1);
          results.push({ noradId, name, line1, line2, epoch });
        }
        i += 2;
      }
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const noradIds: number[] = body.noradIds;

    if (!Array.isArray(noradIds) || noradIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供要刷新的卫星 NORAD ID 列表' },
        { status: 400 }
      );
    }

    const updated: ParsedTLE[] = [];
    const failed: { noradId: number; reason: string }[] = [];

    // Celestrak CATNR 不支持逗号分隔，逐个并发请求
    const fetchOne = async (noradId: number): Promise<void> => {
      const url = `${CELESTRAK_BASE_URL}?CATNR=${noradId}&FORMAT=tle`;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/plain,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://celestrak.org/',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          failed.push({ noradId, reason: `Celestrak 返回 ${response.status}` });
          return;
        }

        const tleText = await response.text();
        if (tleText.includes('Invalid query') || tleText.includes('No GP data')) {
          failed.push({ noradId, reason: 'Celestrak 未找到该卫星数据' });
          return;
        }

        const parsed = parseTLEText(tleText);
        const found = parsed.find(p => p.noradId === noradId);
        if (found) {
          updated.push(found);
        } else {
          failed.push({ noradId, reason: 'TLE 数据解析失败' });
        }
      } catch {
        failed.push({ noradId, reason: '请求超时或网络错误' });
      }
    };

    // 并发控制：每次 CONCURRENCY 个请求
    for (let i = 0; i < noradIds.length; i += CONCURRENCY) {
      const chunk = noradIds.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(id => fetchOne(id)));
    }

    // 写回数据库
    let dbUpdated = 0;
    for (const tle of updated) {
      const spaceObject = await prisma.spaceObject.findUnique({
        where: { noradId: tle.noradId },
        select: { id: true },
      });
      if (!spaceObject) continue;

      // 更新卫星名称（可能有变更）
      await prisma.spaceObject.update({
        where: { noradId: tle.noradId },
        data: { name: tle.name },
      });

      // 插入或更新 TLE 数据（upsert 按 spaceObjectId+epoch 唯一键）
      await prisma.tLEData.upsert({
        where: {
          spaceObjectId_epoch: {
            spaceObjectId: spaceObject.id,
            epoch: tle.epoch,
          },
        },
        create: {
          spaceObjectId: spaceObject.id,
          line1: tle.line1,
          line2: tle.line2,
          epoch: tle.epoch,
          source: Source.CELESTRAK_API,
        },
        update: {
          line1: tle.line1,
          line2: tle.line2,
          fetchedAt: new Date(),
        },
      });
      dbUpdated++;
    }

    // 清除过期轨道缓存（让后续请求用新 TLE 重新计算）
    await prisma.orbitCache.deleteMany({
      where: {
        spaceObject: {
          noradId: { in: updated.map(t => t.noradId) },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        updated: updated.map(({ noradId, name, line1, line2 }) => ({ noradId, name, line1, line2 })),
        failed,
        total: noradIds.length,
        updatedCount: updated.length,
        failedCount: failed.length,
        dbUpdated,
      },
    });
  } catch (error) {
    console.error('TLE refresh error:', error);
    return NextResponse.json(
      { success: false, error: 'TLE 数据刷新失败，请稍后重试' },
      { status: 500 }
    );
  }
}
