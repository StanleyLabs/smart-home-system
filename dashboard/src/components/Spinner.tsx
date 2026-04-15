import { useEffect, useState } from 'react';

export function Spinner({ className = '', delay = 150 }: { className?: string; delay?: number }) {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) return;
    const id = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  if (!visible) return null;

  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--accent)]" />
    </div>
  );
}
