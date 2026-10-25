# Open questions

Decisions put off for later. Each says what the question is, what the site does now, and the options seen so far.

## Refugees hosted in Russia (raised 25 Oct 2026)

**The question.** UNHCR's figures stop counting Ukrainians in Russia from 2024. Russia's "refugees hosted" falls from 1.23 million (2023) to about 7,000 Ukrainians and 12,787 people in all (2025), and Ukraine's "fled from" total falls with it. On the map Russia looks as if it hosts almost no one, which reads as wrong.

**What the site does now.** It shows UNHCR's figures as published, with a note next to Russia (refugees hosted, per 1,000 residents) and Ukraine (fled from) in the panel, the tooltip and under the table (`PLACE_NOTES` in src/i18n/views.en.ts).

**Options.**
- Keep UNHCR's figures with the note (current).
- Show Russia's last reported figure (1.2 million, 2023), marked as an older year. This mixes years in the world total and the ranking.
- Mark Russia on the hosted maps as "not reported since 2023" (hatched, like "withheld by source") instead of shading it by the small figure.
- Use another source for Ukrainians in Russia, if one meets the source rules.
