import type { SpaceObject, ObjectType } from '@/store/satelliteStore';
import { mockSatellites } from './mock/satellites';

// 从名称推断国家
function inferCountry(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('CSS') || upper.includes('TIANHE') || upper.includes('WENTIAN') || upper.includes('MENGTIAN')) return 'CHN';
  if (upper.includes('BEIDOU') || upper.includes('BD-')) return 'CHN';
  if (upper.includes('ISS') || upper.includes('ZARYA')) return 'INT';
  if (upper.includes('STARLINK') || upper.includes('FALCON')) return 'USA';
  if (upper.includes('GPS') || upper.includes('NOAA') || upper.includes('TERRA') || upper.includes('AQUA') || upper.includes('HST') || upper.includes('LANDSAT') || upper.includes('AURA')) return 'USA';
  if (upper.includes('SENTINEL')) return 'EU';
  if (upper.includes('GLONASS') || upper.includes('SOYUZ') || upper.includes('PROGRESS')) return 'RUS';
  if (upper.includes('GALILEO') || upper.includes('IRIDIUM')) return 'INT';
  return 'Unknown';
}

function parseTLE(line2: string) {
  const inclination = parseFloat(line2.slice(8, 16));
  const raan = parseFloat(line2.slice(17, 25));
  const eccentricity = parseFloat('0.' + line2.slice(26, 33));
  const argPerigee = parseFloat(line2.slice(34, 42));
  const meanAnomaly = parseFloat(line2.slice(43, 51));
  const meanMotion = parseFloat(line2.slice(52, 63));
  const period = 1440 / meanMotion;
  const semiMajorAxis = Math.pow((meanMotion * 2 * Math.PI / 86400) ** (-2) * 398600441800000, 1 / 3) / 1000;
  const apogee = semiMajorAxis * (1 + eccentricity) - 6371;
  const perigee = semiMajorAxis * (1 - eccentricity) - 6371;
  return { inclination, raan, eccentricity, argPerigee, meanAnomaly, meanMotion, period, apogee, perigee, altitude: (apogee + perigee) / 2 };
}

function parseEpoch(line1: string): Date {
  const yearStr = line1.slice(18, 20).trim();
  const dayStr = line1.slice(20, 32).trim();
  const fullYear = parseInt(yearStr, 10) >= 57 ? 1900 + parseInt(yearStr, 10) : 2000 + parseInt(yearStr, 10);
  const dayOfYear = parseFloat(dayStr);
  const start = new Date(Date.UTC(fullYear, 0, 1));
  return new Date(start.getTime() + (dayOfYear - 1) * 86400000);
}

let cachedDefaults: SpaceObject[] | null = null;

export function getDefaultSatellites(): SpaceObject[] {
  if (cachedDefaults) return cachedDefaults;
  cachedDefaults = mockSatellites.map((sat, idx): SpaceObject => {
    const epoch = parseEpoch(sat.tleData.line1);
    return {
      id: `default-${idx}`,
      noradId: sat.noradId,
      name: sat.name,
      country: sat.country || inferCountry(sat.name),
      objectType: (sat.objectType as ObjectType) || 'PAYLOAD',
      launchDate: sat.launchDate || null,
      launchSite: sat.launchSite || null,
      owner: sat.owner || null,
      isActive: sat.isActive !== false,
      model3dUrl: sat.model3dUrl || null,
      imageUrl: sat.imageUrl || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tleData: [{
        name: sat.tleData.name || sat.name,
        line1: sat.tleData.line1,
        line2: sat.tleData.line2,
        epoch,
      }],
    };
  });
  return cachedDefaults;
}

// 从 Celestrak 导入结果构建 SpaceObject（前端本地使用）
export function buildSatellitesFromTLE(
  tleResults: Array<{ noradId: number; name: string; line1: string; line2: string }>,
  existingIds: Set<number>
): SpaceObject[] {
  return tleResults
    .filter(r => !existingIds.has(r.noradId))
    .map((r, idx) => {
      const epoch = parseEpoch(r.line1);
      return {
        id: `imported-${r.noradId}-${Date.now()}-${idx}`,
        noradId: r.noradId,
        name: r.name,
        country: inferCountry(r.name),
        objectType: 'PAYLOAD' as ObjectType,
        isActive: true,
        model3dUrl: null,
        imageUrl: null,
        tleData: [{ name: r.name, line1: r.line1, line2: r.line2, epoch }],
      };
    });
}

// 客户端解析 TLE 文本（文件上传时使用）
export function parseTLETextClient(text: string): Array<{ noradId: number; name: string; line1: string; line2: string }> {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trimEnd());
  const results: Array<{ noradId: number; name: string; line1: string; line2: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('1 ') && i > 0 && i + 1 < lines.length) {
      const name = lines[i - 1].trim();
      const line1 = lines[i].trim();
      const line2 = lines[i + 1].trim();
      if (line2.startsWith('2 ') && line1.length >= 69 && line2.length >= 69) {
        const noradId = parseInt(line1.slice(2, 7).trim());
        if (!isNaN(noradId)) {
          results.push({ noradId, name: name || `SAT-${noradId}`, line1, line2 });
        }
        i += 1;
      }
    }
  }
  return results;
}

export const IMPORT_LIMIT_PER_BATCH = 100;
export const MAX_TOTAL_SATELLITES = 200;
