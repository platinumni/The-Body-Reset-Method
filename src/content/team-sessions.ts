import { TASTER, TASTER_SAFETY } from "./taster";

// Team wellbeing: short follow-along sessions for the employee dashboard, one a day in rotation.
// Stage 1 uses the three Stage 1 exercises from Lower Body Regeneration (the same approved wording as the taster).
// [PLACEHOLDER: more sessions from the owner's courses, and breathing and release sessions, once written and approved]

export type TeamSession = { id: string; title: string; minutes: number; intro: string; steps: string[]; watch: string };

const id = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const TEAM_SESSIONS: TeamSession[] = TASTER.map((d) => ({ id: id(d.exercise), title: d.exercise, minutes: 5, intro: d.intro, steps: d.steps, watch: d.watch }));

export const TEAM_SAFETY = TASTER_SAFETY;

export const teamSessionById = (sessionId: string) => TEAM_SESSIONS.find((s) => s.id === sessionId) ?? null;

/** Today's session: the same for everyone on a given UK day, moving on each day. */
export function sessionForDay(day: string): TeamSession {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return TEAM_SESSIONS[((n % TEAM_SESSIONS.length) + TEAM_SESSIONS.length) % TEAM_SESSIONS.length]!;
}
