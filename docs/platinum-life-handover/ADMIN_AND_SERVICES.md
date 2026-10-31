# Admin, scheduled jobs, third parties, secrets and costs

## Admin functions (Body Regen `/admin`, two-step login, audit-logged)
| Function | Route | What it does | Platinum Life |
|---|---|---|---|
| Recipe photos list | `GET /admin/photos` | Every recipe with its current photo, how many have no match, whether the key is set | Adapt |
| Auto-pick | `POST /admin/photos/auto` | Picks photos for up to 12 recipes without one | Adapt |
| Choose a photo | `GET /admin/photos/:id?q=` | 12 Pixabay options (custom search allowed); previews proxied via `GET /admin/photos/preview?u=` (Pixabay hosts only), so the CSP stays `img-src 'self'` | Adapt |
| Save choice | `POST /admin/photos/:id` | Copies the image into R2, records the licence, `chosen_by='owner'`, bumps `version` (cache-busting `?v=`) | Adapt |
| Remove | `POST /admin/photos/:id/remove` | Deletes from R2 and the table | Adapt |
| Stats: meal savings | `GET /admin/stats` | Members logging, weeks, average weekly saving (actual spend only); official price periods per country | Adapt |
| Refresh prices now | `POST /admin/meal-prices/refresh` | `refreshOfficialPrices(force)`, audit-logged | Adapt |
| Kitchen monthly price | `POST /admin/programmes/:id/monthly` | Membership price | Drop (Platinum Life membership) |
| Free-week numbers | in Stats (`trialStats`) | Started, verified, joined | Only with the free week |

**No recipe editor exists.** Recipes are edited in the source files, then rebuilt and redeployed. If Platinum Life wants admin recipe editing, that's new work. Suggested: move recipes into D1 later, keeping `recipes.json` as the seed.

## Scheduled jobs
| Job | When | What |
|---|---|---|
| `meal-prices` | daily, inside the daily job | `refreshOfficialPrices(env)`: skips if the stored prices are under 25 days old; each country that fails keeps its previous prices; stored in `settings['meal.official_prices']` |
| `recipe-photos` | daily (3-minute budget) and a temporary hourly cron (12-minute budget) | `dailyPhotoPick`: auto-picks missing photos, paced 1.5 s per search; on HTTP 429 it waits 61 s and carries on within the budget |
| `kitchen-follow-ups` | daily | Free-week follow-up email after 7 days (optional feature) |

## Third-party services
| Service | Used for | Key (name only) | Cost |
|---|---|---|---|
| Pixabay API | Recipe photo search; images downloaded and self-hosted | `PIXABAY_API_KEY` (Worker secret) | Free. 100 requests a minute; Cloudflare's shared IPs get throttled (about 1 a run before pacing and waiting) |
| ONS (UK) | CPI food index D7C8 time series (JSON) | none | Free (Open Government Licence) |
| Statistics Canada WDS | Average retail prices | none | Free (Open Licence) |
| BLS (US) | Average prices | `BLS_API_KEY` (optional secret) | Free |
| Resend | Emails (free week only; the planner itself sends none) | `RESEND_API_KEY` | Free tier, then from about $20 a month |
| Stripe | Kitchen membership (drop) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Per transaction |

**Secret values are never in code, docs or chat.** Set them with `wrangler secret put NAME --env <env>` in **Platinum NI's own Worker**. Do not reuse Body Regen's keys: get a separate Pixabay key for Platinum Life if possible.

## AI integrations
**None.** There are no LLM, Workers AI, OpenAI, Anthropic or other AI calls anywhere in this project (verified by searching `src/` and `scripts/`). The planner is rule-based. The owner decided (2026-10-26) **never to market it as AI**. Under UK consumer law (CMA/ASA), calling a rule-based tool "AI" could mislead. Keep it "smart planner" or similar in Platinum Life too, unless Platinum Life genuinely adds an AI feature.

The recipes and prices were drafted by Claude in development chats; that's authorship, not a runtime integration. No running cost.

## Running costs (owner discussion, 2026-10-28; estimates from remembered list prices, re-check)
At 50,000 members, with the planner on Cloudflare (Workers, D1, R2), no marketing emails and videos on YouTube: about £10-£50 a month. Planner computation is CPU-only, a few ms per request (not measured). Bundled recipes and prices cost nothing at runtime. Photos are tiny R2 objects with free egress.
