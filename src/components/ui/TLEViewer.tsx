'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from './button';

interface TLEViewerProps {
  name: string;
  line1: string;
  line2: string;
}

export default function TLEViewer({ name, line1, line2 }: TLEViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const tleText = `${name}\n${line1}\n${line2}`;
    await navigator.clipboard.writeText(tleText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLine = async (line: string) => {
    await navigator.clipboard.writeText(line);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-space-400 text-xs">TLE 原始数据</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-cosmic-blue hover:text-cosmic-blue hover:bg-cosmic-blue/10"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              复制全部
            </>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-space-500 text-xs w-8">名称</span>
          <div className="flex-1 bg-space-950/80 rounded border border-space-700/50 px-3 py-2 font-mono text-xs text-space-200 truncate">
            {name}
          </div>
          <button
            onClick={() => handleCopyLine(name)}
            className="p-1.5 text-space-600 hover:text-cosmic-blue hover:bg-space-700/50 rounded transition-colors"
            title="复制"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-space-500 text-xs w-8">Line1</span>
          <div className="flex-1 bg-space-950/80 rounded border border-space-700/50 px-3 py-2 font-mono text-xs text-cosmic-cyan overflow-x-auto">
            {line1}
          </div>
          <button
            onClick={() => handleCopyLine(line1)}
            className="p-1.5 text-space-600 hover:text-cosmic-blue hover:bg-space-700/50 rounded transition-colors"
            title="复制"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-space-500 text-xs w-8">Line2</span>
          <div className="flex-1 bg-space-950/80 rounded border border-space-700/50 px-3 py-2 font-mono text-xs text-cosmic-purple overflow-x-auto">
            {line2}
          </div>
          <button
            onClick={() => handleCopyLine(line2)}
            className="p-1.5 text-space-600 hover:text-cosmic-blue hover:bg-space-700/50 rounded transition-colors"
            title="复制"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="text-space-500 text-[10px] bg-space-800/30 rounded px-3 py-2">
        <p className="mb-1">TLE 格式说明:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>名称行: 卫星名称（可选）</li>
          <li>Line1: 轨道根数、历元时间、均值运动一阶导数等</li>
          <li>Line2: 轨道倾角、升交点赤经、偏心率、近地点幅角等</li>
        </ul>
      </div>
    </div>
  );
}