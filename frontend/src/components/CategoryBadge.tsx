import { CATEGORY_COLORS, CATEGORY_LABELS } from '../types';

interface CategoryBadgeProps {
  category: string;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const accent = CATEGORY_COLORS[category];

  return (
    <span
      className={`badge${accent ? '' : ' badge-muted'}`}
      style={accent ? { backgroundColor: `${accent}22`, color: accent } : undefined}
    >
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}
