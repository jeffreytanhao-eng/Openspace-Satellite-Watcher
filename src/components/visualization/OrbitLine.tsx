'use client';

import type { SpaceObject } from '@/store/satelliteStore';
import { createSatrec, propagateOrbit } from '@/lib/tle/orbit';
import type { TLEData } from '@/lib/tle/parser';

export interface OrbitLineConfig {
  noradId: number;
  tleData: TLEData[];
  startTime: Date;
  predictOrbits?: number;
  color?: string;
  isSelected?: boolean;
}

export interface OrbitLineResult {
  feature: GeoJSON.Feature;
  update: (config: Partial<OrbitLineConfig>) => void;
}

const DEFAULT_COLOR = '#00d4ff';
const SELECTED_COLOR = '#ffd700';

function generateOrbitPoints(
  tleData: TLEData[],
  startTime: Date,
  predictOrbits: number = 3
): Array<[number, number]> {
  if (tleData.length === 0) return [];
  
  const latestTle = tleData[tleData.length - 1];
  const satrec = createSatrec(latestTle);
  
  const points: Array<[number, number]> = [];
  const orbitPeriod = 2 * Math.PI / (satrec.no / 60);
  const totalDuration = orbitPeriod * predictOrbits;
  const pointsPerOrbit = 180;
  const step = totalDuration / (pointsPerOrbit * predictOrbits);
  
  for (let i = 0; i <= pointsPerOrbit * predictOrbits; i++) {
    const time = new Date(startTime.getTime() + i * step * 1000);
    const state = propagateOrbit(satrec, time);
    
    if (state) {
      points.push([state.geographic.lon, state.geographic.lat]);
    }
  }
  
  return points;
}

function splitLineByAntimeridian(points: Array<[number, number]>): Array<Array<[number, number]>> {
  if (points.length === 0) return [];
  
  const segments: Array<Array<[number, number]>> = [];
  let currentSegment: Array<[number, number]> = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const prev = currentSegment[currentSegment.length - 1];
    const curr = points[i];
    
    const lonDiff = Math.abs(curr[0] - prev[0]);
    if (lonDiff > 180) {
      segments.push(currentSegment);
      currentSegment = [curr];
    } else {
      currentSegment.push(curr);
    }
  }
  
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  
  return segments;
}

export function createOrbitLine(
  config: OrbitLineConfig
): OrbitLineResult {
  const { noradId, tleData, startTime, predictOrbits = 3, color = DEFAULT_COLOR, isSelected = false } = config;
  
  const rawPoints = generateOrbitPoints(tleData, startTime, predictOrbits);
  const segments = splitLineByAntimeridian(rawPoints);
  
  let geometry: GeoJSON.Geometry;
  
  if (segments.length === 1 && segments[0].length >= 2) {
    geometry = {
      type: 'LineString',
      coordinates: segments[0]
    };
  } else if (segments.length > 1) {
    geometry = {
      type: 'MultiLineString',
      coordinates: segments.filter(s => s.length >= 2)
    };
  } else {
    geometry = {
      type: 'LineString',
      coordinates: []
    };
  }
  
  const feature: GeoJSON.Feature = {
    type: 'Feature',
    id: `orbit-${noradId}`,
    properties: {
      noradId,
      color: isSelected ? SELECTED_COLOR : color,
      isSelected,
      predictOrbits
    },
    geometry
  };
  
  const update = (newConfig: Partial<OrbitLineConfig>) => {
    if (newConfig.tleData && newConfig.startTime !== undefined) {
      const newRawPoints = generateOrbitPoints(
        newConfig.tleData,
        newConfig.startTime,
        newConfig.predictOrbits || predictOrbits
      );
      const newSegments = splitLineByAntimeridian(newRawPoints);
      
      if (newSegments.length === 1 && newSegments[0].length >= 2) {
        feature.geometry = {
          type: 'LineString',
          coordinates: newSegments[0]
        };
      } else if (newSegments.length > 1) {
        feature.geometry = {
          type: 'MultiLineString',
          coordinates: newSegments.filter(s => s.length >= 2)
        };
      }
    }
    
    if (newConfig.isSelected !== undefined) {
      feature.properties!.isSelected = newConfig.isSelected;
      feature.properties!.color = newConfig.isSelected ? SELECTED_COLOR : (newConfig.color || color);
    }
    
    if (newConfig.color !== undefined && !feature.properties!.isSelected) {
      feature.properties!.color = newConfig.color;
    }
  };
  
  return { feature, update };
}

export function generateOrbitGeoJSON(
  satellites: SpaceObject[],
  startTime: Date,
  predictOrbits: number = 3
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  
  satellites.forEach(satellite => {
    const orbit = createOrbitLine({
      noradId: satellite.noradId,
      tleData: satellite.tleData,
      startTime,
      predictOrbits,
      color: DEFAULT_COLOR,
      isSelected: false
    });
    features.push(orbit.feature);
  });
  
  return {
    type: 'FeatureCollection',
    features
  };
}