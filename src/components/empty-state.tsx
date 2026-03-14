export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-8 py-16 text-center">
      <span className="mb-3 text-3xl">{icon}</span>
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      <p className="max-w-xs text-xs text-muted">{description}</p>
    </div>
  );
}
