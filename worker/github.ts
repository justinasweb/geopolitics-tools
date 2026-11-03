// Calls to the GitHub API from the Worker, with GH_DISPATCH_TOKEN: a fine-grained token for this repository with
// "Actions: read and write". Used by the data watch (watch.ts) and the Telegram review step (telegram.ts), which only
// ever start workflow runs; the runs do the work and commit with their own token.

export interface GitHubEnv {
  GH_DISPATCH_TOKEN?: string;
  /** owner/name; defaults to the project's repository. */
  GH_REPO?: string;
}

export const REPO = 'justinasweb/geopolitics-tools';

export const gh = (env: GitHubEnv, path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com/repos/${env.GH_REPO ?? REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'geopolitics-tools-worker',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

/** Starts a workflow run on main. Resolves to the HTTP status (204 when started), or 0 without a token. */
export async function dispatch(env: GitHubEnv, workflow: string, inputs: Record<string, string> = {}): Promise<number> {
  if (!env.GH_DISPATCH_TOKEN) return 0;
  const res = await gh(env, `/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs }) });
  return res.status;
}
