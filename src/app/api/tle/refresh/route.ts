import { NextRequest, NextResponse } from 'next/server';

const CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';
const BATCH_SIZE = 50;

interface ParsedTLE {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
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
          results.push({ noradId, name, line1, line2 });
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

    // 分批请求 Celestrak（避免 URL 过长）
    for (let i = 0; i < noradIds.length; i += BATCH_SIZE) {
      const batch = noradIds.slice(i, i + BATCH_SIZE);
      const catnr = batch.join(',');
      const url = `${CELESTRAK_BASE_URL}?CATNR=${encodeURIComponent(catnr)}&FORMAT=tle`;

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/plain,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://celestrak.org/',
          },
          signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
          batch.forEach(id => failed.push({ noradId: id, reason: `Celestrak 返回 ${response.status}` }));
          continue;
        }

        const tleText = await response.text();
        const parsed = parseTLEText(tleText);

        // 匹配返回结果与请求的 NORAD ID
        const foundIds = new Set(parsed.map(p => p.noradId));
        updated.push(...parsed);

        // 标记未找到的
        batch.forEach(id => {
          if (!foundIds.has(id)) {
            failed.push({ noradId: id, reason: 'Celestrak 未返回该卫星的 TLE 数据' });
          }
        });
      } catch {
        batch.forEach(id => failed.push({ noradId: id, reason: '请求超时或网络错误' }));
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        updated,
        failed,
        total: noradIds.length,
        updatedCount: updated.length,
        failedCount: failed.length,
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
