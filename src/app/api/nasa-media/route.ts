import { NextRequest, NextResponse } from 'next/server';

// NASA Image and Video Library API - no API key needed
const NASA_IMAGE_API = 'https://images-api.nasa.gov/search';

// Per-satellite search configuration.
// Uses `title` (title-only search) and `keywords` (metadata keyword filter)
// instead of `q` (full-text) to avoid matching experiment/research photos.
// Each entry can specify multiple search strategies; the first that returns
// relevant results wins.
interface SearchStrategy {
  title?: string;       // Searches only the Title field
  keywords?: string;    // Matches against Keywords metadata field
  q?: string;           // Full-text fallback (less precise)
}

const SATELLITE_SEARCH_STRATEGIES: { match: string; strategies: SearchStrategy[] }[] = [
  {
    match: 'HUBBLE',
    strategies: [
      { title: 'Hubble Space Telescope', keywords: 'Hubble Space Telescope' },
      { title: 'Hubble Servicing Mission' },
      { q: 'Hubble Space Telescope spacecraft deploy' },
    ],
  },
  {
    match: 'ISS',
    strategies: [
      { title: 'International Space Station', keywords: 'International Space Station' },
      { title: 'ISS Expedition', keywords: 'International Space Station' },
      { q: 'ISS space station exterior spacecraft' },
    ],
  },
  {
    match: 'INTERNATIONAL SPACE STATION',
    strategies: [
      { title: 'International Space Station', keywords: 'International Space Station' },
      { q: 'International Space Station exterior' },
    ],
  },
  { match: 'TIANHE', strategies: [{ q: 'Tianhe China space station module' }] },
  { match: 'CSS', strategies: [{ q: 'China space station module spacecraft' }] },
  { match: 'GPS', strategies: [{ title: 'GPS satellite', keywords: 'GPS' }] },
  { match: 'NAVSTAR', strategies: [{ title: 'Navstar GPS satellite' }] },
  { match: 'BEIDOU', strategies: [{ q: 'Beidou satellite spacecraft' }] },
  { match: 'GLONASS', strategies: [{ q: 'GLONASS satellite spacecraft' }] },
  { match: 'GALILEO', strategies: [{ q: 'Galileo satellite spacecraft ESA' }] },
  { match: 'NOAA', strategies: [{ title: 'NOAA satellite', keywords: 'NOAA' }] },
  { match: 'STARLINK', strategies: [{ q: 'Starlink satellite spacecraft' }] },
  { match: 'SENTINEL', strategies: [{ q: 'Sentinel satellite spacecraft ESA' }] },
  { match: 'IRIDIUM', strategies: [{ q: 'Iridium satellite spacecraft' }] },
  { match: 'LANDSAT', strategies: [{ title: 'Landsat satellite', keywords: 'Landsat' }] },
  { match: 'AQUA', strategies: [{ title: 'Aqua satellite', keywords: 'Aqua' }] },
  { match: 'TERRA', strategies: [{ title: 'Terra satellite', keywords: 'Terra' }] },
  { match: 'GOES', strategies: [{ title: 'GOES satellite', keywords: 'GOES' }] },
];

// Keywords that indicate the image is NOT a spacecraft photo.
// These trigger exclusion when found in title or description.
const IRRELEVANT_TITLE_KEYWORDS = [
  'experiment', 'preflight', 'microorganism', 'crew portrait', 'astronaut',
  'eva', 'spacewalk', 'research', 'science', 'test', 'training', 'briefing',
  'conference', 'meeting', 'interview', 'biography', 'portrait', 'signature',
  'patch', 'logo', 'insignia', 'badge', 'medal', 'certificate', 'award',
  'hurricane', 'typhoon', 'storm', 'cyclone', 'wildfire', 'fire',
  'earth observatory', 'image of the day', 'astronaut photo',
  'earth from space', 'city lights', 'crop', 'farmland', 'drought',
  'flood', 'volcano', 'earthquake', 'ice', 'glacier', 'sea ice',
  'aurora', 'eclipse', 'sun', 'solar flare', 'coronal', 'magnetic',
  'nebula', 'galaxy', 'star cluster', 'supernova', 'black hole',
  'mars', 'jupiter', 'saturn', 'venus', 'mercury', 'moon surface',
  'curiosity', 'perseverance', 'rover', 'lander', 'apollo',
];

