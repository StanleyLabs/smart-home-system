type StatusBadgeProps = {
  type: 'battery' | 'online' | 'signal';
  value: number | boolean;
};

function tierColor(n: number) {
  if (n > 50) return 'text-[var(--success)]';
  if (n > 20) return 'text-[var(--warning)]';
  return 'text-[var(--danger)]';
}

export function StatusBadge({ type, value }: StatusBadgeProps) {
  if (type === 'online') {
    const online = Boolean(value);
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span
          className={[
            'h-2 w-2 rounded-full',
            online ? 'bg-[var(--success)]' : 'bg-[var(--danger)]',
          ].join(' ')}
        />
        <span className={online ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
          {online ? 'Online' : 'Offline'}
        </span>
      </span>
    );
  }

  if (type === 'battery') {
    const pct = typeof value === 'number' ? Math.round(value) : 0;
    return (
      <span
        className={[
          'inline-flex items-center gap-0.5 text-xs tabular-nums',
          tierColor(pct),
        ].join(' ')}
      >
        {pct}%
      </span>
    );
  }

  const strength = typeof value === 'number' ? Math.round(value) : 0;
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 text-xs tabular-nums',
        tierColor(strength),
      ].join(' ')}
    >
      {strength}%
    </span>
  );
}
