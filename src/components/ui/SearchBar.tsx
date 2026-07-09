'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from './input';
import { Button } from './button';
import { ScrollArea } from './scroll-area';
import { SearchIcon, XIcon, ClockIcon } from 'lucide-react';
import type { SpaceObject } from '@/store/satelliteStore';

interface SearchBarProps {
  satellites: SpaceObject[];
  onSearch: (query: string) => void;
  onSelectSatellite: (satellite: SpaceObject) => void;
}

const MAX_HISTORY = 10;

export default function SearchBar({
  satellites,
  onSearch,
  onSelectSatellite,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('searchHistory');
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch {
        setSearchHistory([]);
      }
    }
  }, []);
  const [filteredSatellites, setFilteredSatellites] = useState<SpaceObject[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const filtered = satellites.filter(satellite => {
      const queryLower = query.toLowerCase();
      const nameMatch = satellite.name.toLowerCase().includes(queryLower);
      const noradMatch = satellite.noradId.toString().includes(queryLower);
      return nameMatch || noradMatch;
    });
    setFilteredSatellites(filtered);
    onSearch(query);
  }, [query, satellites, onSearch]);

  useEffect(() => {
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  }, [searchHistory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      addToHistory(query.trim());
      setShowResults(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setShowResults(false);
    inputRef.current?.focus();
  };

  const addToHistory = (searchTerm: string) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(term => term !== searchTerm);
      return [searchTerm, ...filtered].slice(0, MAX_HISTORY);
    });
  };

  const handleHistoryClick = (term: string) => {
    setQuery(term);
    addToHistory(term);
  };

  const handleSatelliteSelect = (satellite: SpaceObject) => {
    onSelectSatellite(satellite);
    addToHistory(satellite.name);
    setShowResults(false);
    setQuery('');
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('searchHistory');
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-space-500" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            placeholder="搜索卫星名称或 NORAD ID..."
            className="h-9 pl-9 pr-10 text-sm bg-space-800/80 border-space-700 focus:border-cosmic-blue"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-space-500 hover:text-space-300 transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
          <Button
            type="submit"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 bg-cosmic-blue hover:bg-cosmic-blue/80"
          >
            <SearchIcon className="w-4 h-4" />
          </Button>
        </div>
      </form>

      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-space-900 border border-space-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-80">
            <ScrollArea className="h-full">
              <div className="p-2">
                {query && filteredSatellites.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-xs text-space-500">搜索结果</div>
                    {filteredSatellites.slice(0, 10).map(satellite => (
                      <div
                        key={satellite.noradId}
                        onClick={() => handleSatelliteSelect(satellite)}
                        className="px-3 py-2 rounded-lg cursor-pointer hover:bg-space-800 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-space-100 text-sm font-medium">
                            {satellite.name}
                          </span>
                          <span className="text-space-400 text-xs">
                            NORAD: {satellite.noradId}
                          </span>
                        </div>
                        {satellite.country && (
                          <span className="text-space-500 text-xs mt-0.5 block">
                            {satellite.country}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {query && filteredSatellites.length === 0 && (
                  <div className="px-3 py-4 text-center text-space-500 text-sm">
                    未找到匹配的卫星
                  </div>
                )}

                {!query && searchHistory.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="flex items-center gap-1 text-xs text-space-500">
                        <ClockIcon className="w-3 h-3" />
                        <span>搜索历史</span>
                      </div>
                      <button
                        onClick={clearHistory}
                        className="text-[10px] text-space-600 hover:text-space-400 transition-colors"
                      >
                        清空
                      </button>
                    </div>
                    {searchHistory.map((term, index) => (
                      <div
                        key={index}
                        onClick={() => handleHistoryClick(term)}
                        className="px-3 py-2 rounded-lg cursor-pointer hover:bg-space-800 transition-colors flex items-center gap-2"
                      >
                        <SearchIcon className="w-3 h-3 text-space-500" />
                        <span className="text-space-300 text-sm">{term}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!query && searchHistory.length === 0 && (
                  <div className="px-3 py-4 text-center text-space-500 text-sm">
                    暂无搜索历史
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}