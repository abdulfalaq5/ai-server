// =============================================================================
// AIAnalysisService — generates human-readable alert analysis via LLM
// =============================================================================
// When a rule fires, this service builds a context-aware prompt and calls
// the configured LLM to produce a clear, actionable Indonesian-language summary.
// =============================================================================

import OpenAI from 'openai';
import { config } from '../config/index.js';
import type { AlertEvent } from '../types/alert.types.js';

const log = {
  info: (msg: string) => console.log(`[AI-ANALYSIS] ${new Date().toISOString()} ${msg}`),
  error: (msg: string, e?: unknown) => console.error(`[AI-ANALYSIS] ${new Date().toISOString()} ${msg}`, e ?? ''),
};

const FALLBACK_ANALYSIS = (event: AlertEvent) =>
  `⚠️ *Alert ${event.severity.toUpperCase()}*: ${event.rule.name}\n` +
  `Metrik ${event.metric} saat ini: *${event.current_value.toFixed(1)}%* ` +
  `(ambang batas: ${event.threshold}%).\n` +
  `Silakan segera periksa kondisi server.`;

export class AIAnalysisService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseUrl,
    });
  }

  async analyze(event: AlertEvent): Promise<string> {
    if (!config.openai.apiKey) {
      // log.warn('OPENAI_API_KEY not set — returning fallback analysis.');
      return FALLBACK_ANALYSIS(event);
    }

    const { rule, metric, current_value, threshold, snapshot, severity } = event;

    const systemPrompt = `Kamu adalah AI DevOps Analyst yang ahli dalam analisis infrastruktur server.
Tugasmu: ketika terjadi alert server, berikan analisis SINGKAT (maksimal 5 kalimat) dalam Bahasa Indonesia yang mencakup:
1. Kondisi yang terdeteksi (fakta berdasarkan data)
2. Kemungkinan penyebab
3. Dampak yang mungkin terjadi
4. Rekomendasi tindakan segera

Format output dengan emoji untuk readability. Jangan gunakan kata teknis yang tidak perlu.`;

    const metricLabel: Record<string, string> = {
      cpu: 'CPU',
      memory: 'RAM/Memory',
      disk: 'Disk',
      load: 'Load Average',
    };

    const userPrompt = `
Alert ${severity.toUpperCase()} terjadi pada server!

Data saat ini:
- Metrik: ${metricLabel[metric] ?? metric}
- Nilai saat ini: ${current_value.toFixed(1)}%
- Ambang batas rule "${rule.name}": ${threshold}%
- Severity: ${severity}
- Sustained selama: ${rule.sustained_minutes} menit
${rule.sustained_minutes > 0 ? `(kondisi ini sudah berlangsung setidaknya ${rule.sustained_minutes} menit)` : '(kondisi langsung terdeteksi)'}

Snapshot server saat ini:
- CPU: ${snapshot.cpu.total_percent.toFixed(1)}% (Load avg 1m: ${snapshot.cpu.load_avg_1m.toFixed(2)}, cores: ${snapshot.cpu.cores})
- RAM: ${snapshot.memory.used_percent.toFixed(1)}% (${snapshot.memory.used_mb}MB / ${snapshot.memory.total_mb}MB)
- Disk terpadat: ${snapshot.disk.max_used_percent.toFixed(1)}%
${snapshot.disk.partitions.map(p => `  - ${p.mountpoint}: ${p.used_percent.toFixed(1)}%`).join('\n')}

Berikan analisis singkat dan actionable.
`.trim();

    try {
      log.info(`Analyzing alert: "${rule.name}" (${metric}=${current_value.toFixed(1)}%)`);
      const response = await this.openai.chat.completions.create(
        {
          model: config.openai.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 600,
        },
        { timeout: 30_000 }
      );
      const content = response.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('Empty response from LLM');
      log.info(`Analysis generated (${content.length} chars)`);
      return content;
    } catch (e: any) {
      log.error('LLM analysis failed, using fallback:', e.message);
      return FALLBACK_ANALYSIS(event);
    }
  }
}

export const aiAnalysisService = new AIAnalysisService();
