'use client';

import { useState } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagSelectorProps {
  tags: Tag[];
  selectedTags: Tag[];
  onSelectTags: (tags: Tag[]) => void;
  onCreateTag?: (name: string, color: string) => void;
}

const PRESET_COLORS = [
  '#3b82f6', // cosmic-blue
  '#8b5cf6', // cosmic-purple
  '#06b6d4', // cosmic-cyan
  '#10b981', // green
  '#f59e0b', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#84cc16', // lime
];

export default function TagSelector({ tags, selectedTags, onSelectTags, onCreateTag }: TagSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isSelected = (tag: Tag) => selectedTags.some(t => t.id === tag.id);

  const toggleTag = (tag: Tag) => {
    if (isSelected(tag)) {
      onSelectTags(selectedTags.filter(t => t.id !== tag.id));
    } else {
      onSelectTags([...selectedTags, tag]);
    }
  };

  const handleCreateTag = () => {
    if (newTagName.trim() && onCreateTag) {
      onCreateTag(newTagName.trim(), newTagColor);
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0]);
      setShowCreateModal(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="搜索标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 h-9 text-sm bg-space-800/50 border-space-700 focus:border-cosmic-blue"

        />
        {onCreateTag && (
          <Button
            size="sm"
            className="h-9 bg-cosmic-blue/20 hover:bg-cosmic-blue/30 border border-cosmic-blue/50 text-cosmic-blue"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {filteredTags.map(tag => (
          <button
            key={tag.id}
            onClick={() => toggleTag(tag)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
              isSelected(tag)
                ? 'ring-2 ring-offset-1 ring-offset-space-900'
                : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: tag.color + '20',
              color: tag.color,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
          </button>
        ))}
        {filteredTags.length === 0 && searchQuery && (
          <p className="text-space-500 text-sm">未找到匹配的标签</p>
        )}
        {filteredTags.length === 0 && !searchQuery && (
          <p className="text-space-500 text-sm">暂无标签，点击新建创建</p>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-space-950/80 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-space-900 border border-space-700 rounded-xl p-6">
            <h3 className="text-space-100 font-semibold mb-4">创建新标签</h3>
            <div className="space-y-4">
              <div>
                <label className="text-space-400 text-sm mb-2 block">标签名称</label>
                <Input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="输入标签名称"
                  className="bg-space-800/50 border-space-700 focus:border-cosmic-blue"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-space-400 text-sm mb-2 block">选择颜色</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        newTagColor === color ? 'ring-2 ring-offset-2 ring-offset-space-900 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                className="bg-space-800/50 hover:bg-space-700/50 border-space-700"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
                className="bg-cosmic-blue hover:bg-cosmic-blue/80"
              >
                创建
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}