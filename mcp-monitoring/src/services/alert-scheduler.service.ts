// =============================================================================
// AlertSchedulerService — orchestrates the full alert pipeline
// =============================================================================
// Flow every N seconds:
//   MonitoringService.collect()
//     → RuleEngine.evaluate()
//       → AIAnalysisService.analyze() (per triggered event)
//         → NotificationService.dispatch()
// =============================================================================

import { monitoringService } from './monitoring.service.js';
import { ruleEngine } from './rule-engine.service.js';
import { aiAnalysisService } from './ai-analysis.service.js';
import { notificationService } from './notification.service.js';
import { alertRepository } from './alert-repository.service.js';
import type { MetricSnapshot } from '../types/alert.types.js';

const log = {
  info: (msg: string) => console.log(`[SCHEDULER] ${new Date().toISOString()} ${msg}`),
  warn: (msg: string) => console.warn(`[SCHEDULER] ${new Date().toISOString()} ${msg}`),
  error: (msg: string, e?: unknown) => console.error(`[SCHEDULER] ${new Date().toISOString()} ${msg}`, e ?? ''),
};

export class AlertSchedulerService {
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Ensure data directory and default rules exist
    await alertRepository.init();

    log.info('Alert Scheduler started — pipeline: Monitor → RuleEngine → AIAnalysis → Notify');

    // Start monitoring loop — callback fires on each new snapshot
    monitoringService.start(async (snapshot: MetricSnapshot) => {
      if (!this.running) return;
      await this.processSnapshot(snapshot);
    });
  }

  stop(): void {
    this.running = false;
    monitoringService.stop();
    log.info('Alert Scheduler stopped.');
  }

  // ---------------------------------------------------------------------------
  // processSnapshot — evaluate rules and dispatch any triggered events
  // ---------------------------------------------------------------------------
  private async processSnapshot(snapshot: MetricSnapshot): Promise<void> {
    const rules = alertRepository.getEnabled();
    if (rules.length === 0) return;

    const events = ruleEngine.evaluate(
      snapshot,
      rules,
      (minutes) => monitoringService.getSnapshotsInLastMinutes(minutes)
    );

    if (events.length === 0) return;

    log.info(`${events.length} rule(s) triggered — running AI analysis...`);

    // Analyze and dispatch each event (sequentially to avoid LLM rate limits)
    for (const event of events) {
      try {
        const analysis = await aiAnalysisService.analyze(event);
        await notificationService.dispatch(event, analysis);
      } catch (e) {
        log.error(`Failed to process event for rule "${event.rule.name}":`, e);
      }
    }
  }
}

export const alertScheduler = new AlertSchedulerService();
