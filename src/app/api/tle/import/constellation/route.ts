import { NextRequest, NextResponse } from 'next/server';

const CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';

const CONSTELLATIONS = [
  { name: 'Starlink', category: 'starlink', description: 'SpaceX Starlink 卫星星座' },
  { name: 'GPS', category: 'gps-ops', description: '美国 GPS 导航卫星星座' },
  { name: 'GLONASS', category: 'glo-ops', description: '俄罗斯 GLONASS 导航卫星星座' },
  { name: 'Galileo', category: 'galileo', description: '欧洲 Galileo 导航卫星星座' },
  { name: '北斗', category: 'beidou', description: '中国北斗导航卫星星座' },
];

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

export async function GET() {
  return NextResponse.json({ success: true, data: CONSTELLATIONS });
}

export async function POST(request: NextRequest) {
  try {
    // Read from query params (client sends as ?constellation=)
    const searchParams = request.nextUrl.searchParams;
    const constellation = searchParams.get('constellation');

    if (!constellation) {
      return NextResponse.json(
        { success: false, error: '星座名称为必填项' },
        { status: 400 }
      );
    }

    const constellationInfo = CONSTELLATIONS.find(c => c.name === constellation);
    if (!constellationInfo) {
      return NextResponse.json(
        { success: false, error: `无效的星座: ${constellation}` },
        { status: 400 }
      );
    }

    const url = `${CELESTRAK_BASE_URL}?GROUP=${constellationInfo.category}&FORMAT=tle`;

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
        { success: false, error: '无法连接到 Celestrak 服务器' },
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

    // 限制单次导入最多 100 颗
    const IMPORT_LIMIT = 100;
    let truncated = false;
    if (results.satellites.length > IMPORT_LIMIT) {
      results.satellites = results.satellites.slice(0, IMPORT_LIMIT);
      truncated = true;
    }

    return NextResponse.json({
      success: true,
      data: {
        importReport: {
          total: results.total,
          success: results.success,
          failed: results.failed,
          failures: results.failures,
          truncated,
          limit: IMPORT_LIMIT,
        },
        satellites: results.satellites,
      },
    });
  } catch (error) {
    console.error('Constellation import error:', error);
    return NextResponse.json(
      { success: false, error: '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}
