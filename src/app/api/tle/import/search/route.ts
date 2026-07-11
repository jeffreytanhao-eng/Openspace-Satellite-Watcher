import { NextRequest, NextResponse } from 'next/server';

const CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';

// Parse TLE text into satellite objects
function parseTLEText(tleText: string) {
  const lines = tleText.trim().split('\n');
  const results: {
    total: number;
    success: number;
    failed: number;
    satellites: { noradId: number; name: string; line1: string; line2: string }[];
    failures: { noradId: string; name: string; reason: string }[];
  } = { total: 0, success: 0, failed: 0, satellites: [], failures: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!line.startsWith('1') && !line.startsWith('2')) {
      const name = line;
      const line1 = lines[i + 1]?.trim();
      const line2 = lines[i + 2]?.trim();

      if (line1?.startsWith('1') && line2?.startsWith('2')) {
        results.total++;
        const noradId = parseInt(line1.slice(2, 7).trim());

        if (!isNaN(noradId)) {
          results.satellites.push({ noradId, name, line1, line2 });
          results.success++;
        } else {
          results.failed++;
          results.failures.push({ noradId: '未知', name, reason: '无效的 NORAD ID' });
        }
        i += 2;
      }
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    if (!query) {
      return NextResponse.json(
        { success: false, error: '请输入 NORAD ID 或卫星名称' },
        { status: 400 }
      );
    }

    // 参数长度限制
    if (query.length > 100) {
      return NextResponse.json(
        { success: false, error: '搜索内容过长' },
        { status: 400 }
      );
    }

    // Determine if query is a NORAD ID (numeric) or a name
    const isNumeric = /^\d+$/.test(query.trim());
    const paramName = isNumeric ? 'CATNR' : 'NAME';
    const url = `${CELESTRAK_BASE_URL}?${paramName}=${encodeURIComponent(query.trim())}&FORMAT=tle`;

    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://celestrak.org/',
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return NextResponse.json(
        { success: false, error: '无法连接到 Celestrak 服务器，请检查网络连接' },
        { status: 503 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Celestrak 请求失败: ${response.status}` },
        { status: 503 }
      );
    }

    const tleText = await response.text();
    const results = parseTLEText(tleText);

    if (results.success === 0) {
      return NextResponse.json({
        success: false,
        error: `未找到与 "${query}" 匹配的卫星`,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        importReport: {
          total: results.total,
          success: results.success,
          failed: results.failed,
          failures: results.failures,
        },
        satellites: results.satellites,
      },
    });
  } catch (error) {
    console.error('Celestrak search error:', error);
    return NextResponse.json(
      { success: false, error: '搜索失败，请稍后重试' },
      { status: 500 }
    );
  }
}
