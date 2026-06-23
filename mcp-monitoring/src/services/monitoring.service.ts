// =============================================================================
// MonitoringService — collects real-time metric snapshots
// =============================================================================
// Runs a collection loop (default every 30s).
// Maintains a sliding window of the last 15 minutes for sustained-rule checks.
// =============================================================================

import { getCpuUsage } from '../tools/cpu.js';
import { getMemoryUsage } from '../tools/memory.js';
import { getDiskUsage } from '../tools/disk.js';
import type { MetricSnapshot } from '../types/alert.types.js';
import { config } from '../config/index.js';

const log = {
  info: (msg: string) => console.log(`[MONITORING] ${new Date().toISOString()} ${msg}`),
  warn: (msg: string) => console.warn(`[MONITORING] ${new Date().toISOString()} ${msg}`),
  error: (msg: string, e?: unknown) => console.error(`[MONITORING] ${new Date().toISOString()} ${msg}`, e ?? ''),
};

// Keep snapshots for up to 15 minutes at 30s interval = 30 snapshots
const WINDOW_SIZE = 30;

export class MonitoringService {
  private snapshots: MetricSnapshot[] = [];
  private timer: NodeJS.Timeout | null = null;
  private onSnapshot?: (snapshot: MetricSnapshot) => void;

  // ---------------------------------------------------------------------------
  // Start / Stop
  // ---------------------------------------------------------------------------
  start(onSnapshot: (snapshot: MetricSnapshot) => void): void {
    this.onSnapshot = onSnapshot;
    const intervalMs = config.alert.intervalSeconds * 1000;
    log.info(`Starting monitoring loop every ${config.alert.intervalSeconds}s`);

    // collect immediately on start
    this.collect().catch(e => log.error('Initial collection failed:', e));

    this.timer = setInterval(async () => {
      try {
        await this.collect();
      } catch (e) {
        log.error('Collection error:', e);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info('Monitoring loop stopped.');
    }
  }

  // ---------------------------------------------------------------------------
  // Collect a single snapshot
  // ---------------------------------------------------------------------------
  async collect(): Promise<MetricSnapshot> {
    const [cpuResult, memResult, diskResult] = await Promise.all([
      getCpuUsage(),
      getMemoryUsage(),
      getDiskUsage(),
    ]);

    const snapshot: MetricSnapshot = {
      timestamp: new Date().toISOString(),
      cpu: {
        total_percent: cpuResult.data?.loadAvg?.oneMin
          ? Math.min((cpuResult.data.loadAvg.oneMin / (cpuResult.data?.cores ?? 1)) * 100, 100)
          : cpuResult.data?.totalPercent ?? 0,
        load_avg_1m: cpuResult.data?.loadAvg?.oneMin ?? 0,
        load_avg_5m: cpuResult.data?.loadAvg?.fiveMin ?? 0,
        cores: cpuResult.data?.cores ?? 1,
      },
      memory: {
        used_percent: memResult.data?.usedPercent ?? 0,
        used_mb: memResult.data?.usedMb ?? 0,
        total_mb: memResult.data?.totalMb ?? 0,
      },
      disk: {
        max_used_percent: 0,
        partitions: [],
      },
    };

    // Build disk partitions
    if (diskResult.data && Array.isArray(diskResult.data)) {
      const partitions = (diskResult.data as any[])
        .filter((p: any) => p.mountpoint && p.usedPercent !== undefined)
        .map((p: any) => ({ mountpoint: p.mountpoint as string, used_percent: p.usedPercent as number }));
      snapshot.disk.partitions = partitions;
      snapshot.disk.max_used_percent = partitions.length > 0
        ? Math.max(...partitions.map(p => p.used_percent))
        : 0;
    }

    // Maintain sliding window
    this.snapshots.push(snapshot);
    if (this.snapshots.length > WINDOW_SIZE) {
      this.snapshots.shift();
    }

    log.info(`Snapshot: CPU=${snapshot.cpu.total_percent.toFixed(1)}% MEM=${snapshot.memory.used_percent.toFixed(1)}% DISK=${snapshot.disk.max_used_percent.toFixed(1)}%`);

    if (this.onSnapshot) {
      this.onSnapshot(snapshot);
    }

    return snapshot;
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------
  getLatestSnapshot(): MetricSnapshot | null {
    return this.snapshots.at(-1) ?? null;
  }

  /**
   * Returns snapshots from the last N minutes.
   * Used by RuleEngine to check sustained conditions.
   */
  getSnapshotsInLastMinutes(minutes: number): MetricSnapshot[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.snapshots.filter(s => new Date(s.timestamp).getTime() >= cutoff);
  }

  getWindowSize(): number {
    return this.snapshots.length;
  }
}

export const monitoringService = new MonitoringService();
