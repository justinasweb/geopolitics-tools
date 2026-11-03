// Messages from the GitHub Actions runs to the owner on Telegram (docs/telegram.md): drafts sent for review, the
// result of a decision, the weekly digest for review. Secrets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (the owner's
// private chat with the bot). Without them the message is printed and nothing is sent.

export interface Bot {
  readonly configured: boolean;
  /** Sends one message to the owner; resolves true when Telegram accepted it. */
  send(text: string, extra?: Record<string, unknown>): Promise<boolean>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function bot(env: Record<string, string | undefined> = process.env, f: Fetch = fetch): Bot {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  return {
    configured: Boolean(token && chat),
    async send(text, extra = {}) {
      console.log(`Telegram: ${text}`);
      if (!token || !chat) return false;
      const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, link_preview_options: { is_disabled: true }, ...extra }),
      });
      if (!res.ok) console.error(`Telegram did not accept the message: HTTP ${res.status} ${await res.text()}`);
      return res.ok;
    },
  };
}

/** Escapes text for Telegram's HTML parse mode, which needs only these three. */
export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
