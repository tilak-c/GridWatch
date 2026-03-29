import { useState, useEffect } from 'react';
import { getAlerts, transitionAlert } from '../lib/api';
import { getSocket } from '../lib/socket';
import StatusBadge from '../components/StatusBadge';
import { AlertTriangle, CheckCircle, Clock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState<number | null>(null);
  const limit = 20;

  const fetchAlerts = async () => {
    try {
      const params: any = { page, limit };
      if (statusFilter) params.status = statusFilter;
      const res = await getAlerts(params);
      setAlerts(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchAlerts();
  }, [page, statusFilter]);

  // Real-time alert updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleAlertNew = () => fetchAlerts();
    const handleAlertUpdated = () => fetchAlerts();
    const handleAlertEscalated = () => fetchAlerts();

    socket.on('alert:new', handleAlertNew);
    socket.on('alert:updated', handleAlertUpdated);
    socket.on('alert:escalated', handleAlertEscalated);

    return () => {
      socket.off('alert:new', handleAlertNew);
      socket.off('alert:updated', handleAlertUpdated);
      socket.off('alert:escalated', handleAlertEscalated);
    };
  }, [page, statusFilter]);

  const handleTransition = async (alertId: number, action: 'acknowledge' | 'resolve') => {
    setTransitioning(alertId);
    try {
      await transitionAlert(alertId, action);
      fetchAlerts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to transition alert');
    } finally {
      setTransitioning(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Alert Management</h2>
          <p className="text-sm text-grid-text-muted mt-1">{total} total alerts</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 border-b border-grid-border pb-3">
        {[
          { value: '', label: 'All' },
          { value: 'open', label: 'Open' },
          { value: 'acknowledged', label: 'Acknowledged' },
          { value: 'resolved', label: 'Resolved' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === tab.value
                ? 'bg-grid-accent/15 text-grid-accent-glow border border-grid-accent/30'
                : 'text-grid-text-muted hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-grid-border">
                <th className="text-left text-xs font-medium text-grid-text-muted px-4 py-3">ID</th>
                <th className="text-left text-xs font-medium text-grid-text-muted px-4 py-3">Sensor</th>
                <th className="text-left text-xs font-medium text-grid-text-muted px-4 py-3">Severity</th>
                <th className="text-left text-xs font-medium text-grid-text-muted px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-grid-text-muted px-4 py-3">Escalated</th>
                <th className="text-left text-xs font-medium text-grid-text-muted px-4 py-3">Created</th>
                <th className="text-right text-xs font-medium text-grid-text-muted px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-grid-text-muted">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-grid-text-muted">
                    No alerts found
                  </td>
                </tr>
              ) : (
                alerts.map((alert, i) => (
                  <tr
                    key={alert.id}
                    className={`border-b border-grid-border/50 hover:bg-grid-surface-2/50 transition-colors animate-slide-in`}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <td className="px-4 py-3 text-xs font-mono text-grid-text-muted">#{alert.id}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-white">{alert.sensor_external_id}</p>
                      <p className="text-xs text-grid-text-muted">{alert.sensor_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={alert.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        alert.status === 'open' ? 'text-status-critical' :
                        alert.status === 'acknowledged' ? 'text-status-warning' :
                        'text-status-healthy'
                      }`}>
                        {alert.status === 'open' ? <AlertTriangle className="w-3 h-3" /> :
                         alert.status === 'acknowledged' ? <Clock className="w-3 h-3" /> :
                         <CheckCircle className="w-3 h-3" />}
                        {alert.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-grid-text-muted">
                      {alert.escalated ? (
                        <span className="text-status-critical font-medium">⚡ Yes</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-grid-text-muted">
                      {new Date(alert.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {alert.status === 'open' && (
                          <button
                            onClick={() => handleTransition(alert.id, 'acknowledge')}
                            disabled={transitioning === alert.id}
                            className="px-3 py-1.5 text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/30 rounded-md hover:bg-status-warning/20 disabled:opacity-50 transition-all"
                          >
                            {transitioning === alert.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Acknowledge'}
                          </button>
                        )}
                        {(alert.status === 'open' || alert.status === 'acknowledged') && (
                          <button
                            onClick={() => handleTransition(alert.id, 'resolve')}
                            disabled={transitioning === alert.id}
                            className="px-3 py-1.5 text-xs font-medium bg-status-healthy/10 text-status-healthy border border-status-healthy/30 rounded-md hover:bg-status-healthy/20 disabled:opacity-50 transition-all"
                          >
                            {transitioning === alert.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Resolve'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-grid-border">
            <p className="text-xs text-grid-text-muted">
              Page {page} of {totalPages} ({total} alerts)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-md border border-grid-border text-grid-text-muted hover:text-white hover:border-grid-border-light disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-md border border-grid-border text-grid-text-muted hover:text-white hover:border-grid-border-light disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
