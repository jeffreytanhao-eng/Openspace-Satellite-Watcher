import { NextRequest, NextResponse } from 'next/server';

// NASA Image and Video Library API - no API key needed
const NASA_IMAGE_API = 'https://images-api.nasa.gov/search';

// Static mapping of satellite names to known 3D model GLB URLs.
// NASA's 3D model library (nasa3d.arc.nasa.gov) provides .blend/.obj/.dae
// formats but not GLB, so model-viewer cannot load them directly.
// Only add URLs here when valid GLB files are available (e.g. in /public/models/).
const SATELLITE_3D_MODELS: Record<string, string> = {};

// Optimized NASA search queries per satellite.
// Searching the raw satellite name (e.g. "Hubble Space Telescope") returns images
// TAKEN BY the satellite, not OF it. These refined queries target photos of the
// spacecraft itself (deployment, servicing, pre-launch, etc.).
const SATELLITE_SEARCH_QUERIES: { match: string; query: string }[] = [
  { match: 'HUBBLE', query: 'Hubble Space Telescope deploy servicing spacecraft' },
  { match: 'ISS', query: 'International Space Station' },
  { match: 'INTERNATIONAL SPACE STATION', query: 'International Space Station' },
  { match: 'TIANHE', query: 'Tianhe space station module' },
  { match: 'CSS', query: 'China space station module' },
  { match: 'GPS', query: 'GPS satellite spacecraft Navstar' },
  { match: 'NAVSTAR', query: 'GPS satellite spacecraft Navstar' },
  { match: 'BEIDOU', query: 'Beidou satellite' },
  { match: 'GLONASS', query: 'GLONASS satellite' },
  { match: 'GALILEO', query: 'Galileo satellite spacecraft' },
  { match: 'NOAA', query: 'NOAA satellite spacecraft' },
  { match: 'STARLINK', query: 'Starlink satellite' },
  { match: 'SENTINEL', query: 'Sentinel satellite spacecraft' },
  { match: 'IRIDIUM', query: 'Iridium satellite' },
  { match: 'LANDSAT', query: 'Landsat satellite spacecraft' },
  { match: 'AQUA', query: 'Aqua satellite spacecraft' },
  { match: 'TERRA', query: 'Terra satellite spacecraft' },
  { match: 'GOES', query: 'GOES satellite spacecraft' },
];

function getSearchQuery(satelliteName: string): string {
  const upper = satelliteName.toUpperCase();
  for (const entry of SATELLITE_SEARCH_QUERIES) {
    if (upper.includes(entry.match)) {
      return entry.query;
    }
  }
  // Default: append "spacecraft" to reduce irrelevant results
  return `${satelliteName} spacecraft`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || searchParams.get('name') || '';

  if (!query) {
    return NextResponse.json({ success: false, error: '缺少查询参数' }, { status: 400 });
  }

  try {
    // Use refined search query to get photos OF the satellite, not BY it
    const nasaQuery = getSearchQuery(query);
    const searchUrl = `${NASA_IMAGE_API}?q=${encodeURIComponent(nasaQuery)}&media_type=image&page_size=5`;
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'NASA API 请求失败' },
        { status: 503 }
      );
    }

    const data = await response.json();
    const items = data?.collection?.items || [];

    // Extract image URLs from results
    const images = items
      .map((item: any) => {
        const links = item.links || [];
        const imageData = item.data?.[0] || {};
        const previewLink = links.find((l: any) => l.render === 'image');
        const origLink = links.find((l: any) => l.rel === 'canonical');
        const mediumLink = links.find((l: any) => l.render === 'image' && l.href?.includes('~medium'));

        return {
          title: imageData.title || '',
          description: imageData.description || '',
          nasaId: imageData.nasa_id || '',
          thumbnail: mediumLink?.href || previewLink?.href || '',
          fullSize: origLink?.href || previewLink?.href || '',
        };
      })
      .filter((img: any) => img.thumbnail);

    // Check for 3D model
    const upperQuery = query.toUpperCase();
    let model3dUrl: string | null = null;
    for (const [key, url] of Object.entries(SATELLITE_3D_MODELS)) {
      if (upperQuery.includes(key)) {
        model3dUrl = url;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        images,
        model3dUrl,
      },
    });
  } catch (error) {
    console.error('NASA media search error:', error);
    return NextResponse.json(
      { success: false, error: '获取媒体资源失败' },
      { status: 500 }
    );
  }
}
