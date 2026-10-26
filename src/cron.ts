// Cron schedules (must match "triggers.crons" in wrangler.jsonc).
// Kept out of src/index.tsx: the Worker's main module may only export handlers.
export const WEEKLY_CRON = "0 3 * * SUN";
export const DAILY_CRON = "0 6 * * *";
export const PHOTO_CRON = "5 * * * *"; // temporary: picks recipe photos now (hourly runs get 15 minutes; remove once done)
