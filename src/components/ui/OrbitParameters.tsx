'use client';

interface OrbitParametersProps {
  inclination: number;
  raan: number;
  eccentricity: number;
  argPerigee: number;
  meanAnomaly: number;
  meanMotion: number;
}

function ParamCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  const formatValue = () => {
    if (unit === '') {
      return value.toFixed(6);
    }
    if (unit === '°') {
      return value.toFixed(4);
    }
    if (unit === 'rev/day') {
      return value.toFixed(8);
    }
    return value.toFixed(4);
  };

  return (
    <div className="bg-space-900/50 rounded-lg p-3 border border-space-700/50">
      <p className="text-space-400 text-xs mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`font-semibold text-sm ${color}`}>
          {formatValue()}
        </span>
        <span className="text-space-500 text-xs">{unit}</span>
      </div>
    </div>
  );
}

export default function OrbitParameters({
  inclination,
  raan,
  eccentricity,
  argPerigee,
  meanAnomaly,
  meanMotion,
}: OrbitParametersProps) {
  const parameters = [
    { label: '轨道倾角 (i)', value: inclination, unit: '°', color: 'text-cosmic-blue' },
    { label: '升交点赤经 (Ω)', value: raan, unit: '°', color: 'text-cosmic-purple' },
    { label: '偏心率 (e)', value: eccentricity, unit: '', color: 'text-cosmic-cyan' },
    { label: '近地点幅角 (ω)', value: argPerigee, unit: '°', color: 'text-cosmic-green' },
    { label: '平近点角 (M)', value: meanAnomaly, unit: '°', color: 'text-cosmic-orange' },
    { label: '平均运动 (n)', value: meanMotion, unit: 'rev/day', color: 'text-neon-purple' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {parameters.map((param, index) => (
        <ParamCard
          key={index}
          label={param.label}
          value={param.value}
          unit={param.unit}
          color={param.color}
        />
      ))}
    </div>
  );
}