import * as satellite from 'satellite.js';

interface OrbitRequest {
  noradId: number;
  line1: string;
  line2: string;
}

interface WorkerMessage {
  type: 'calculate' | 'calculateBatch' | 'cancel' | 'clearCache';
  requests?: OrbitRequest[];
  line1?: string;
  line2?: string;
  noradId?: number;
  startTime: number;
  endTime: number;
  stepSeconds: number;
}

interface OrbitPoint {
  time: number;
  lat: number;
  lon: number;
  alt: number;
  x: number;
  y: number;
  z: number;
}

interface WorkerResult {
  type: 'progress' | 'complete' | 'batchComplete' | 'error';
  progress?: number;
  noradId?: number;
  points?: OrbitPoint[];
  results?: Array<{ noradId: number; points: OrbitPoint[]; orbitParams: OrbitParams }>;
  error?: string;
  orbitParams?: OrbitParams;
}

interface OrbitParams {
  perigeeAltitude: number;
  apogeeAltitude: number;
  period: number;
}

interface CacheEntry {
  noradId: number;
  line1: string;
  line2: string;
  startTime: number;
  endTime: number;
  stepSeconds: number;
  points: OrbitPoint[];
  orbitParams: OrbitParams;
  timestamp: number;
}

const CACHE_TTL = 300000;
const MAX_CACHE_SIZE = 1000;

const cache = new Map<number, CacheEntry>();
let isCancelled = false;

function degreesToRadians(deg: number): number {
  return deg * (Math.PI / 180);
}

function radiansToDegrees(rad: number): number {
  return rad * (180 / Math.PI);
}

function eciToEcf(eci: { x: number; y: number; z: number }, gmst: number): { x: number; y: number; z: number } {
  const cosGmst = Math.cos(gmst);
  const sinGmst = Math.sin(gmst);
  
  return {
    x: eci.x * cosGmst + eci.y * sinGmst,
    y: -eci.x * sinGmst + eci.y * cosGmst,
    z: eci.z
  };
}

function ecfToGeographic(ecf: { x: number; y: number; z: number }): { lat: number; lon: number; alt: number } {
  const x = ecf.x;
  const y = ecf.y;
  const z = ecf.z;
  
  const r = Math.sqrt(x * x + y * y + z * z);
  const alt = r - 6378.137;
  
  const lat = radiansToDegrees(Math.asin(z / r));
  
  let lon = radiansToDegrees(Math.atan2(y, x));
  if (lon < 0) {
    lon += 360;
  }
  
  return { lat, lon, alt };
}

function calculateOrbit(line1: string, line2: string, startTime: number, endTime: number, stepSeconds: number): { points: OrbitPoint[]; orbitParams: OrbitParams } {
  const satrec = satellite.twoline2satrec(line1, line2);
  
  const n = satrec.no / 60;
  const a = Math.pow(398600.4418 / Math.pow(n, 2), 1 / 3);
  const ecc = satrec.ecco;
  const rPerigee = a * (1 - ecc);
  const rApogee = a * (1 + ecc);
  const perigeeAltitude = rPerigee - 6378.137;
  const apogeeAltitude = rApogee - 6378.137;
  const period = 2 * Math.PI / n;
  
  const totalSeconds = endTime - startTime;
  const totalSteps = Math.floor(totalSeconds / stepSeconds);
  const points: OrbitPoint[] = [];
  
  for (let i = 0; i <= totalSteps; i++) {
    if (isCancelled) {
      throw new Error('Calculation cancelled');
    }
    
    const currentTime = startTime + i * stepSeconds;
    const date = new Date(currentTime);
    
    const gmst = satellite.gstime(date);
    const e = satellite.propagate(satrec, date);
    
    if (e.position === false || e.velocity === false) {
      continue;
    }
    
    const ecf = eciToEcf(e.position as { x: number; y: number; z: number }, gmst);
    const geo = ecfToGeographic(ecf);
    
    points.push({
      time: currentTime,
      lat: geo.lat,
      lon: geo.lon,
      alt: geo.alt,
      x: ecf.x,
      y: ecf.y,
      z: ecf.z
    });
  }
  
  return {
    points,
    orbitParams: { perigeeAltitude, apogeeAltitude, period }
  };
}