function getSearchStrategies(satelliteName: string): SearchStrategy[] {
  const upper = satelliteName.toUpperCase();
  for (const entry of SATELLITE_SEARCH_STRATEGIES) {
    if (upper.includes(entry.match)) {
      return entry.strategies;
    }
  }
  // Default: title search with satellite name
  return [{ title: satelliteName }, { q: `${satelliteName} spacecraft` }];
}

// Check if an image is a relevant spacecraft photo.
// Requires the satellite name to appear in the title, and excludes
// images with experiment/research/earth-science keywords.
function isRelevantSpacecraftImage(
  item: { title: string; description: string; keywords?: string[] },
  satelliteName: string
): boolean {
  const title = item.title.toLowerCase();
  const desc = item.description.toLowerCase();

  // Exclude images with irrelevant keywords in title or description
  for (const kw of IRRELEVANT_TITLE_KEYWORDS) {
    if (title.includes(kw) || desc.includes(kw)) return false;
  }

  // Require the satellite name (or a significant part of it) in the title
  const nameLower = satelliteName.toLowerCase();
  const nameParts = nameLower.split(/\s+/).filter(p => p.length > 2);
  const hasNameInTitle = title.includes(nameLower) ||
    nameParts.some(p => title.includes(p));

  return hasNameInTitle;
}

function buildSearchUrl(strategy: SearchStrategy): string {
  const params = new URLSearchParams();
  params.set('media_type', 'image');
  params.set('page_size', '20');

  if (strategy.title) params.set('title', strategy.title);
  if (strategy.keywords) params.set('keywords', strategy.keywords);
  if (strategy.q) params.set('q', strategy.q);

  return `${NASA_IMAGE_API}?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || searchParams.get('name') || '';

  if (!query) {
    return NextResponse.json({ success: false, error: '缺少查询参数' }, { status: 400 });
  }

  try {
    const strategies = getSearchStrategies(query);

    // Try each search strategy until we get relevant results
    for (const strategy of strategies) {
      const searchUrl = buildSearchUrl(strategy);
      const response = await fetch(searchUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const items = data?.collection?.items || [];

      // Extract and filter images
      const images = items
        .map((item: any) => {
          const links = item.links || [];
          const imageData = item.data?.[0] || {};
          const previewLink = links.find((l: any) => l.render === 'image');
          const origLink = links.find((l: any) => l.rel === 'canonical');
          const mediumLink = links.find(
            (l: any) => l.render === 'image' && l.href?.includes('~medium')
          );

          return {
            title: imageData.title || '',
            description: imageData.description || '',
            nasaId: imageData.nasa_id || '',
            keywords: imageData.keywords || [],
            thumbnail: mediumLink?.href || previewLink?.href || '',
            fullSize: origLink?.href || previewLink?.href || '',
          };
        })
        .filter((img: any) => img.thumbnail)
        .filter((img: any) => isRelevantSpacecraftImage(img, query))
        .slice(0, 1);

      if (images.length > 0) {
        return NextResponse.json({
          success: true,
          data: { images, model3dUrl: null },
        });
      }
    }

    // No relevant images found across all strategies
    return NextResponse.json({
      success: true,
      data: { images: [], model3dUrl: null },
    });
  } catch (error) {
    console.error('NASA media search error:', error);
    return NextResponse.json(
      { success: false, error: '获取媒体资源失败' },
      { status: 500 }
    );
  }
}
