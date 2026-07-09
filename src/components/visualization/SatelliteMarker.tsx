'use client';

import type { SpaceObject } from '@/store/satelliteStore';

export interface SatelliteMarkerConfig {
  noradId: number;
  name: string;
  position: { lng: number; lat: number };
  color?: string;
  size?: number;
  isSelected?: boolean;
}

export interface SatelliteMarkerResult {
  feature: GeoJSON.Feature;
  update: (config: Partial<SatelliteMarkerConfig>) => void;
}

const DEFAULT_COLOR = '#00d4ff';
const SELECTED_COLOR = '#ffd700';
const DEFAULT_SIZE = 6;
const SELECTED_SIZE = 12;

export function getSatelliteColor(objectType: string): string {
  const colorMap: Record<string, string> = {
    SATELLITE: '#00d4ff',
    DEBRIS: '#ff4444',
    ROCKET_BODY: '#ffaa00',
    PAYLOAD: '#00ff88',
    UNKNOWN: '#888888'
  };
  
  return colorMap[objectType] || DEFAULT_COLOR;
}

export function createSatelliteMarker(
  config: SatelliteMarkerConfig
): SatelliteMarkerResult {
  const { noradId, name, position, color = DEFAULT_COLOR, size = DEFAULT_SIZE, isSelected = false } = config;

  const feature: GeoJSON.Feature = {
    type: 'Feature',
    id: `satellite-${noradId}`,
    properties: {
      noradId,
      name,
      color: isSelected ? SELECTED_COLOR : color,
      size: isSelected ? SELECTED_SIZE : size,
      isSelected,
      objectType: ''
    },
    geometry: {
      type: 'Point',
      coordinates: [position.lng, position.lat]
    }
  };

  const update = (newConfig: Partial<SatelliteMarkerConfig>) => {
    if (newConfig.position) {
      (feature.geometry as GeoJSON.Point).coordinates = [newConfig.position.lng, newConfig.position.lat];
    }
    
    if (newConfig.color !== undefined) {
      feature.properties!.color = newConfig.isSelected ? SELECTED_COLOR : newConfig.color;
    }
    
    if (newConfig.isSelected !== undefined) {
      feature.properties!.isSelected = newConfig.isSelected;
      feature.properties!.color = newConfig.isSelected ? SELECTED_COLOR : (newConfig.color || color);
      feature.properties!.size = newConfig.isSelected ? SELECTED_SIZE : size;
    }
    
    if (newConfig.name !== undefined) {
      feature.properties!.name = newConfig.name;
    }
  };

  return { feature, update };
}

export function createSatelliteIcon(color: string, size: number, isSelected: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const actualSize = size * dpr;
  
  canvas.width = actualSize * 2;
  canvas.height = actualSize * 2;
  canvas.style.width = `${size * 2}px`;
  canvas.style.height = `${size * 2}px`;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  const centerX = actualSize;
  const centerY = actualSize;
  const radius = actualSize * 0.4;
  
  if (isSelected) {
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.5);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = isSelected ? 3 : 1;
  ctx.stroke();
  
  return canvas;
}

export type OnSatelliteClick = (satellite: SpaceObject) => void;