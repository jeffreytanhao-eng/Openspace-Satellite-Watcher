// Satellite 3D model and image mapping
// NASA models from NASA 3D Resources (Public Domain): github.com/nasa/NASA-3D-Resources
// Chinese models from NADC / CASCI (Public Domain): nadc.china-vo.org
// Same constellation satellites share the same model and image

interface ModelMapping {
  model3dUrl: string;
  imageUrl: string;
}

// Match by satellite name keyword (case-insensitive)
// Satellites in the same constellation share the same 3D model
const SATELLITE_MODEL_MAP: { match: string; model: ModelMapping }[] = [
  // Space stations
  {
    match: 'ISS',
    model: { model3dUrl: '/models/iss.glb', imageUrl: '/models/iss.png' },
  },
  // Space telescopes
  {
    match: 'HUBBLE',
    model: { model3dUrl: '/models/hubble.glb', imageUrl: '/models/hubble.png' },
  },
  {
    match: 'HST',
    model: { model3dUrl: '/models/hubble.glb', imageUrl: '/models/hubble.png' },
  },
  {
    match: 'JWST',
    model: { model3dUrl: '/models/jwst.glb', imageUrl: '/models/jwst.png' },
  },
  {
    match: 'JAMES WEBB',
    model: { model3dUrl: '/models/jwst.glb', imageUrl: '/models/jwst.png' },
  },
  {
    match: 'KEPLER',
    model: { model3dUrl: '/models/kepler.glb', imageUrl: '/models/kepler.png' },
  },
  {
    match: 'TESS',
    model: { model3dUrl: '/models/tess.glb', imageUrl: '/models/tess.png' },
  },
  {
    match: 'FERMI',
    model: { model3dUrl: '/models/fermi.glb', imageUrl: '/models/fermi.png' },
  },
  {
    match: 'SWIFT',
    model: { model3dUrl: '/models/swift.glb', imageUrl: '/models/swift.png' },
  },
  // Earth observation (A-Train constellation)
  {
    match: 'TERRA',
    model: { model3dUrl: '/models/terra.glb', imageUrl: '/models/terra.png' },
  },
  {
    match: 'AQUA',
    model: { model3dUrl: '/models/aqua.glb', imageUrl: '/models/aqua.png' },
  },
  {
    match: 'AURA',
    model: { model3dUrl: '/models/aura.glb', imageUrl: '/models/aura.png' },
  },
  {
    match: 'CALIPSO',
    model: { model3dUrl: '/models/calipso.glb', imageUrl: '/models/calipso.png' },
  },
  {
    match: 'CLOUDSAT',
    model: { model3dUrl: '/models/cloudsat.glb', imageUrl: '/models/cloudsat.png' },
  },
  // Land observation
  {
    match: 'LANDSAT',
    model: { model3dUrl: '/models/landsat8.glb', imageUrl: '/models/landsat8.png' },
  },
  // Weather & climate
  {
    match: 'SUOMI',
    model: { model3dUrl: '/models/suomi-npp.glb', imageUrl: '/models/suomi-npp.png' },
  },
  {
    match: 'NPP',
    model: { model3dUrl: '/models/suomi-npp.glb', imageUrl: '/models/suomi-npp.png' },
  },
  {
    match: 'JPSS',
    model: { model3dUrl: '/models/suomi-npp.glb', imageUrl: '/models/suomi-npp.png' },
  },
  {
    match: 'NOAA',
    model: { model3dUrl: '/models/suomi-npp.glb', imageUrl: '/models/suomi-npp.png' },
  },
  {
    match: 'GOES',
    model: { model3dUrl: '/models/suomi-npp.glb', imageUrl: '/models/suomi-npp.png' },
  },
  // Precipitation
  {
    match: 'TRMM',
    model: { model3dUrl: '/models/trmm.glb', imageUrl: '/models/trmm.png' },
  },
  {
    match: 'GPM',
    model: { model3dUrl: '/models/gpm.glb', imageUrl: '/models/gpm.png' },
  },
  // Ocean & atmosphere
  {
    match: 'QUIKSCAT',
    model: { model3dUrl: '/models/quikscat.glb', imageUrl: '/models/quikscat.png' },
  },
  {
    match: 'JASON',
    model: { model3dUrl: '/models/jason2.glb', imageUrl: '/models/jason2.png' },
  },
  {
    match: 'OSTM',
    model: { model3dUrl: '/models/jason2.glb', imageUrl: '/models/jason2.png' },
  },
  // Gravity & climate
  {
    match: 'GRACE',
    model: { model3dUrl: '/models/grace.glb', imageUrl: '/models/grace.png' },
  },
  {
    match: 'OCO',
    model: { model3dUrl: '/models/oco2.glb', imageUrl: '/models/oco2.png' },
  },
  {
    match: 'DSCOVR',
    model: { model3dUrl: '/models/dscovr.glb', imageUrl: '/models/dscovr.png' },
  },
  // Ice & elevation
  {
    match: 'ICESAT',
    model: { model3dUrl: '/models/icesat2.glb', imageUrl: '/models/icesat2.png' },
  },
  // Cyclone
  {
    match: 'CYGNSS',
    model: { model3dUrl: '/models/cygnss.glb', imageUrl: '/models/cygnss.png' },
  },
  // Chinese spacecraft (models from NADC / CASCI)
  {
    match: 'CHANG',
    model: { model3dUrl: '/models/change5.glb', imageUrl: '' },
  },
  {
    match: 'CHANGE',
    model: { model3dUrl: '/models/change5.glb', imageUrl: '' },
  },
  {
    match: 'TIANWEN',
    model: { model3dUrl: '/models/tianwen1.glb', imageUrl: '' },
  },
];

// Look up 3D model and image for a satellite by name.
// Returns null if no matching model is found.
export function getSatelliteModel(satelliteName: string): ModelMapping | null {
  const upper = satelliteName.toUpperCase();
  for (const entry of SATELLITE_MODEL_MAP) {
    if (upper.includes(entry.match)) {
      return entry.model;
    }
  }
  return null;
}
