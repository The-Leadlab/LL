import { useQuery } from '@tanstack/react-query';
import { Tag, getTags } from '@/services/tags';
import TagChip from './TagChip';

interface TagSelectorProps {
  selectedTags: Tag[];
  onChange: (tags: Tag[]) => void;
  className?: string;
}

export function TagSelector({ selectedTags, onChange, className = '' }: TagSelectorProps) {
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => getTags(),
  });

  const available = (tags as Tag[]).filter(
    (tag) => !selectedTags.some((selected) => selected.id === tag.id),
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-2 min-h-[28px]">
        {selectedTags.length === 0 ? (
          <span className="text-sm text-gray-400">No tags</span>
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
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
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
          {isLoading ? 'Loading tags…' : available.length === 0 ? 'All tags selected' : 'Add tag…'}
        </option>
        {available.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
    </div>
  );
}
