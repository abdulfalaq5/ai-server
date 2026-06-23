// =============================================================================
// NotificationService — dispatches alerts via pluggable adapters
// =============================================================================
// Uses the Adapter pattern: register any INotificationAdapter and all of them
// will receive every alert. Add new channels without touching core code.
// =============================================================================

import type { AlertEvent, NotificationPayload } from '../types/alert.types.js';

const log = {
  info: (msg: string) => console.log(`[NOTIFY] ${new Date().toISOString()} ${msg}`),
  warn: (msg: string) => console.warn(`[NOTIFY] ${new Date().toISOString()} ${msg}`),
  error: (msg: string, e?: unknown) => console.error(`[NOTIFY] ${new Date().toISOString()} ${msg}`, e ?? ''),
};

// ---------------------------------------------------------------------------
// INotificationAdapter — interface all adapters must implement
// ---------------------------------------------------------------------------
export interface INotificationAdapter {
  name: string;
  send(payload: NotificationPayload): Promise<void>;
}

// ---------------------------------------------------------------------------
// SpvNotificationAdapter — POSTs alert to ai-spv /notify endpoint
// ai-spv then forwards to OpenClaw which delivers to Telegram/Discord/UI
// ---------------------------------------------------------------------------
import axios from 'axios';
import { config } from '../config/index.js';

export class SpvNotificationAdapter implements INotificationAdapter {
  name = 'ai-spv';

  async send(payload: NotificationPayload): Promise<void> {
    const url = `${config.spv.endpoint}/notify`;
    try {
      await axios.post(url, payload, {
        timeout: 15_000,
        headers: { 'Content-Type': 'application/json' },
      });
      log.info(`Alert sent to ai-spv: ${payload.rule_name} (${payload.severity})`);
    } catch (e: any) {
      log.error(`Failed to send alert to ai-spv at ${url}: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------
export class NotificationService {
  private adapters: INotificationAdapter[] = [];

  addAdapter(adapter: INotificationAdapter): void {
    this.adapters.push(adapter);
    log.info(`Registered notification adapter: ${adapter.name}`);
  }

  async dispatch(event: AlertEvent, analysis: string): Promise<void> {
    if (this.adapters.length === 0) {
      log.warn('No notification adapters registered — alert dropped.');
      return;
    }

    const payload: NotificationPayload = {
      severity: event.severity,
      metric: event.metric,
      current_value: event.current_value,
      threshold: event.threshold,
      rule_name: event.rule.name,
      analysis,
      fired_at: event.fired_at,
    };

    const results = await Promise.allSettled(
      this.adapters.map(adapter => adapter.send(payload))
    );

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        log.error(`Adapter "${this.adapters[i].name}" failed:`, result.reason);
      }
    });
  }
}

export const notificationService = new NotificationService();

// Register the default SPV adapter immediately
notificationService.addAdapter(new SpvNotificationAdapter());
