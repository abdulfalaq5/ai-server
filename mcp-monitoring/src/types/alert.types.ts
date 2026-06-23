// =============================================================================
// Alert Types
// =============================================================================

export type AlertMetric = 'cpu' | 'memory' | 'disk' | 'load';
export type AlertSeverity = 'warning' | 'critical';
export type AlertComparison = 'gte' | 'lte'; // gte = >=, lte = <=

// ---------------------------------------------------------------------------
// AlertRule — persisted configuration for a single alert condition
// ---------------------------------------------------------------------------
export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;           // e.g. 80 (percent)
  comparison: AlertComparison;
  sustained_minutes: number;   // 0 = instant trigger, >0 = must hold for N minutes
  cooldown_minutes: number;    // min minutes between repeated notifications
  severity: AlertSeverity;
  enabled: boolean;
  is_default: boolean;         // true = bundled default rule
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// AlertState — runtime state tracked per rule (not persisted across restarts)
// ---------------------------------------------------------------------------
export interface AlertState {
  rule_id: string;
  last_fired_at?: string;      // ISO timestamp of last notification sent
  first_breached_at?: string;  // when sustained condition started (for sustained_minutes)
  consecutive_breaches: number; // how many consecutive snapshots the condition was true
}

// ---------------------------------------------------------------------------
// MetricSnapshot — a point-in-time reading of all monitored metrics
// ---------------------------------------------------------------------------
export interface MetricSnapshot {
  timestamp: string;
  cpu: {
    total_percent: number;
    load_avg_1m: number;
    load_avg_5m: number;
    cores: number;
  };
  memory: {
    used_percent: number;
    used_mb: number;
    total_mb: number;
  };
  disk: {
    max_used_percent: number;  // worst partition
    partitions: Array<{ mountpoint: string; used_percent: number }>;
  };
}

// ---------------------------------------------------------------------------
// AlertEvent — fired when a rule condition is met and cooldown has passed
// ---------------------------------------------------------------------------
export interface AlertEvent {
  rule_id: string;
  rule: AlertRule;
  severity: AlertSeverity;
  metric: AlertMetric;
  current_value: number;
  threshold: number;
  snapshot: MetricSnapshot;
  fired_at: string;
}

// ---------------------------------------------------------------------------
// AlertCheckResult — internal result of evaluating one rule
// ---------------------------------------------------------------------------
export interface AlertCheckResult {
  rule: AlertRule;
  current_value: number;
  condition_met: boolean;      // threshold is breached right now
  triggered: boolean;          // condition_met + sustained + cooldown passed
  skipped_cooldown: boolean;
  sustained_met: boolean;
}

// ---------------------------------------------------------------------------
// NotificationPayload — sent from ai-server → ai-spv → OpenClaw
// ---------------------------------------------------------------------------
export interface NotificationPayload {
  severity: AlertSeverity;
  metric: AlertMetric;
  current_value: number;
  threshold: number;
  rule_name: string;
  analysis: string;
  fired_at: string;
}
