import type { QualityByModel, QualityScore, QualitySummary } from './types';
import { isLangfuseConfigured, type LangfuseConfig } from './langfuse';

const DEFAULT_TIMEOUT = 15000;

/** Typed error for failed Langfuse Metrics API responses. */
export class LangfuseUpstreamError extends Error {
  status: number;

  constructor(status: number, statusText: string) {
    super(`Langfuse API error: ${status} ${statusText}`);
    this.status = status;
  }
}

/**
 * Runs one Langfuse Metrics API v2 query:
 * GET {baseUrl}/api/public/v2/metrics with Basic auth (publicKey:secretKey)
 * and `query` = the JSON query object.
 */
export async function queryMetrics(
  baseUrl: string,
  publicKey: string,
  secretKey: string,
  queryObj: unknown,
  timeout = DEFAULT_TIMEOUT,
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/public/v2/metrics?query=${encodeURIComponent(
      JSON.stringify(queryObj),
    )}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
      },
    });
    if (!response.ok) {
      throw new LangfuseUpstreamError(response.status, response.statusText);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** First finite number found across the row, its metrics nest, and its dimensions nest. */
function pick(row: any, names: string[]): number | null {
  const scopes = [row, row?.metrics, row?.dimensions];
  for (const scope of scopes) {
    if (!scope || typeof scope !== 'object') continue;
    for (const name of names) {
      const n = toNum(scope[name]);
      if (n !== null) return n;
    }
  }
  return null;
}

function pickText(row: any, names: string[]): string | null {
  const scopes = [row, row?.metrics, row?.dimensions];
  for (const scope of scopes) {
    if (!scope || typeof scope !== 'object') continue;
    for (const name of names) {
      const v = scope[name];
      if (typeof v === 'string' && v) return v;
    }
  }
  return null;
}

function metricRows(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.rows)) return body.rows;
  return [];
}

function parseObservations(body: any): QualityByModel[] {
  const byModel = metricRows(body)
    .map(row => ({
      model: pickText(row, ['providedModelName', 'model', 'modelName']) ?? '',
      cost: pick(row, ['sum_totalCost', 'totalCost', 'sum_total_cost', 'cost', 'sum_cost']) ?? 0,
      tokens:
        pick(row, ['sum_totalTokens', 'totalTokens', 'sum_total_tokens', 'tokens']) ?? 0,
      avgLatencyMs: pick(row, ['avg_latency', 'latency', 'avg_latency_ms', 'latencyMs']),
      requests:
        pick(row, ['count_id', 'count', 'id_count', 'requests', 'observations']) ?? 0,
    }))
    .filter((r): r is QualityByModel => r.model !== '');
  byModel.sort((a, b) => b.cost - a.cost);
  return byModel;
}

function parseScores(body: any): QualityScore[] {
  const scores = metricRows(body)
    .map(row => ({
      name: pickText(row, ['name', 'scoreName']) ?? '',
      avg: pick(row, ['avg_value', 'value', 'avg']) ?? NaN,
      count: pick(row, ['count_id', 'count', 'id_count', 'scores']) ?? 0,
    }))
    .filter(s => s.name !== '' && Number.isFinite(s.avg));
  scores.sort((a, b) => a.name.localeCompare(b.name));
  return scores;
}

function toTimestamp(day: string, endOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return endOfDay ? `${day}T23:59:59.999Z` : `${day}T00:00:00.000Z`;
  }
  return day;
}

/**
 * Returns the caller's quality summary, or null when Langfuse is disabled,
 * unconfigured, unreachable, or a v3 server without the v2 metrics endpoint
 * (non-2xx degrades to null — never throws).
 */
export async function getQualitySummary(
  cfg: LangfuseConfig,
  opts: { from: string; to: string; userId: string },
): Promise<QualitySummary | null> {
  if (!isLangfuseConfigured(cfg)) return null;
  const { baseUrl, publicKey, secretKey, userIdField } = cfg;
  const fromTimestamp = toTimestamp(opts.from, false);
  const toTimestampValue = toTimestamp(opts.to, true);
  try {
    const observations = await queryMetrics(baseUrl, publicKey, secretKey, {
      view: 'observations',
      metrics: [
        { measure: 'totalCost', aggregation: 'SUM' },
        { measure: 'totalTokens', aggregation: 'SUM' },
        { measure: 'latency', aggregation: 'AVG' },
        { measure: 'id', aggregation: 'COUNT' },
      ],
      dimensions: [{ field: 'providedModelName' }],
      filters: [
        { column: userIdField, operator: '=', value: opts.userId, type: 'string' },
      ],
      fromTimestamp,
      toTimestamp: toTimestampValue,
      config: { row_limit: 50 },
    });
    // Scores are deployment-wide: the scores view does not reliably carry the
    // trace user join key, so filtering it would silently drop every row.
    let scores: QualityScore[] = [];
    try {
      const scoresBody = await queryMetrics(baseUrl, publicKey, secretKey, {
        view: 'scores-numeric',
        metrics: [
          { measure: 'value', aggregation: 'AVG' },
          { measure: 'id', aggregation: 'COUNT' },
        ],
        dimensions: [{ field: 'name' }],
        fromTimestamp,
        toTimestamp: toTimestampValue,
        config: { row_limit: 50 },
      });
      scores = parseScores(scoresBody);
    } catch {
      scores = [];
    }
    return { configured: true, byModel: parseObservations(observations), scores };
  } catch {
    return null;
  }
}
