// ============================================================
// Database row types
// ============================================================

export interface Zone {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'operator' | 'supervisor';
  email: string | null;
  created_at: Date;
}

export interface Sensor {
  id: number;
  sensor_id: string; // external identifier
  name: string;
  zone_id: number;
  latitude: number | null;
  longitude: number | null;
  status: SensorStatus;
  last_reading_at: Date | null;
  created_at: Date;
}

export type SensorStatus = 'healthy' | 'warning' | 'critical' | 'silent';

export interface SensorRule {
  id: number;
  sensor_id: number;
  rule_type: RuleType;
  config: ThresholdConfig | RateOfChangeConfig | PatternAbsenceConfig;
  severity: AlertSeverity;
  enabled: boolean;
  created_at: Date;
}

export type RuleType = 'threshold_breach' | 'rate_of_change' | 'pattern_absence';

export interface ThresholdConfig {
  min_voltage?: number;
  max_voltage?: number;
  min_temp?: number;
  max_temp?: number;
}

export interface RateOfChangeConfig {
  change_percent: number;
}

export interface PatternAbsenceConfig {
  silence_seconds: number;
}

export interface Reading {
  id: number;
  sensor_id: number;
  timestamp: Date;
  voltage: number | null;
  current: number | null;
  temperature: number | null;
  status_code: number | null;
  created_at: Date;
}

export interface Anomaly {
  id: number;
  sensor_id: number;
  reading_id: number | null;
  rule_type: string;
  details: Record<string, any> | null;
  suppressed: boolean;
  created_at: Date;
}

export interface Alert {
  id: number;
  anomaly_id: number;
  sensor_id: number;
  zone_id: number;
  severity: AlertSeverity;
  status: AlertStatus;
  assigned_to: number | null;
  suppressed: boolean;
  escalated: boolean;
  created_at: Date;
  updated_at: Date;
}

export type AlertSeverity = 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertAuditLog {
  id: number;
  alert_id: number;
  from_status: string | null;
  to_status: string;
  changed_by: number | null;
  changed_at: Date;
}

export interface EscalationLog {
  id: number;
  alert_id: number;
  from_operator: number | null;
  to_supervisor: number | null;
  escalated_at: Date;
}

export interface Suppression {
  id: number;
  sensor_id: number;
  start_time: Date;
  end_time: Date;
  reason: string | null;
  created_by: number | null;
  created_at: Date;
}

// ============================================================
// API request/response types
// ============================================================

export interface IngestReading {
  sensor_id: string; // external sensor ID
  timestamp: string;
  voltage: number;
  current: number;
  temperature: number;
  status_code: number;
}

export interface IngestRequest {
  readings: IngestReading[];
}

export interface AuthUser {
  id: number;
  username: string;
  role: 'operator' | 'supervisor';
  zoneIds: number[];
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// Valid alert transitions
export const VALID_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  open: ['acknowledged', 'resolved'],
  acknowledged: ['resolved'],
  resolved: [],
};
