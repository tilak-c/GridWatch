import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { Activity, AlertTriangle } from 'lucide-react';

interface SensorCardProps {
  sensor: any;
  isNew?: boolean;
}

export default function SensorCard({ sensor, isNew }: SensorCardProps) {
  const navigate = useNavigate();

  const statusGlow: Record<string, string> = {
    critical: 'shadow-status-critical/20 border-status-critical/30',
    warning: 'shadow-status-warning/10 border-status-warning/20',
    healthy: '',
    silent: 'opacity-60',
  };

  return (
    <div
      onClick={() => navigate(`/sensors/${sensor.id}`)}
      className={`glass-card p-4 cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
        isNew ? 'animate-pulse-glow' : ''
      } ${statusGlow[sensor.status] || ''} ${
        sensor.status === 'critical' ? 'shadow-lg' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono text-grid-accent-glow truncate">{sensor.sensor_id}</p>
          <p className="text-sm text-white font-medium truncate mt-0.5">{sensor.name}</p>
        </div>
        <StatusBadge status={sensor.status} pulse={sensor.status === 'critical'} />
      </div>

      {/* Zone */}
      <div className="text-[11px] text-grid-text-muted mb-3">
        {sensor.zone_name}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-grid-text-muted">
          <Activity className="w-3 h-3" />
          <span>
            {sensor.last_reading_at
              ? new Date(sensor.last_reading_at).toLocaleTimeString()
              : 'No data'}
          </span>
        </div>
        {parseInt(sensor.open_alerts) > 0 && (
          <div className="flex items-center gap-1 text-status-warning">
            <AlertTriangle className="w-3 h-3" />
            <span>{sensor.open_alerts} alert{parseInt(sensor.open_alerts) !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
