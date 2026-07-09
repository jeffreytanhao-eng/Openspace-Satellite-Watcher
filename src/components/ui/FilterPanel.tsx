'use client';

import { useState, useEffect } from 'react';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Button } from './button';
import { Slider } from './slider';
import { Separator } from './separator';
import type { SpaceObject } from '@/store/satelliteStore';

export interface FilterState {
  noradId: string;
  name: string;
  country: string;
  objectType: string;
  launchYear: string;
  minAltitude: number;
  maxAltitude: number;
  isActive: string;
}

interface FilterPanelProps {
  satellites: SpaceObject[];
  onFilterChange: (filters: FilterState) => void;
  filteredCount: number;
}

const COUNTRIES = [
  '中国', '美国', '俄罗斯', '欧洲', '日本', '印度', '其他'
];

const OBJECT_TYPES = [
  '有效载荷', '火箭体', '碎片', '未知'
];

const LAUNCH_YEARS = Array.from({ length: 40 }, (_, i) => (2026 - i).toString());

export default function FilterPanel({
  satellites,
  onFilterChange,
  filteredCount,
}: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterState>({
    noradId: '',
    name: '',
    country: '',
    objectType: '',
    launchYear: '',
    minAltitude: 0,
    maxAltitude: 40000,
    isActive: '',
  });

  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const handleInputChange = (key: keyof FilterState, value: string | number | null) => {
    setFilters(prev => ({
      ...prev,
      [key]: value ?? '',
    }));
  };

  const handleSliderChange = (values: number[]) => {
    setFilters(prev => ({
      ...prev,
      minAltitude: values[0],
      maxAltitude: values[1],
    }));
  };

  const handleReset = () => {
    setFilters({
      noradId: '',
      name: '',
      country: '',
      objectType: '',
      launchYear: '',
      minAltitude: 0,
      maxAltitude: 40000,
      isActive: '',
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-space-800">
        <div className="flex items-center justify-between">
          <h2 className="text-space-100 font-semibold text-xs">筛选条件</h2>
          <button
            onClick={handleReset}
            className="text-[10px] text-space-400 hover:text-cosmic-blue transition-colors"
          >
            重置
          </button>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[10px] text-space-500">共</span>
          <span className="text-[10px] text-cosmic-blue font-semibold">{filteredCount}</span>
          <span className="text-[10px] text-space-500">个</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] text-space-400">NORAD ID</label>
          <Input
            type="number"
            value={filters.noradId}
            onChange={(e) => handleInputChange('noradId', e.target.value)}
            placeholder="ID"
            className="h-6 !text-[11px] bg-space-800/50 border-space-700"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-space-400">名称</label>
          <Input
            value={filters.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="卫星名称"
            className="h-6 !text-[11px] bg-space-800/50 border-space-700"
          />
        </div>

        <Separator className="bg-space-800" />

        <div className="space-y-1">
          <label className="text-[10px] text-space-400">国别</label>
          <Select
            value={filters.country}
            onValueChange={(value) => handleInputChange('country', value)}
          >
            <SelectTrigger className="h-6 !text-[11px] bg-space-800/50 border-space-700 data-[size=default]:!h-6">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent className="bg-space-800 border-space-700">
              <SelectItem value="">全部</SelectItem>
              {COUNTRIES.map(country => (
                <SelectItem key={country} value={country} className="text-[11px]">
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-space-400">类型</label>
          <Select
            value={filters.objectType}
            onValueChange={(value) => handleInputChange('objectType', value)}
          >
            <SelectTrigger className="h-6 !text-[11px] bg-space-800/50 border-space-700 data-[size=default]:!h-6">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent className="bg-space-800 border-space-700">
              <SelectItem value="">全部</SelectItem>
              {OBJECT_TYPES.map(type => (
                <SelectItem key={type} value={type} className="text-[11px]">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-space-400">状态</label>
          <Select
            value={filters.isActive}
            onValueChange={(value) => handleInputChange('isActive', value)}
          >
            <SelectTrigger className="h-6 !text-[11px] bg-space-800/50 border-space-700 data-[size=default]:!h-6">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent className="bg-space-800 border-space-700">
              <SelectItem value="">全部</SelectItem>
              <SelectItem value="active" className="text-[11px]">活跃</SelectItem>
              <SelectItem value="inactive" className="text-[11px]">退役</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-space-800" />

        <div className="space-y-1">
          <label className="text-[10px] text-space-400">发射年份</label>
          <Select
            value={filters.launchYear}
            onValueChange={(value) => handleInputChange('launchYear', value)}
          >
            <SelectTrigger className="h-6 !text-[11px] bg-space-800/50 border-space-700 data-[size=default]:!h-6">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent className="bg-space-800 border-space-700">
              <SelectItem value="">全部</SelectItem>
              {LAUNCH_YEARS.map(year => (
                <SelectItem key={year} value={year} className="text-[11px]">
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-space-800" />

        <div className="space-y-2">
          <label className="text-[10px] text-space-400 block">
            轨道高度: {filters.minAltitude.toLocaleString()} - {filters.maxAltitude.toLocaleString()} km
          </label>
          <Slider
            value={[filters.minAltitude, filters.maxAltitude]}
            onValueChange={(values) => handleSliderChange(values as number[])}
            min={0}
            max={40000}
            step={500}
            className="w-full py-1"
          />
          {/* Scale labels in 2 rows to avoid wrapping in narrow panel */}
          <div className="grid grid-cols-4 gap-0.5 text-[8px] text-space-500 text-center">
            <span>0</span>
            <span>LEO</span>
            <span>MEO</span>
            <span>GEO</span>
          </div>
          <div className="grid grid-cols-4 gap-0.5 text-[8px] text-space-600 text-center">
            <span>0km</span>
            <span>2千</span>
            <span>2万</span>
            <span>3.6万</span>
          </div>
        </div>
      </div>

      <div className="p-2.5 border-t border-space-800">
        <Button
          variant="outline"
          className="w-full h-7 text-[10px] bg-space-800/50 hover:bg-space-700/50 border-space-700"
          onClick={handleReset}
        >
          重置筛选
        </Button>
      </div>
    </div>
  );
}
