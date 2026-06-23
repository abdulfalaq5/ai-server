// =============================================================================
// AlertRepository — persists alert rules to a JSON file
// =============================================================================
// Uses /data/alert-rules.json (mounted Docker volume) for persistence.
// On first run (empty or missing file), seeds the default rule set.
// =============================================================================

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { AlertRule, AlertMetric, AlertSeverity, AlertComparison } from '../types/alert.types.js';
import { config } from '../config/index.js';

const log = {
  info: (msg: string) => console.log(`[ALERT-REPO] ${new Date().toISOString()} ${msg}`),
  warn: (msg: string) => console.warn(`[ALERT-REPO] ${new Date().toISOString()} ${msg}`),
  error: (msg: string, e?: unknown) => console.error(`[ALERT-REPO] ${new Date().toISOString()} ${msg}`, e ?? ''),
};

// ---------------------------------------------------------------------------
// Default rules seeded on first start
// ---------------------------------------------------------------------------
const DEFAULT_RULES: Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'CPU Warning',
    metric: 'cpu',
    threshold: 80,
    comparison: 'gte',
    sustained_minutes: 5,
    cooldown_minutes: 30,
    severity: 'warning',
    enabled: true,
    is_default: true,
  },
  {
    name: 'CPU Critical',
    metric: 'cpu',
    threshold: 90,
    comparison: 'gte',
    sustained_minutes: 0,
    cooldown_minutes: 15,
    severity: 'critical',
    enabled: true,
    is_default: true,
  },
  {
    name: 'Memory Warning',
    metric: 'memory',
    threshold: 85,
    comparison: 'gte',
    sustained_minutes: 5,
    cooldown_minutes: 30,
    severity: 'warning',
    enabled: true,
    is_default: true,
  },
  {
    name: 'Memory Critical',
    metric: 'memory',
    threshold: 95,
    comparison: 'gte',
    sustained_minutes: 0,
    cooldown_minutes: 15,
    severity: 'critical',
    enabled: true,
    is_default: true,
  },
  {
    name: 'Disk Critical',
    metric: 'disk',
    threshold: 90,
    comparison: 'gte',
    sustained_minutes: 0,
    cooldown_minutes: 60,
    severity: 'critical',
    enabled: true,
    is_default: true,
  },
];

// ---------------------------------------------------------------------------
// AlertRepositoryService
// ---------------------------------------------------------------------------
export class AlertRepositoryService {
  private filePath: string;

  constructor() {
    this.filePath = config.alert.dataPath;
  }

  // ---------------------------------------------------------------------------
  // Init — ensure data directory + file exist; seed defaults if empty
  // ---------------------------------------------------------------------------
  async init(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log.info(`Created data directory: ${dir}`);
    }

    if (!fs.existsSync(this.filePath)) {
      const now = new Date().toISOString();
      const defaults: AlertRule[] = DEFAULT_RULES.map(r => ({
        ...r,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      }));
      this._write(defaults);
      log.info(`Seeded ${defaults.length} default alert rules.`);
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------
  getAll(): AlertRule[] {
    return this._read();
  }

  getEnabled(): AlertRule[] {
    return this._read().filter(r => r.enabled);
  }

  getById(id: string): AlertRule | undefined {
    return this._read().find(r => r.id === id);
  }

  create(data: {
    name: string;
    metric: AlertMetric;
    threshold: number;
    comparison?: AlertComparison;
    sustained_minutes?: number;
    cooldown_minutes?: number;
    severity?: AlertSeverity;
  }): AlertRule {
    const rules = this._read();
    const now = new Date().toISOString();
    const rule: AlertRule = {
      id: randomUUID(),
      name: data.name,
      metric: data.metric,
      threshold: data.threshold,
      comparison: data.comparison ?? 'gte',
      sustained_minutes: data.sustained_minutes ?? 0,
      cooldown_minutes: data.cooldown_minutes ?? 15,
      severity: data.severity ?? 'warning',
      enabled: true,
      is_default: false,
      created_at: now,
      updated_at: now,
    };
    rules.push(rule);
    this._write(rules);
    log.info(`Created alert rule: ${rule.name} (${rule.id})`);
    return rule;
  }

  update(id: string, patch: Partial<Omit<AlertRule, 'id' | 'created_at' | 'is_default'>>): AlertRule | null {
    const rules = this._read();
    const idx = rules.findIndex(r => r.id === id);
    if (idx === -1) return null;
    rules[idx] = { ...rules[idx], ...patch, updated_at: new Date().toISOString() };
    this._write(rules);
    log.info(`Updated alert rule: ${rules[idx].name} (${id})`);
    return rules[idx];
  }

  delete(id: string): boolean {
    const rules = this._read();
    const filtered = rules.filter(r => r.id !== id);
    if (filtered.length === rules.length) return false;
    this._write(filtered);
    log.info(`Deleted alert rule: ${id}`);
    return true;
  }

  deleteAll(): number {
    const rules = this._read();
    const count = rules.length;
    this._write([]);
    log.info(`Deleted all ${count} alert rules.`);
    return count;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  private _read(): AlertRule[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as AlertRule[];
    } catch (e) {
      log.error('Failed to read alert rules file:', e);
      return [];
    }
  }

  private _write(rules: AlertRule[]): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(rules, null, 2), 'utf-8');
    } catch (e) {
      log.error('Failed to write alert rules file:', e);
    }
  }
}

export const alertRepository = new AlertRepositoryService();
