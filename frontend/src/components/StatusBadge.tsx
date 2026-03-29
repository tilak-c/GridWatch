interface StatusBadgeProps {
  status: 'healthy' | 'warning' | 'critical' | 'silent' | string;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

const statusConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
  healthy:  { color: 'text-status-healthy',  bg: 'bg-status-healthy/10',  border: 'border-status-healthy/30',  label: 'Healthy' },
  warning:  { color: 'text-status-warning',  bg: 'bg-status-warning/10',  border: 'border-status-warning/30',  label: 'Warning' },
  critical: { color: 'text-status-critical', bg: 'bg-status-critical/10', border: 'border-status-critical/30', label: 'Critical' },
  silent:   { color: 'text-status-silent',   bg: 'bg-status-silent/10',   border: 'border-status-silent/30',   label: 'Silent' },
};

export default function StatusBadge({ status, size = 'sm', pulse = false }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.silent;
  const sizeClass = size === 'md' ? 'text-sm px-3 py-1.5' : 'text-xs px-2 py-1';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${config.bg} ${config.color} ${config.border} ${sizeClass}`}>
      <span className={`w-2 h-2 rounded-full bg-current ${pulse ? 'animate-status-pulse' : ''}`} />
      {config.label}
    </span>
  );
}
