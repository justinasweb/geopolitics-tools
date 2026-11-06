// The data pipeline's outside watch, run hourly by the Worker's Cron Trigger (decision D11), so it
// does not depend on the thing it watches:
//   1. If no data run has started in the last 50 minutes (GitHub's own schedule is best-effort and
//      can skip hours), start one through the GitHub API. Needs GH_DISPATCH_TOKEN: a fine-grained
//      token for this repository with "Actions: read and write". Runs share a concurrency group, so a
//      late scheduled run and this one never overlap.
//   2. If the published status.json is older than 6 hours, alert on Telegram: once when it crosses
//      6 hours, then once a day while it lasts. Needs the SNAPSHOTS binding and the Telegram secrets.
//   3. If status.json is missing, not valid, or cannot be read, alert too, at most once in 24 hours: the time of the
//      last such alert is kept in the same bucket (ALERT_KEY). Without that record (the bucket cannot be read or
//      written) it alerts only in the FALLBACK_HOUR, which is also once a day.

import { gh, type GitHubEnv } from './github';

export interface WatchEnv extends GitHubEnv {
  SNAPSHOTS?: R2Bucket;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

const WORKFLOW = 'data.yml';
const H = 3_600_000;
const ALERT_KEY = 'watch/status-alert.json';
const FALLBACK_HOUR = 8;

export interface WatchResult {
  dispatched: boolean | null;
  lastRun?: string;
  statusAgeHours?: number;
  /** Why the status could not be aged. */
  statusProblem?: 'missing' | 'invalid' | 'unreadable';
  alerted: boolean;
  errors: string[];
}

/** Alert when the status first passes 6 hours old, then once in each later 24-hour period (the trigger runs hourly). */
export const shouldAlert = (ageHours: number) => (ageHours >= 6 && ageHours < 7) || (ageHours >= 24 && ageHours % 24 < 1);

export async function watch(env: WatchEnv, now: Date): Promise<WatchResult> {
  const out: WatchResult = { dispatched: null, alerted: false, errors: [] };

  if (env.GH_DISPATCH_TOKEN) {
    try {
      const res = await gh(env, `/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=10`);
      if (!res.ok) throw new Error(`listing runs: HTTP ${res.status}`);
      const runs = ((await res.json()) as { workflow_runs?: { event: string; created_at: string }[] }).workflow_runs ?? [];
      const last = runs.find((r) => r.event === 'schedule' || r.event === 'workflow_dispatch');
      out.lastRun = last?.created_at;
      out.dispatched = false;
      if (!last || now.getTime() - Date.parse(last.created_at) > 50 * 60_000) {
        const d = await gh(env, `/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
        if (!d.ok) throw new Error(`starting a run: HTTP ${d.status}`);
        out.dispatched = true;
      }
    } catch (e) {
      out.errors.push(`GitHub: ${(e as Error).message}`);
    }
  }

  let problem: string | null = null;
  if (env.SNAPSHOTS) {
    let obj: R2ObjectBody | null = null;
    try {
      obj = await env.SNAPSHOTS.get('status.json');
      if (!obj) out.statusProblem = 'missing';
    } catch (e) {
      out.statusProblem = 'unreadable';
      out.errors.push(`status.json: ${(e as Error).message}`);
    }
    if (obj) {
      try {
        const generated = Date.parse(String(((await obj.json()) as { generated?: unknown }).generated ?? ''));
        if (Number.isNaN(generated)) out.statusProblem = 'invalid';
        else out.statusAgeHours = Math.round(((now.getTime() - generated) / H) * 10) / 10;
      } catch {
        out.statusProblem = 'invalid';
      }
    }
    if (out.statusAgeHours !== undefined && shouldAlert(out.statusAgeHours)) {
      problem = `⏰ geopolitics.tools data: no pipeline run has finished for ${Math.floor(out.statusAgeHours)} hours. Check Actions → data.`;
    } else if (out.statusProblem && (await dailyTurn(env.SNAPSHOTS, now, out.errors))) {
      problem = `⏰ geopolitics.tools data: status.json is ${out.statusProblem === 'missing' ? 'missing' : out.statusProblem === 'invalid' ? 'not valid' : 'unreadable'}, so the data's age is unknown. Check Actions → data.`;
    }
  }

  if (problem && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: problem }),
    });
    out.alerted = res.ok;
    if (!res.ok) out.errors.push(`Telegram: HTTP ${res.status}`);
  }
  return out;
}

/**
 * Whether a status problem may alert now: when the last such alert (ALERT_KEY) is 24 hours old or more, or there is
 * none. The new time is written before the alert goes out; if the record cannot be read or written, only the
 * FALLBACK_HOUR alerts.
 */
async function dailyTurn(bucket: R2Bucket, now: Date, errors: string[]): Promise<boolean> {
  try {
    const last = await bucket.get(ALERT_KEY);
    // A record that is not JSON counts as none, and is written over.
    const at = last ? Date.parse(String(((await last.json().catch(() => ({}))) as { at?: unknown }).at ?? '')) : NaN;
    if (now.getTime() - at < 24 * H) return false;
    await bucket.put(ALERT_KEY, JSON.stringify({ at: now.toISOString() }));
    return true;
  } catch (e) {
    errors.push(`${ALERT_KEY}: ${(e as Error).message}`);
    return now.getUTCHours() === FALLBACK_HOUR;
  }
}
