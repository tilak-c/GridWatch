import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSensorDetail, createSuppression } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { ArrowLeft, Activity, AlertTriangle, Shield, Clock, Thermometer, Zap, Loader2 } from 'lucide-react';

export default function SensorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSuppression, setShowSuppression] = useState(false);
  const [suppStart, setSuppStart] = useState('');
  const [suppEnd, setSuppEnd] = useState('');
  const [suppReason, setSuppReason] = useState('');
  const [suppLoading, setSuppLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSensorDetail(parseInt(id))
      .then(res => setData(res.data))
      .catch(err => console.error('Failed to load sensor:', err))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSuppLoading(true);
    try {
      await createSuppression({
        sensor_id: parseInt(id),
        start_time: new Date(suppStart).toISOString(),
        end_time: new Date(suppEnd).toISOString(),
        reason: suppReason || undefined,
      });
      setShowSuppression(false);
      // Refresh data
      const res = await getSensorDetail(parseInt(id));
      setData(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create suppression');
    } finally {
      setSuppLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-grid-accent animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-grid-text-muted">Sensor not found</div>
    );
  }

  const { sensor, recentReadings, anomalies, activeSuppression, rules } = data;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg border border-grid-border text-grid-text-muted hover:text-white hover:border-grid-border-light transition-all mt-1"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{sensor.sensor_id}</h2>
            <StatusBadge status={sensor.status} size="md" pulse={sensor.status === 'critical'} />
          </div>
          <p className="text-sm text-grid-text-muted mt-1">{sensor.name} · {sensor.zone_name}</p>
        </div>
        <button
          onClick={() => setShowSuppression(!showSuppression)}
          className="px-4 py-2 text-sm font-medium bg-grid-surface-2 border border-grid-border rounded-lg text-grid-text-muted hover:text-white hover:border-grid-border-light transition-all flex items-center gap-2"
        >
          <Shield className="w-4 h-4" />
          Suppress Alerts
        </button>
      </div>

      {/* Active Suppression Banner */}
      {activeSuppression && (
        <div className="flex items-center gap-3 px-4 py-3 bg-status-warning/10 border border-status-warning/30 rounded-lg">
          <Shield className="w-4 h-4 text-status-warning" />
          <div className="text-sm">
            <span className="text-status-warning font-medium">Alerts suppressed</span>
            <span className="text-grid-text-muted"> until {new Date(activeSuppression.end_time).toLocaleString()}</span>
            {activeSuppression.reason && (
              <span className="text-grid-text-muted"> — {activeSuppression.reason}</span>
            )}
          </div>
        </div>
      )}

      {/* Suppression Form */}
      {showSuppression && (
        <form onSubmit={handleSuppression} className="glass-card p-5 space-y-4 animate-slide-in">
          <h3 className="text-sm font-semibold text-white">Create Alert Suppression</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-grid-text-muted mb-1">Start Time</label>
              <input type="datetime-local" value={suppStart} onChange={e => setSuppStart(e.target.value)} required
                className="w-full px-3 py-2 bg-grid-bg border border-grid-border rounded-lg text-white text-sm focus:outline-none focus:border-grid-accent" />
            </div>
            <div>
              <label className="block text-xs text-grid-text-muted mb-1">End Time</label>
              <input type="datetime-local" value={suppEnd} onChange={e => setSuppEnd(e.target.value)} required
                className="w-full px-3 py-2 bg-grid-bg border border-grid-border rounded-lg text-white text-sm focus:outline-none focus:border-grid-accent" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-grid-text-muted mb-1">Reason (optional)</label>
            <input type="text" value={suppReason} onChange={e => setSuppReason(e.target.value)} placeholder="e.g., Planned maintenance"
              className="w-full px-3 py-2 bg-grid-bg border border-grid-border rounded-lg text-white text-sm placeholder-grid-text-muted/50 focus:outline-none focus:border-grid-accent" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={suppLoading}
              className="px-4 py-2 text-sm bg-grid-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {suppLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              Create Suppression
            </button>
            <button type="button" onClick={() => setShowSuppression(false)}
              className="px-4 py-2 text-sm text-grid-text-muted border border-grid-border rounded-lg hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Readings */}
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-grid-border flex items-center gap-2">
            <Activity className="w-4 h-4 text-grid-accent" />
            <h3 className="text-sm font-semibold text-white">Recent Readings</h3>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-grid-surface">
                <tr className="border-b border-grid-border">
                  <th className="text-left text-[11px] font-medium text-grid-text-muted px-3 py-2">Time</th>
                  <th className="text-right text-[11px] font-medium text-grid-text-muted px-3 py-2">
                    <span className="flex items-center justify-end gap-1"><Zap className="w-3 h-3" />Voltage</span>
                  </th>
                  <th className="text-right text-[11px] font-medium text-grid-text-muted px-3 py-2">
                    <span className="flex items-center justify-end gap-1"><Thermometer className="w-3 h-3" />Temp</span>
                  </th>
                  <th className="text-right text-[11px] font-medium text-grid-text-muted px-3 py-2">Current</th>
                </tr>
              </thead>
              <tbody>
                {recentReadings.map((r: any) => (
                  <tr key={r.id} className="border-b border-grid-border/30 hover:bg-grid-surface-2/50">
                    <td className="px-3 py-2 text-xs text-grid-text-muted">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono text-white">{parseFloat(r.voltage).toFixed(1)}V</td>
                    <td className="px-3 py-2 text-xs text-right font-mono text-white">{parseFloat(r.temperature).toFixed(1)}°</td>
                    <td className="px-3 py-2 text-xs text-right font-mono text-white">{parseFloat(r.current).toFixed(1)}A</td>
                  </tr>
                ))}
                {recentReadings.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-sm text-grid-text-muted">No readings</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Anomalies */}
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-grid-border flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning" />
            <h3 className="text-sm font-semibold text-white">Recent Anomalies</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {anomalies.length === 0 ? (
              <p className="p-4 text-center text-sm text-grid-text-muted">No anomalies detected</p>
            ) : (
              <div className="divide-y divide-grid-border/30">
                {anomalies.map((a: any) => (
                  <div key={a.id} className="px-4 py-3 hover:bg-grid-surface-2/50">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        a.rule_type === 'threshold_breach' ? 'bg-status-critical/10 text-status-critical' :
                        a.rule_type === 'rate_of_change' ? 'bg-status-warning/10 text-status-warning' :
                        'bg-status-silent/10 text-status-silent'
                      }`}>
                        {a.rule_type.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-2">
                        {a.suppressed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-grid-surface-2 text-grid-text-muted">suppressed</span>
                        )}
                        <span className="text-[11px] text-grid-text-muted flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(a.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sensor Rules */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-grid-border">
          <h3 className="text-sm font-semibold text-white">Detection Rules</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-grid-border/30">
          {rules.map((rule: any) => (
            <div key={rule.id} className="px-4 py-4 bg-grid-surface">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-grid-accent-glow capitalize">{rule.rule_type.replace(/_/g, ' ')}</span>
                <StatusBadge status={rule.severity} />
              </div>
              <pre className="text-xs text-grid-text-muted font-mono bg-grid-bg/50 p-2 rounded overflow-x-auto">
                {JSON.stringify(rule.config, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
