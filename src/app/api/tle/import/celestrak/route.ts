import { NextRequest, NextResponse } from 'next/server';

const CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';
const IMPORT_LIMIT = 100;

// Celestrak 支持的 GROUP 白名单（防止任意URL构造）
const ALLOWED_GROUPS = new Set([
  'stations', 'visual', 'active', 'analyst', 'gpz',
  'starlink', 'oneweb', 'planet', 'iridium',
  'gps-ops', 'glo-ops', 'galileo', 'beidou', 'musson',
  'sarsat', 'cubesat', 'geodetic', 'weather', 'noaa', 'goes',
  'resource', 'sarsat', 'dmc', 'tdrss', 'argos', 'planets',
  'geo', 'meo', 'leo', 'orbcomm', 'globalstar', 'swarm',
  'amateur', 'x-comm', 'other-comm', 'satnogs', 'gorizont',
  'raduga', 'molniya', 'weather', 'nnss', 'musson',
  'beidou', 'sbas', 'gps', 'glo', 'galileo',
]);

// Parse TLE text into satellite objects without database
function parseTLEText(tleText: string, limit?: number) {
  const lines = tleText.trim().split('\n');
  const results: {
    total: number;
    success: number;
    failed: number;
    satellites: { noradId: number; name: string; line1: string; line2: string }[];
    failures: { noradId: string; name: string; reason: string }[];
    truncated: boolean;
  } = { total: 0, success: 0, failed: 0, satellites: [], failures: [], truncated: false };
  const maxItems = limit || IMPORT_LIMIT;

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
          if (results.satellites.length < maxItems) {
            results.satellites.push({ noradId, name, line1, line2 });
            results.success++;
          } else {
            results.truncated = true;
          }
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
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  try {
    // Read category from URL query params (client sends as ?constellation=)
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('constellation') || searchParams.get('category');

    if (!category) {
      return NextResponse.json(
        { success: false, error: '分类名称为必填项' },
        { status: 400 }
      );
    }

    // 参数长度限制
    if (category.length > 50) {
      return NextResponse.json(
        { success: false, error: '分类名称过长' },
        { status: 400 }
      );
    }

    // 白名单校验（防止URL注入）
    if (!ALLOWED_GROUPS.has(category.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: `不支持的分类: ${category}` },
        { status: 400 }
      );
    }

    const url = `${CELESTRAK_BASE_URL}?GROUP=${encodeURIComponent(category)}&FORMAT=tle`;

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
      const errorMsg = response.status === 403
        ? `Celestrak 拒绝了请求 (403)，该分类可能因访问限制暂时不可用。请尝试使用 NORAD ID 搜索单个卫星。`
        : `Celestrak 请求失败: ${response.status}`;
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 503 }
      );
    }

    const tleText = await response.text();
    const results = parseTLEText(tleText);

    // Return parsed satellite data directly (no database needed)
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
    console.error('Celestrak import error:', error);
    return NextResponse.json(
      { success: false, error: '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}
