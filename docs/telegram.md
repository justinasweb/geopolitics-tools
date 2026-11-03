# Telegram: the review bot and the weekly digest

The site's Telegram bot already sends data alerts and correction reports to the owner. It also does three more things:

1. **Review.** Every short AI text (dossier, alliance history and river summaries, and This week's summary) comes to
   the owner privately with three buttons: **Approve**, **Edit**, **Skip**. Nothing is published without Approve.
2. **This week's summary.** After the data run archives a closed week, a 100 to 150 word summary of it is drafted
   from that week's figures, checked, and sent for review.
3. **Weekly digest.** On a fixed day (Monday 08:00 UTC unless changed), the owner gets the post for the public channel:
   a link to the week's archive page and the approved summary, or the week's three counts. It goes to the channel only
   when the owner taps **Post**, and never while the site is on the holding page.

## How it fits together

```
data run (data.yml) ── freezes a closed week ──▶ week.yml "summary"
                                                   facts → draft → check → commit draft → Telegram: Approve / Edit / Skip
owner taps a button ──▶ Telegram ──▶ Worker POST /api/telegram ──▶ ai-review.yml
                                                   records the decision → commits → starts the deploy (ci.yml)
Worker hourly cron, at DIGEST_AT ──▶ week.yml "digest" ──▶ Telegram: the post, with Post / Don't post
owner taps Post ──▶ Worker ──▶ the same message, as it is, to the channel
```

- **The Worker stores nothing.** Each button carries the text's id and the hash of the exact version shown
  (`src/lib/review.ts`). The GitHub run acts only on that version (`approveText` and friends in
  `src/lib/ai/store.ts`), so a text changed after it was sent cannot be approved by an old button.
- **Where approvals live.** In the repository, where the drafting pipeline keeps them (`src/data/ai/texts/…`,
  [ai-drafting.md](ai-drafting.md)). A week's summary is `src/data/ai/texts/weeks/<yyyy>-<ww>.json`, drafted from
  `src/data/ai/facts/weeks/<yyyy>-<ww>.json`. The site build reads them from there.
- **Commits** from `ai-review.yml` and `week.yml` go straight to `main` with the workflow's own token. That token
  starts no workflows, so `ai-review.yml` starts the production deploy itself after an Approve or Skip. A draft needs
  no deploy: it shows nothing.

### The buttons

| Button | What happens |
| --- | --- |
| **Approve** | `ai-review.yml` runs `npm run ai:review -- approve <id> --text-hash <h>`: the same step as `npm run ai:approve` (the text must still match its facts and pass the check), with `approvedVia: telegram`. Then the site redeploys and the bot says it is done. |
| **Edit** | The bot asks for the corrected text. Reply to that message with the whole text. The run checks it with the same number and fact checker as a draft; if it passes, it replaces the draft and comes back to you with the buttons again, so it is published only once you tap Approve. If it fails, the bot lists what failed and nothing changes. |
| **Skip** | Records `skipped` on the text: it is not published and not sent again. For a week's summary this means the week has no summary, and its page shows the cards only. A later redraft (new facts) can still be approved. |
| **Post** / **Don't post** | Under the digest only. Post sends that message, word for word, to the channel. |

Drafts are sent for review:

- by `week.yml` for a week's summary, right after drafting;
- by `ai-review.yml` when a push to `main` adds or changes a short text's draft (merging an `ai-draft` pull request);
- by hand: Actions → **ai-review** → Run workflow, action `send`, ids such as `river:nile dossier:USA`.

Long pages (About, Methodology, Privacy) and hub intros are still approved in their pull request.

### This week's summary

`npm run week:summary` (`scripts/week.ts`), run by `week.yml` after the data run that froze the week:

1. Reads the frozen week (`data/raw/weeks/<id>.json`, the same file the archive page's cards are built from).
2. Writes its facts (`src/lib/ai/week-facts.ts`): each card's figures as facts with their source, link and the day the
   source's data last changed. Quiet cards (no new data in the week) give no facts.
3. Drafts with the prompt's "Task: week" section, checks every number, date and country, and holds the draft to 100
   to 150 words. A draft that fails is sent back once; failing twice drops it, and the bot says so.
4. Saves the draft, commits it with its facts, and sends it for review.
5. Starts the production deploy, so the week's archive page is live (production rebuilds only on a deploy).

On Approve, the summary shows at the top of `/this-week` and on that week's archive page ("The week in brief"),
labelled "Drafted with AI from this week's data and reviewed by the editor", the label linking to Methodology. On
Skip, after two failed checks, or without `ANTHROPIC_API_KEY`, the page shows the cards only: no empty box, no notice.

### The weekly digest

`npm run week:digest`, run by `week.yml` when the Worker's hourly cron reaches `DIGEST_AT`. It sends the owner a short
note and then the post exactly as the channel would get it:

> Week 45 on geopolitics.tools: 2–8 November 2026
>
> *(the approved summary, then "Summary drafted with AI from the week's data and reviewed by the editor.")*
> *or, without one:* This week: • 2 new orange or red disaster alerts (GDACS) • 1 national-scale internet outage
> (IODA) • 15 entries added to the US, EU and UK sanctions lists
>
> The week's maps, figures and sources: https://geopolitics.tools/this-week/2026-45

The counts are the three the week's cards give; a card with no new data that week is left out. Before sending, the
script checks the archive page answers on the site; if not, it tells the owner and sends nothing.

**Holding page.** Nothing is posted while the site is on the holding page, checked three times: the Worker does not
start the digest while `HOLDING` is `true`, `week.yml` skips it while `SITE_HOLDING` is not `false`, and the Post
button refuses while `HOLDING` is `true`.

## Settings

| Where | Name | What |
| --- | --- | --- |
| Repository secret | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Already set for alerts. `TELEGRAM_CHAT_ID` must be the owner's **private chat** with the bot: the Worker accepts buttons and replies only from that chat |
| Repository secret | `GH_DISPATCH_TOKEN` | Already set for the data watch (fine-grained, this repository, "Actions: read and write"). The Worker uses it to start `ai-review.yml` and `week.yml` |
| Repository secret | `TELEGRAM_WEBHOOK_SECRET` | **New.** A random string of 32 or more letters and digits (Telegram allows `A–Z`, `a–z`, `0–9`, `_` and `-`). Telegram sends it with every call to the webhook; anything without it is refused |
| Repository secret | `TELEGRAM_CHANNEL_ID` | **New.** The public channel for the digest: its `@name`, or its numeric id (`-100…`) |
| Repository secret | `ANTHROPIC_API_KEY` | Already set for drafting; `week.yml` uses it for the summaries |
| Repository variable | `DIGEST_AT` | Optional. The digest's day and hour in UTC, such as `mon 08` (the default) or `tue 06`. Takes effect on the next production deploy |
| Repository variable | `SITE_HOLDING` | Already there. While it is not `false`, nothing is posted to the channel |

The production deploy (`ci.yml`) copies `GH_DISPATCH_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_CHANNEL_ID` into the Worker's secrets, and passes `DIGEST_AT` and `HOLDING` as
variables. Previews get none of them, so the webhook answers 503 there.

## The owner's steps

1. **Add the two new secrets.** GitHub → the repository → Settings → Secrets and variables → Actions → New repository
   secret: `TELEGRAM_WEBHOOK_SECRET` (make one with `openssl rand -hex 32`) and `TELEGRAM_CHANNEL_ID`.
2. **Make the bot an admin of the channel** with the right to post messages (Telegram → the channel → Administrators
   → Add admin → the bot).
3. **Check `TELEGRAM_CHAT_ID` is your private chat with the bot**, not a group: open the chat with the bot, send it
   any message, then open `https://api.telegram.org/bot<token>/getUpdates` and compare `message.chat.id` (it equals
   your own user id, and `chat.type` is `private`). If the alerts go to a group today, change the secret to the
   private chat's id, or the buttons will not work.
4. **Deploy once** (merge this, or Actions → ci → Run workflow on `main`) so the Worker has the new secrets.
5. **Register the webhook with Telegram.** Run this once, with the bot token and the same secret as in step 1 (in a
   terminal; nothing is stored anywhere else):

   ```bash
   curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d url=https://geopolitics.tools/api/telegram \
     -d secret_token=<TELEGRAM_WEBHOOK_SECRET> \
     -d 'allowed_updates=["message","callback_query"]' \
     -d drop_pending_updates=true
   ```

   Telegram answers `{"ok":true,"result":true,"description":"Webhook was set"}`. The domain works for `/api/` while
   the site is on the holding page. To check it later:

   ```bash
   curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
   ```

   `last_error_message` there shows what went wrong, if anything (401: the secret differs from the Worker's).
   Changing the secret means running `setWebhook` again with the new one.
6. **Try it.** Actions → ai-review → Run workflow → action `send`, id a short text in draft (`npm run ai:status`
   lists them). The draft arrives with its buttons; Skip is the harmless one to try.

A bot with a webhook can no longer be read with `getUpdates`; `deleteWebhook` undoes step 5 if you need that.

## Code

| File | What |
| --- | --- |
| `worker/telegram.ts` | The webhook (secret header, owner only), the buttons, and the digest's clock (`digestCron`) |
| `worker/github.ts` | Starting workflow runs with `GH_DISPATCH_TOKEN` (also used by the data watch) |
| `src/lib/review.ts` | The protocol: button data, the Edit reference line, `DIGEST_AT` |
| `src/i18n/telegram.en.ts` | Every word the bot sends |
| `scripts/review.ts` | `npm run ai:review`: send for review, approve, skip, edit |
| `scripts/week.ts` | `npm run week:summary` and `npm run week:digest` |
| `src/lib/ai/week-facts.ts` | A frozen week's facts, and the digest's three counts |
| `.github/workflows/ai-review.yml`, `.github/workflows/week.yml` | The runs |
