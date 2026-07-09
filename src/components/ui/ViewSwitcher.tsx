'use client';

import { useSatelliteStore, useViewMode } from '@/store/satelliteStore';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

export default function ViewSwitcher() {
  const viewMode = useViewMode();
  const setViewMode = useSatelliteStore(state => state.setViewMode);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const handleSwitch = (newMode: '2d' | '3d') => {
    setViewMode(newMode);
    const params = new URLSearchParams(searchParams);
    params.set('view', newMode);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-1 bg-space-800/80 backdrop-blur-sm rounded-lg p-0.5 border border-space-700">
      <button
        onClick={() => handleSwitch('2d')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
          viewMode === '2d'
            ? 'bg-cosmic-blue/20 text-cosmic-blue shadow-sm shadow-cosmic-blue/20'
            : 'text-space-400 hover:text-space-200 hover:bg-space-700/50'
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
        <span>2D</span>
      </button>
      <button
        onClick={() => handleSwitch('3d')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
          viewMode === '3d'
            ? 'bg-cosmic-blue/20 text-cosmic-blue shadow-sm shadow-cosmic-blue/20'
            : 'text-space-400 hover:text-space-200 hover:bg-space-700/50'
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span>3D</span>
      </button>
    </div>
  );
}
