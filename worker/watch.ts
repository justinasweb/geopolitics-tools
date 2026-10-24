// The data pipeline's outside watch, run hourly by the Worker's Cron Trigger (decision D11), so it
// does not depend on the thing it watches:
//   1. If no data run has started in the last 50 minutes (GitHub's own schedule is best-effort and
//      can skip hours), start one through the GitHub API. Needs GH_DISPATCH_TOKEN: a fine-grained
//      token for this repository with "Actions: read and write". Runs share a concurrency group, so a
//      late scheduled run and this one never overlap.
//   2. If the published status.json is older than 6 hours, alert on Telegram: once when it crosses
//      6 hours, then once a day while it lasts. Needs the SNAPSHOTS binding and the Telegram secrets.

export interface WatchEnv {
  SNAPSHOTS?: R2Bucket;
  GH_DISPATCH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** owner/name; defaults to the project's repository. */
  GH_REPO?: string;
}

const REPO = 'justinasweb/geopolitics-tools';
const WORKFLOW = 'data.yml';
const H = 3_600_000;

export interface WatchResult {
  dispatched: boolean | null;
  lastRun?: string;
  statusAgeHours?: number;
  alerted: boolean;
  errors: string[];
}

const gh = (env: WatchEnv, path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com/repos/${env.GH_REPO ?? REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'geopolitics-tools-watch',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

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

  if (env.SNAPSHOTS) {
    try {
      const obj = await env.SNAPSHOTS.get('status.json');
      const generated = obj ? ((await obj.json()) as { generated?: string }).generated : undefined;
      out.statusAgeHours = generated ? Math.round(((now.getTime() - Date.parse(generated)) / H) * 10) / 10 : Infinity;
    } catch (e) {
      out.errors.push(`status.json: ${(e as Error).message}`);
    }
  }

  const problem = out.statusAgeHours !== undefined && shouldAlert(out.statusAgeHours)
    ? `⏰ geopolitics.tools data: no pipeline run has finished for ${Number.isFinite(out.statusAgeHours) ? `${Math.floor(out.statusAgeHours)} hours` : 'a while (no status.json)'}. Check Actions → data.`
    : null;
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