function getCachedResult(noradId: number, line1: string, line2: string, startTime: number, endTime: number, stepSeconds: number): CacheEntry | null {
  const entry = cache.get(noradId);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    cache.delete(noradId);
    return null;
  }
  
  if (entry.line1 !== line1 || entry.line2 !== line2) {
    return null;
  }
  
  if (entry.startTime !== startTime || entry.endTime !== endTime || entry.stepSeconds !== stepSeconds) {
    return null;
  }
  
  return entry;
}

function setCacheEntry(noradId: number, line1: string, line2: string, startTime: number, endTime: number, stepSeconds: number, points: OrbitPoint[], orbitParams: OrbitParams): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = Array.from(cache.keys()).sort((a, b) => cache.get(a)!.timestamp - cache.get(b)!.timestamp)[0];
    cache.delete(oldestKey);
  }
  
  cache.set(noradId, {
    noradId,
    line1,
    line2,
    startTime,
    endTime,
    stepSeconds,
    points,
    orbitParams,
    timestamp: Date.now()
  });
}

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { type, requests, line1, line2, noradId, startTime, endTime, stepSeconds } = event.data;
  
  if (type === 'cancel') {
    isCancelled = true;
    return;
  }
  
  if (type === 'clearCache') {
    cache.clear();
    self.postMessage({ type: 'complete' } as WorkerResult);
    return;
  }
  
  if (type === 'calculate' && line1 && line2) {
    isCancelled = false;
    
    try {
      const cacheKey = noradId || `${line1}-${line2}`;
      const cachedEntry = noradId ? getCachedResult(noradId, line1, line2, startTime, endTime, stepSeconds) : null;
      
      if (cachedEntry) {
        self.postMessage({
          type: 'complete',
          noradId,
          points: cachedEntry.points,
          orbitParams: cachedEntry.orbitParams
        } as WorkerResult);
        return;
      }
      
      const { points, orbitParams } = calculateOrbit(line1, line2, startTime, endTime, stepSeconds);
      
      if (noradId) {
        setCacheEntry(noradId, line1, line2, startTime, endTime, stepSeconds, points, orbitParams);
      }
      
      self.postMessage({
        type: 'complete',
        noradId,
        points,
        orbitParams
      } as WorkerResult);
      
    } catch (error) {
      self.postMessage({
        type: 'error',
        noradId,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as WorkerResult);
    }
    
    return;
  }
  
  if (type === 'calculateBatch' && requests) {
    isCancelled = false;
    const results: WorkerResult['results'] = [];
    const totalRequests = requests.length;
    let completedRequests = 0;
    
    requests.forEach((request, index) => {
      if (isCancelled) return;
      
      try {
        const cachedEntry = getCachedResult(request.noradId, request.line1, request.line2, startTime, endTime, stepSeconds);
        
        if (cachedEntry) {
          results.push({
            noradId: request.noradId,
            points: cachedEntry.points,
            orbitParams: cachedEntry.orbitParams
          });
        } else {
          const { points, orbitParams } = calculateOrbit(request.line1, request.line2, startTime, endTime, stepSeconds);
          
          setCacheEntry(request.noradId, request.line1, request.line2, startTime, endTime, stepSeconds, points, orbitParams);
          
          results.push({
            noradId: request.noradId,
            points,
            orbitParams
          });
        }
        
        completedRequests++;
        const progress = ((completedRequests / totalRequests) * 100).toFixed(1);
        
        if (completedRequests % 10 === 0 || completedRequests === totalRequests) {
          self.postMessage({
            type: 'progress',
            progress: parseFloat(progress)
          } as WorkerResult);
        }
        
        if (completedRequests === totalRequests) {
          self.postMessage({
            type: 'batchComplete',
            results
          } as WorkerResult);
        }
        
      } catch (error) {
        completedRequests++;
        results.push({
          noradId: request.noradId,
          points: [],
          orbitParams: { perigeeAltitude: 0, apogeeAltitude: 0, period: 0 }
        });
        
        if (completedRequests === totalRequests) {
          self.postMessage({
            type: 'batchComplete',
            results
          } as WorkerResult);
        }
      }
    });
    
    return;
  }
});

export {};