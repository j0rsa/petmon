import { CATEGORY_COLORS, CATEGORY_LABELS } from '../types';

interface CategoryBadgeProps {
  category: string;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <span className="badge" style={{ backgroundColor: `${CATEGORY_COLORS[category] ?? '#94a3b8'}22`, color: CATEGORY_COLORS[category] ?? '#334155' }}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}
