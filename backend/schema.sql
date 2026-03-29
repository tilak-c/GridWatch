-- GridWatch Database Schema
-- Run: psql -U postgres -d gridwatch -f schema.sql

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ZONES
-- Geographic areas containing sensors
-- ============================================================
CREATE TABLE IF NOT EXISTS zones (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- Operators (zone-scoped) and supervisors (unrestricted)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'supervisor')),
  email         VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USER_ZONES
-- Many-to-many: which zones an operator can access
-- Supervisors have unrestricted access (enforced in app logic)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_zones (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id   INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, zone_id)
);

-- ============================================================
-- SENSORS
-- Physical sensors deployed across substations
-- ============================================================
CREATE TABLE IF NOT EXISTS sensors (
  id              SERIAL PRIMARY KEY,
  sensor_id       VARCHAR(100) NOT NULL UNIQUE, -- external identifier (e.g. "SENSOR-0001")
  name            VARCHAR(255) NOT NULL,
  zone_id         INTEGER NOT NULL REFERENCES zones(id),
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  status          VARCHAR(20) NOT NULL DEFAULT 'healthy'
                    CHECK (status IN ('healthy', 'warning', 'critical', 'silent')),
  last_reading_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Zone-scoped queries: GET /sensors, dashboard filtering
CREATE INDEX idx_sensors_zone_id ON sensors(zone_id);
-- Absence detection: find sensors with stale last_reading_at
CREATE INDEX idx_sensors_last_reading ON sensors(last_reading_at) WHERE last_reading_at IS NOT NULL;
-- Lookup by external sensor_id during ingestion (already UNIQUE, creates implicit index)

-- ============================================================
-- SENSOR_RULES
-- Per-sensor anomaly detection configuration
-- config examples:
--   threshold_breach: {"min_voltage": 210, "max_voltage": 250, "min_temp": -10, "max_temp": 85}
--   rate_of_change:   {"change_percent": 15}
--   pattern_absence:  {"silence_seconds": 120}
-- ============================================================
CREATE TABLE IF NOT EXISTS sensor_rules (
  id          SERIAL PRIMARY KEY,
  sensor_id   INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  rule_type   VARCHAR(30) NOT NULL
                CHECK (rule_type IN ('threshold_breach', 'rate_of_change', 'pattern_absence')),
  config      JSONB NOT NULL DEFAULT '{}',
  severity    VARCHAR(20) NOT NULL DEFAULT 'warning'
                CHECK (severity IN ('warning', 'critical')),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sensor_id, rule_type)
);

CREATE INDEX idx_sensor_rules_sensor ON sensor_rules(sensor_id);

-- ============================================================
-- READINGS
-- Raw sensor data — the highest-volume table
-- ============================================================
CREATE TABLE IF NOT EXISTS readings (
  id            BIGSERIAL PRIMARY KEY,
  sensor_id     INTEGER NOT NULL REFERENCES sensors(id),
  timestamp     TIMESTAMPTZ NOT NULL,
  voltage       DECIMAL(10, 4),
  current       DECIMAL(10, 4),
  temperature   DECIMAL(8, 4),
  status_code   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Critical for historical query performance (<300ms on 30 days):
-- Composite index on (sensor_id, timestamp DESC) enables efficient range scans
CREATE INDEX idx_readings_sensor_ts ON readings(sensor_id, "timestamp" DESC);

-- ============================================================
-- ANOMALIES
-- Detected anomalies linked to specific readings and rules
-- reading_id is NULL for Rule C (pattern absence) anomalies
-- ============================================================
CREATE TABLE IF NOT EXISTS anomalies (
  id          BIGSERIAL PRIMARY KEY,
  sensor_id   INTEGER NOT NULL REFERENCES sensors(id),
  reading_id  BIGINT REFERENCES readings(id),
  rule_type   VARCHAR(30) NOT NULL,
  details     JSONB,
  suppressed  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Join performance for historical query (readings → anomalies)
CREATE INDEX idx_anomalies_reading ON anomalies(reading_id) WHERE reading_id IS NOT NULL;
-- Sensor-scoped anomaly listing
CREATE INDEX idx_anomalies_sensor ON anomalies(sensor_id, created_at DESC);

-- ============================================================
-- ALERTS
-- Alert lifecycle: open → acknowledged → resolved
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id          BIGSERIAL PRIMARY KEY,
  anomaly_id  BIGINT NOT NULL REFERENCES anomalies(id),
  sensor_id   INTEGER NOT NULL REFERENCES sensors(id),
  zone_id     INTEGER NOT NULL REFERENCES zones(id),
  severity    VARCHAR(20) NOT NULL CHECK (severity IN ('warning', 'critical')),
  status      VARCHAR(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'acknowledged', 'resolved')),
  assigned_to INTEGER REFERENCES users(id),
  suppressed  BOOLEAN NOT NULL DEFAULT false,
  escalated   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Filtered alert listing (<150ms): zone-scoped with status filter
CREATE INDEX idx_alerts_zone_status ON alerts(zone_id, status);
-- Sensor-specific alert queries
CREATE INDEX idx_alerts_sensor ON alerts(sensor_id, created_at DESC);
-- Escalation worker: find critical open un-escalated alerts older than 5 min
CREATE INDEX idx_alerts_escalation ON alerts(created_at)
  WHERE severity = 'critical' AND status = 'open' AND escalated = false;
-- General status filter
CREATE INDEX idx_alerts_status ON alerts(status);

-- ============================================================
-- ALERT_AUDIT_LOG
-- Append-only record of every status transition
-- No UPDATE or DELETE ever runs on this table
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  alert_id    BIGINT NOT NULL REFERENCES alerts(id),
  from_status VARCHAR(20),
  to_status   VARCHAR(20) NOT NULL,
  changed_by  INTEGER REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_alert ON alert_audit_log(alert_id);

-- ============================================================
-- ESCALATION_LOG
-- Records of auto-escalated alerts
-- UNIQUE on alert_id ensures exactly-once escalation
-- ============================================================
CREATE TABLE IF NOT EXISTS escalation_log (
  id              BIGSERIAL PRIMARY KEY,
  alert_id        BIGINT NOT NULL REFERENCES alerts(id) UNIQUE,
  from_operator   INTEGER REFERENCES users(id),
  to_supervisor   INTEGER REFERENCES users(id),
  escalated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUPPRESSIONS
-- Time-windowed alert suppression per sensor
-- ============================================================
CREATE TABLE IF NOT EXISTS suppressions (
  id          SERIAL PRIMARY KEY,
  sensor_id   INTEGER NOT NULL REFERENCES sensors(id),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

-- Active suppression check: is sensor currently suppressed?
CREATE INDEX idx_suppressions_active ON suppressions(sensor_id, start_time, end_time);
