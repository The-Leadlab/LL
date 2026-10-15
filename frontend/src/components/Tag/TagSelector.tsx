import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag, createTag, getTags } from '@/services/tags';
import TagChip from './TagChip';
import { toast } from 'react-hot-toast';

interface TagSelectorProps {
  selectedTags: Tag[];
  onChange: (tags: Tag[]) => void;
  className?: string;
}

export function TagSelector({ selectedTags, onChange, className = '' }: TagSelectorProps) {
  const queryClient = useQueryClient();
  const [draftName, setDraftName] = useState('');
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => getTags(),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createTag({ name }),
    onSuccess: (created) => {
      const tag = (created?.data ?? created) as Tag;
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      if (tag?.id) {
        onChange([...selectedTags, tag]);
      }
      setDraftName('');
      toast.success(`Tag "${tag?.name || draftName}" created`);
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? String((error as { response?: { data?: { detail?: string } } }).response?.data?.detail || '')
          : '';
      toast.error(message || 'Could not create tag');
    },
  });

  const available = (tags as Tag[]).filter(
    (tag) => !selectedTags.some((selected) => selected.id === tag.id),
  );

  const submitNewTag = () => {
    const name = draftName.trim();
    if (!name || createMutation.isPending) return;
    const existing = (tags as Tag[]).find(
      (tag) => tag.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      if (!selectedTags.some((selected) => selected.id === existing.id)) {
        onChange([...selectedTags, existing]);
      }
      setDraftName('');
      return;
    }
    createMutation.mutate(name);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-2 min-h-[28px]">
        {selectedTags.length === 0 ? (
          <span className="text-sm text-gray-400">No tags yet — create one below</span>
        ) : (
          selectedTags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onDelete={() => {
                onChange(selectedTags.filter((t) => t.id !== tag.id));
              }}
            />
          ))
        )}
      </div>
      <select
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-50"
        disabled={isLoading || available.length === 0}
        value=""
        onChange={(e) => {
          const id = Number(e.target.value);
          const tag = available.find((t) => t.id === id);
          if (tag) onChange([...selectedTags, tag]);
          e.target.value = '';
        }}
      >
        <option value="">
          {isLoading
            ? 'Loading tags…'
            : available.length === 0
              ? 'No existing tags — type a name to create one'
              : 'Add tag…'}
        </option>
        {available.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitNewTag();
            }
          }}
          placeholder="Create a new tag"
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={submitNewTag}
          disabled={!draftName.trim() || createMutation.isPending}
          className="rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {createMutation.isPending ? 'Adding…' : 'Add tag'}
        </button>
      </div>
    </div>
  );
}
