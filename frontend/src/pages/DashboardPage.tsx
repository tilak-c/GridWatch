import { useState, useEffect, useCallback } from 'react';
import { getSensors } from '../lib/api';
import { getSocket } from '../lib/socket';
import SensorCard from '../components/SensorCard';
import { Search, Filter, RefreshCw, Wifi } from 'lucide-react';

export default function DashboardPage() {
  const [sensors, setSensors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [changedSensors, setChangedSensors] = useState<Set<number>>(new Set());
  const [connected, setConnected] = useState(false);

  const fetchSensors = useCallback(async () => {
    try {
      const res = await getSensors();
      setSensors(res.data.data);
    } catch (err) {
      console.error('Failed to load sensors:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSensors();
  }, [fetchSensors]);

  // Socket.IO real-time updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    setConnected(socket.connected);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const handleStateChange = (data: { sensorId: number; status: string }) => {
      setSensors(prev =>
        prev.map(s =>
          s.id === data.sensorId ? { ...s, status: data.status } : s
        )
      );
      setChangedSensors(prev => new Set(prev).add(data.sensorId));
      setTimeout(() => {
        setChangedSensors(prev => {
          const next = new Set(prev);
          next.delete(data.sensorId);
          return next;
        });
      }, 3000);
    };

    const handleNewAlert = () => {
      // Refresh to get updated alert counts
      fetchSensors();
    };

    socket.on('sensor:stateChange', handleStateChange);
    socket.on('alert:new', handleNewAlert);

    return () => {
      socket.off('sensor:stateChange', handleStateChange);
      socket.off('alert:new', handleNewAlert);
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [fetchSensors]);

  // Filter and search
  const filtered = sensors.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.sensor_id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const stats = {
    total: sensors.length,
    healthy: sensors.filter(s => s.status === 'healthy').length,
    warning: sensors.filter(s => s.status === 'warning').length,
    critical: sensors.filter(s => s.status === 'critical').length,
    silent: sensors.filter(s => s.status === 'silent').length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Sensor Dashboard</h2>
          <p className="text-sm text-grid-text-muted mt-1">Real-time sensor monitoring across your zones</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            connected
              ? 'text-status-healthy border-status-healthy/30 bg-status-healthy/10'
              : 'text-status-critical border-status-critical/30 bg-status-critical/10'
          }`}>
            <Wifi className="w-3 h-3" />
            {connected ? 'Live' : 'Disconnected'}
          </div>
          <button
            onClick={fetchSensors}
            className="p-2 text-grid-text-muted hover:text-white rounded-lg hover:bg-grid-surface-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-grid-accent-glow', bg: 'bg-grid-accent/10', border: 'border-grid-accent/20' },
          { label: 'Healthy', value: stats.healthy, color: 'text-status-healthy', bg: 'bg-status-healthy/10', border: 'border-status-healthy/20' },
          { label: 'Warning', value: stats.warning, color: 'text-status-warning', bg: 'bg-status-warning/10', border: 'border-status-warning/20' },
          { label: 'Critical', value: stats.critical, color: 'text-status-critical', bg: 'bg-status-critical/10', border: 'border-status-critical/20' },
          { label: 'Silent', value: stats.silent, color: 'text-status-silent', bg: 'bg-status-silent/10', border: 'border-status-silent/20' },
        ].map(stat => (
          <div key={stat.label} className={`glass-card p-4 border ${stat.border}`}>
            <p className="text-xs text-grid-text-muted">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-grid-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sensors by ID or name..."
            className="w-full pl-10 pr-4 py-2.5 bg-grid-surface border border-grid-border rounded-lg text-white placeholder-grid-text-muted/50 focus:outline-none focus:border-grid-accent/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-grid-text-muted" />
          {['all', 'healthy', 'warning', 'critical', 'silent'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-grid-accent/15 text-grid-accent-glow border border-grid-accent/30'
                  : 'text-grid-text-muted hover:text-white border border-transparent hover:border-grid-border'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Sensor Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-grid-accent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-grid-text-muted">
          No sensors match your filters
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(sensor => (
            <SensorCard
              key={sensor.id}
              sensor={sensor}
              isNew={changedSensors.has(sensor.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
