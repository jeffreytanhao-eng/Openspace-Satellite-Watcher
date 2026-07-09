import { NextRequest, NextResponse } from 'next/server';

// Only allow proxying NASA image assets to prevent SSRF
const ALLOWED_HOSTS = ['images-assets.nasa.gov'];

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get('src');

  if (!src) {
    return NextResponse.json({ error: '缺少 src 参数' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(src);
  } catch {
    return NextResponse.json({ error: '无效的 URL' }, { status: 400 });
  }

  // Security: only allow NASA image hosts
  if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    return NextResponse.json({ error: '不允许的域名' }, { status: 403 });
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `NASA 返回 ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('[nasa-image proxy] Failed to fetch:', error);
    return NextResponse.json(
      { error: '获取图片失败' },
      { status: 502 }
    );
  }
}
