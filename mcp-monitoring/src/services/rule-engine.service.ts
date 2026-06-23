// =============================================================================
// RuleEngineService — evaluates alert rules against metric snapshots
// =============================================================================
// Supports:
//   - Instant trigger: sustained_minutes = 0
//   - Sustained trigger: condition must hold for N minutes in the window
//   - Cooldown: don't re-fire within cooldown_minutes
// =============================================================================

import type {
  AlertRule,
  AlertState,
  AlertCheckResult,
  MetricSnapshot,
  AlertEvent,
} from '../types/alert.types.js';

const log = {
  info: (msg: string) => console.log(`[RULE-ENGINE] ${new Date().toISOString()} ${msg}`),
  warn: (msg: string) => console.warn(`[RULE-ENGINE] ${new Date().toISOString()} ${msg}`),
};

export class RuleEngineService {
  // In-memory state per rule (reset on container restart — acceptable)
  private states = new Map<string, AlertState>();

  // ---------------------------------------------------------------------------
  // evaluate — run all enabled rules against the current snapshot + window
  // ---------------------------------------------------------------------------
  evaluate(
    snapshot: MetricSnapshot,
    rules: AlertRule[],
    getWindow: (minutes: number) => MetricSnapshot[]
  ): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const result = this.checkRule(rule, snapshot, getWindow);

      if (result.triggered) {
        const state = this.states.get(rule.id) ?? this.initState(rule.id);
        state.last_fired_at = new Date().toISOString();
        this.states.set(rule.id, state);

        const event: AlertEvent = {
          rule_id: rule.id,
          rule,
          severity: rule.severity,
          metric: rule.metric,
          current_value: result.current_value,
          threshold: rule.threshold,
          snapshot,
          fired_at: new Date().toISOString(),
        };
        events.push(event);
        log.info(`Rule TRIGGERED: "${rule.name}" (${rule.metric}=${result.current_value.toFixed(1)}% vs threshold=${rule.threshold}%)`);
      }
    }

    return events;
  }

  // ---------------------------------------------------------------------------
  // checkRule — single rule evaluation
  // ---------------------------------------------------------------------------
  private checkRule(
    rule: AlertRule,
    snapshot: MetricSnapshot,
    getWindow: (minutes: number) => MetricSnapshot[]
  ): AlertCheckResult {
    const currentValue = this.extractMetricValue(rule.metric, snapshot);
    const conditionMet = this.compareValue(currentValue, rule.threshold, rule.comparison);

    const state = this.states.get(rule.id) ?? this.initState(rule.id);

    // Update breach state
    if (conditionMet) {
      if (!state.first_breached_at) {
        state.first_breached_at = new Date().toISOString();
      }
      state.consecutive_breaches++;
    } else {
      // Condition no longer met — reset
      state.first_breached_at = undefined;
      state.consecutive_breaches = 0;
    }
    this.states.set(rule.id, state);

    // Check sustained requirement
    let sustained_met = false;
    if (!conditionMet) {
      sustained_met = false;
    } else if (rule.sustained_minutes === 0) {
      sustained_met = true;
    } else {
      // All snapshots in the last sustained_minutes window must have the condition met
      const window = getWindow(rule.sustained_minutes);
      if (window.length === 0) {
        sustained_met = false;
      } else {
        sustained_met = window.every(s =>
          this.compareValue(this.extractMetricValue(rule.metric, s), rule.threshold, rule.comparison)
        );
      }
    }

    // Check cooldown
    let skipped_cooldown = false;
    if (sustained_met && state.last_fired_at) {
      const elapsed = (Date.now() - new Date(state.last_fired_at).getTime()) / 60000;
      if (elapsed < rule.cooldown_minutes) {
        skipped_cooldown = true;
        sustained_met = false; // override — still in cooldown
        log.info(`Rule "${rule.name}" in cooldown (${elapsed.toFixed(1)}/${rule.cooldown_minutes} min elapsed)`);
      }
    }

    return {
      rule,
      current_value: currentValue,
      condition_met: conditionMet,
      triggered: sustained_met && !skipped_cooldown,
      skipped_cooldown,
      sustained_met,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private extractMetricValue(metric: AlertRule['metric'], snapshot: MetricSnapshot): number {
    switch (metric) {
      case 'cpu':  return snapshot.cpu.total_percent;
      case 'memory': return snapshot.memory.used_percent;
      case 'disk': return snapshot.disk.max_used_percent;
      case 'load': return snapshot.cpu.load_avg_1m;
      default:     return 0;
    }
  }

  private compareValue(value: number, threshold: number, comparison: AlertRule['comparison']): boolean {
    return comparison === 'gte' ? value >= threshold : value <= threshold;
  }

  private initState(ruleId: string): AlertState {
    const state: AlertState = {
      rule_id: ruleId,
      consecutive_breaches: 0,
    };
    this.states.set(ruleId, state);
    return state;
  }

  // Reset state when a rule is deleted/updated
  resetState(ruleId: string): void {
    this.states.delete(ruleId);
  }
}

export const ruleEngine = new RuleEngineService();
