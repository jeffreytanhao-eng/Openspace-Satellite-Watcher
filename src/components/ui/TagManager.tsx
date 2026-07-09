'use client';

import { useState, useEffect } from 'react';
import { X, Edit2, Trash2, Plus, Search, Check, XCircle } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { ScrollArea } from './scroll-area';
import { apiClient } from '@/lib/api/client';

export interface Tag {
  id: string;
  name: string;
  color: string;
  objects?: { id: string; noradId: number; name: string }[];
}

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function TagManager({ isOpen, onClose }: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);

  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadTags();
    }
  }, [isOpen]);

  const loadTags = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getTags();
      if (response.success && response.data) {
        setTags(response.data as Tag[]);
      } else {
        setError(response.error || '获取标签列表失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    
    try {
      const response = await apiClient.createTag({
        name: newTagName.trim(),
        color: newTagColor
      });
      
      if (response.success && response.data) {
        setTags(prev => [...prev, response.data as Tag]);
        setNewTagName('');
        setNewTagColor(PRESET_COLORS[0]);
        setShowCreateModal(false);
      } else {
        setError(response.error || '创建标签失败');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStartEdit = (tag: Tag) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleSaveEdit = async () => {
    if (!editingTag || !editName.trim()) return;
    
    try {
      const response = await apiClient.updateTag({
        id: editingTag.id,
        name: editName.trim(),
        color: editColor
      });
      
      if (response.success && response.data) {
        setTags(prev => prev.map(t => t.id === editingTag.id ? response.data as Tag : t));
        setEditingTag(null);
        setEditName('');
        setEditColor('');
      } else {
        setError(response.error || '更新标签失败');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    setDeletingTag(tagId);
    try {
      const response = await apiClient.deleteTag(tagId);
      
      if (response.success) {
        setTags(prev => prev.filter(t => t.id !== tagId));
      } else {
        setError(response.error || '删除标签失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingTag(null);
    }
  };

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-space-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl mx-4 max-h-[80vh] bg-space-900 border border-space-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-space-700">
          <h2 className="text-space-100 font-semibold text-lg">标签管理</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 bg-cosmic-blue/20 hover:bg-cosmic-blue/30 border border-cosmic-blue/50 text-cosmic-blue"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              新建标签
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-space-400 hover:text-space-100 hover:bg-space-700/50"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 border-b border-space-700">
          <Input
            type="text"
            placeholder="搜索标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-sm bg-space-800/50 border-space-700 focus:border-cosmic-blue"

          />
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-cosmic-blue border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="h-4 w-4" />
                {error}
              </div>
            ) : filteredTags.length === 0 ? (
              <div className="text-center text-space-500 py-8">
                <p className="text-sm">暂无标签</p>
                <p className="text-xs mt-1">点击上方按钮创建新标签</p>
              </div>
            ) : (
              filteredTags.map(tag => (
                <div
                  key={tag.id}
                  className="bg-space-800/50 rounded-lg p-4 border border-space-700"
                >
                  {editingTag?.id === tag.id ? (
                    <div className="space-y-3">
                      <div>
                        <Input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-space-700/50 border-space-600 focus:border-cosmic-blue"
                          autoFocus
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {PRESET_COLORS.map(color => (
                          <button
                            key={color}
                            onClick={() => setEditColor(color)}
                            className={`w-6 h-6 rounded-full transition-all ${
                              editColor === color ? 'ring-2 ring-offset-1 ring-offset-space-800 scale-110' : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 bg-space-700/50 hover:bg-space-600/50 border-space-600"
                          onClick={() => {
                            setEditingTag(null);
                            setEditName('');
                            setEditColor('');
                          }}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 bg-cosmic-blue hover:bg-cosmic-blue/80"
                          onClick={handleSaveEdit}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <div>
                          <p className="text-space-100 font-medium">{tag.name}</p>
                          <p className="text-space-500 text-xs">
                            {tag.objects?.length || 0} 个卫星
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-space-400 hover:text-cosmic-blue hover:bg-cosmic-blue/10"
                          onClick={() => handleStartEdit(tag)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-space-400 hover:text-red-400 hover:bg-red-400/10"
                          onClick={() => handleDeleteTag(tag.id)}
                          disabled={deletingTag === tag.id}
                        >
                          {deletingTag === tag.id ? (
                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {showCreateModal && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-space-950/80">
            <div className="w-full max-w-sm mx-4 bg-space-800 border border-space-600 rounded-xl p-6">
              <h3 className="text-space-100 font-semibold mb-4">创建新标签</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-space-400 text-sm mb-2 block">标签名称</label>
                  <Input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="输入标签名称"
                    className="bg-space-700/50 border-space-600 focus:border-cosmic-blue"
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
                          newTagColor === color ? 'ring-2 ring-offset-2 ring-offset-space-800 scale-110' : 'hover:scale-105'
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
                  className="bg-space-700/50 hover:bg-space-600/50 border-space-600"
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
    </div>
  );
}