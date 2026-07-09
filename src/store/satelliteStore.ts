import { create } from 'zustand';
import type { TLEData } from '@/lib/tle/parser';
import type { ObjectType } from '@prisma/client';

export interface SpaceObject {
  id: string;
  noradId: number;
  name: string;
  country?: string;
  objectType: ObjectType;
  launchDate?: Date;
  launchSite?: string;
  owner?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  tleData: TLEData[];
}

export interface OrbitCacheEntry {
  noradId: number;
  startTime: Date;
  endTime: Date;
  timeStep: number;
  points: Array<{
    time: number;
    x: number;
    y: number;
    z: number;
  }>;
}

export type ViewMode = '3d' | '2d';

export interface TimeState {
  currentTime: Date;
  isPlaying: boolean;
  rate: number;
}

export interface SatelliteStoreState {
  satellites: SpaceObject[];
  selectedSatellite: SpaceObject | null;
  viewMode: ViewMode;
  timeState: TimeState;
  visibleSatellites: number[];
  orbitCache: Map<number, OrbitCacheEntry>;
  isLoading: boolean;
  error: string | null;
  focusTrigger: number;
}

export interface SatelliteStoreActions {
  setSatellites: (satellites: SpaceObject[]) => void;
  addSatellites: (satellites: SpaceObject[]) => void;
  removeSatellite: (noradId: number) => void;
  updateSatellite: (satellite: SpaceObject) => void;
  setSelectedSatellite: (satellite: SpaceObject | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setTimeState: (timeState: Partial<TimeState>) => void;
  setVisibleSatellites: (ids: number[]) => void;
  toggleSatelliteVisibility: (noradId: number) => void;
  addOrbitCache: (entry: OrbitCacheEntry) => void;
  clearOrbitCache: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  triggerFocus: () => void;
}

const MAX_SATELLITES = 1000;

export const useSatelliteStore = create<SatelliteStoreState & SatelliteStoreActions>((set, get) => ({
  satellites: [],
  selectedSatellite: null,
  viewMode: '3d',
  timeState: {
    currentTime: new Date(),
    isPlaying: false,
    rate: 1
  },
  visibleSatellites: [],
  orbitCache: new Map(),
  isLoading: false,
  error: null,
  focusTrigger: 0,

  setSatellites: (satellites) => {
    if (satellites.length > MAX_SATELLITES) {
      console.warn(`卫星数量超过限制 ${MAX_SATELLITES}，将只加载前 ${MAX_SATELLITES} 个`);
      set({ satellites: satellites.slice(0, MAX_SATELLITES), error: `卫星数量超过限制，仅显示前 ${MAX_SATELLITES} 个` });
    } else {
      set({ satellites, error: null });
    }
  },

  addSatellites: (satellites) => {
    const current = get().satellites;
    const newSatellites = satellites.filter(s => !current.some(c => c.noradId === s.noradId));
    const combined = [...current, ...newSatellites];
    
    if (combined.length > MAX_SATELLITES) {
      console.warn(`卫星数量超过限制 ${MAX_SATELLITES}`);
      set({ satellites: combined.slice(0, MAX_SATELLITES), error: `卫星数量超过限制，仅显示前 ${MAX_SATELLITES} 个` });
    } else {
      set({ satellites: combined, error: null });
    }
  },

  removeSatellite: (noradId) => {
    set(state => ({
      satellites: state.satellites.filter(s => s.noradId !== noradId),
      visibleSatellites: state.visibleSatellites.filter(id => id !== noradId),
      selectedSatellite: state.selectedSatellite?.noradId === noradId ? null : state.selectedSatellite
    }));
  },

  updateSatellite: (satellite) => {
    set(state => ({
      satellites: state.satellites.map(s => 
        s.noradId === satellite.noradId ? satellite : s
      ),
      selectedSatellite: state.selectedSatellite?.noradId === satellite.noradId ? satellite : state.selectedSatellite
    }));
  },

  setSelectedSatellite: (satellite) => {
    set({ selectedSatellite: satellite });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setTimeState: (timeState) => {
    set(state => ({
      timeState: { ...state.timeState, ...timeState }
    }));
  },

  setVisibleSatellites: (ids) => {
    set({ visibleSatellites: ids });
  },

  toggleSatelliteVisibility: (noradId) => {
    set(state => ({
      visibleSatellites: state.visibleSatellites.includes(noradId)
        ? state.visibleSatellites.filter(id => id !== noradId)
        : [...state.visibleSatellites, noradId]
    }));
  },

  addOrbitCache: (entry) => {
    set(state => {
      const newCache = new Map(state.orbitCache);
      newCache.set(entry.noradId, entry);
      return { orbitCache: newCache };
    });
  },

  clearOrbitCache: () => {
    set({ orbitCache: new Map() });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setError: (error) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },

  triggerFocus: () => {
    set(state => ({ focusTrigger: state.focusTrigger + 1 }));
  }
}));

export const useSatellites = () => useSatelliteStore(state => state.satellites);
export const useSelectedSatellite = () => useSatelliteStore(state => state.selectedSatellite);
export const useViewMode = () => useSatelliteStore(state => state.viewMode);
export const useTimeState = () => useSatelliteStore(state => state.timeState);
export const useVisibleSatellites = () => useSatelliteStore(state => state.visibleSatellites);
export const useOrbitCache = () => useSatelliteStore(state => state.orbitCache);
export const useSatelliteLoading = () => useSatelliteStore(state => state.isLoading);
export const useSatelliteError = () => useSatelliteStore(state => state.error);