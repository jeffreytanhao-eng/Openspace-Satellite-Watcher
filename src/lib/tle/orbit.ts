import * as satellite from 'satellite.js';
import { EARTH_RADIUS_KM, GM } from './constants';
import type { TLEData } from './parser';

export interface ECI {
  x: number;
  y: number;
  z: number;
}

export interface ECF {
  x: number;
  y: number;
  z: number;
}

export interface GeographicCoord {
  lat: number;
  lon: number;
  alt: number;
}

export interface OrbitState {
  position: ECI;
  velocity: ECI;
  ecf: ECF;
  geographic: GeographicCoord;
  time: Date;
}

export interface OrbitParams {
  perigeeAltitude: number;
  apogeeAltitude: number;
  period: number;
  semiMajorAxis: number;
  eccentricity: number;
}

function degreesToRadians(deg: number): number {
  return deg * (Math.PI / 180);
}

function radiansToDegrees(rad: number): number {
  return rad * (180 / Math.PI);
}

export function createSatrec(tleData: TLEData): satellite.SatRec {
  return satellite.twoline2satrec(tleData.line1, tleData.line2);
}

export function propagateOrbit(satrec: satellite.SatRec, time: Date): OrbitState | null {
  const gmst = satellite.gstime(time);
  const e = satellite.propagate(satrec, time);
  
  if (e.position === false || e.velocity === false) {
    return null;
  }
  
  const pos = e.position as satellite.EciVec3<number>;
  const vel = e.velocity as satellite.EciVec3<number>;
  
  const position: ECI = {
    x: pos.x,
    y: pos.y,
    z: pos.z
  };
  
  const velocity: ECI = {
    x: vel.x,
    y: vel.y,
    z: vel.z
  };
  
  const ecf = eciToEcf(position, gmst);
  const geographic = ecfToGeographic(ecf);
  
  return {
    position,
    velocity,
    ecf,
    geographic,
    time
  };
}

export function eciToEcf(eci: ECI, gmst: number): ECF {
  const cosGmst = Math.cos(gmst);
  const sinGmst = Math.sin(gmst);
  
  return {
    x: eci.x * cosGmst + eci.y * sinGmst,
    y: -eci.x * sinGmst + eci.y * cosGmst,
    z: eci.z
  };
}

export function ecfToGeographic(ecf: ECF): GeographicCoord {
  const x = ecf.x;
  const y = ecf.y;
  const z = ecf.z;
  
  const r = Math.sqrt(x * x + y * y + z * z);
  const alt = r - EARTH_RADIUS_KM;
  
  const lat = radiansToDegrees(Math.asin(z / r));
  
  let lon = radiansToDegrees(Math.atan2(y, x));
  if (lon < 0) {
    lon += 360;
  }
  
  return { lat, lon, alt };
}

export function calculateOrbitParams(satrec: satellite.SatRec): OrbitParams {
  const n = satrec.no / 60;
  
  const a = Math.pow(GM / Math.pow(n, 2), 1 / 3);
  
  const ecc = satrec.ecco;
  
  const rPerigee = a * (1 - ecc);
  const rApogee = a * (1 + ecc);
  
  const perigeeAltitude = rPerigee - EARTH_RADIUS_KM;
  const apogeeAltitude = rApogee - EARTH_RADIUS_KM;
  
  const period = 2 * Math.PI / n;
  
  return {
    perigeeAltitude,
    apogeeAltitude,
    period,
    semiMajorAxis: a,
    eccentricity: ecc
  };
}

export function getGmst(time: Date): number {
  return satellite.gstime(time);
}

export function propagateToGeographic(tleData: TLEData, time: Date): GeographicCoord | null {
  const satrec = createSatrec(tleData);
  const state = propagateOrbit(satrec, time);
  
  return state ? state.geographic : null;
}