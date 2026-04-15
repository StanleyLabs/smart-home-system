import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cardCls } from './automation-data';

const ACTION_LABELS: Record<string, string> = {
  device_command: 'Control a device',
  delay: 'Wait',
  notify: 'Send notification',
  activate_scene: 'Activate scene',
};

export function SortableActionCard({ id, onRemove, action, children }: {
  id: string;
  onRemove: () => void;
  action: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    animateLayoutChanges: () => false,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.25)' : undefined,
  };
  const label = ACTION_LABELS[String(action.type)] ?? String(action.type);

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={cardCls}>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          className="touch-none cursor-grab text-[var(--text-muted)] active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
            <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
            <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
          </svg>
        </button>
        <p className="flex-1 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <button
          type="button"
          onClick={onRemove}
          className="text-sm text-[var(--danger)] hover:underline"
        >
          Remove
        </button>
      </div>
      {children}
    </div>
  );
}
