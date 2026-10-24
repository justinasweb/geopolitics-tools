// Alerts to the owner's Telegram (repository secrets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID).
// Without them the alert is only printed, and the run fails, so GitHub's own failed-run email
// still reaches the owner.
import type { Http } from './http.ts';

export interface Alerter {
  readonly configured: boolean;
  /** Resolves true when the message was delivered. */
  send(text: string): Promise<boolean>;
}

export function telegram(http: Http, env = process.env): Alerter {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  return {
    configured: Boolean(token && chat),
    async send(text) {
      console.log(`ALERT: ${text}`);
      if (!token || !chat) return false;
      try {
        await http.get(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
          tries: 2,
        });
        return true;
      } catch (e) {
        // An alert that cannot be sent must not stop the run; the failed run still notifies.
        console.error(`Telegram alert not sent: ${(e as Error).message}`);
        return false;
      }
    },
  };
}
