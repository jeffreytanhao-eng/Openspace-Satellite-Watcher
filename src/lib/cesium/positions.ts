import { createSatrec, propagateOrbit, calculateOrbitParams } from '@/lib/tle/orbit';
import type { TLEData } from '@/lib/tle/parser';

/**
 * Calculate satellite ECI position in meters (Cesium uses meters) at a given time
 */
export function calculateSatellitePosition(
  tleData: TLEData[],
  time: Date
): { x: number; y: number; z: number } | null {
  if (!tleData || tleData.length === 0) return null;

  const latestTle = tleData[0];
  try {
    const satrec = createSatrec(latestTle);
    const state = propagateOrbit(satrec, time);
    if (!state) return null;

    // Convert km to meters for Cesium
    return {
      x: state.position.x * 1000,
      y: state.position.y * 1000,
      z: state.position.z * 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Generate closed orbit trail points (ECI, meters) for visualization.
 * Uses TLE meanMotion to calculate the exact orbital period, then generates
 * points for one complete revolution so the orbit forms a closed ellipse.
 */
export function generateOrbitPoints(
  tleData: TLEData[],
  startTime: Date,
  numPoints: number = 180
): Array<{ x: number; y: number; z: number }> {
  if (!tleData || tleData.length === 0) return [];

  const latestTle = tleData[0];
  const points: Array<{ x: number; y: number; z: number }> = [];

  try {
    const satrec = createSatrec(latestTle);

    // Calculate orbital period from satrec.no (mean motion in radians/minute)
    // satrec.no is set by satellite.js twoline2satrec and is always valid
    // Convert: rad/min → rev/day → period in minutes
    // rev/day = no * (1440 / (2*π)),  period_minutes = 1440 / rev/day = 1440 * 2*π / (no * 1440) = 2*π / no
    const meanMotionRadPerMin = satrec.no;
    let periodMinutes: number;
    if (meanMotionRadPerMin > 0) {
      periodMinutes = (2 * Math.PI) / meanMotionRadPerMin;
    } else {
      // Fallback: try elements.meanMotion
      const mm = latestTle.elements?.meanMotion;
      if (mm && mm > 0) {
        periodMinutes = 1440 / mm;
      } else {
        return []; // Cannot determine period
      }
    }

    // Clamp to reasonable range (LEO ~88min to GEO ~1436min, plus some buffer)
    periodMinutes = Math.max(80, Math.min(1500, periodMinutes));

    const periodMs = periodMinutes * 60 * 1000;
    const stepMs = periodMs / numPoints;

    // Start a few minutes before current time so the trail shows history + future
    const trailStartOffset = -periodMs * 0.1; // 10% before current time
    const trailStart = new Date(startTime.getTime() + trailStartOffset);

    // Generate points for exactly one full orbit (closed loop)
    for (let i = 0; i <= numPoints; i++) {
      const t = new Date(trailStart.getTime() + i * stepMs);
      const state = propagateOrbit(satrec, t);
      if (state) {
        points.push({
          x: state.position.x * 1000,
          y: state.position.y * 1000,
          z: state.position.z * 1000,
        });
      }
    }

    // Ensure closure: if first and last points are close enough,
    // duplicate first point as last to guarantee visual closure
    if (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const dz = last.z - first.z;
      const gapDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // If gap > 10km, close the loop by adding first point
      if (gapDist > 10000) {
        points.push({ ...first });
      }
    }
  } catch {
    return [];
  }

  return points;
}
