// Team wellbeing, stage 3: a short thought for each day on the employee dashboard.
//
// REFLECTIONS are original lines written by Claude from the owner's Method (docs/METHOD.md), in our own words,
// not quotations. Drafts for the owner to check. No health claims.
//
// TRADITION_WORDS: daily words for each faith or belief. Deliberately EMPTY until verified texts are supplied:
// public-domain translations quoted exactly, with the exact reference (e.g. a verse), checked by a person.
// Never quote scripture or famous people from memory, and never attribute a line to someone who didn't say it.
// Until a tradition has words, its members see the day's reflection, with a note that their daily words are coming.

export type Tradition = "none" | "christian" | "muslim" | "jewish" | "hindu" | "buddhist" | "sikh" | "other";

export const TRADITIONS: Record<Tradition, string> = {
  none: "None, or rather not say",
  christian: "Christian",
  muslim: "Muslim",
  jewish: "Jewish",
  hindu: "Hindu",
  buddhist: "Buddhist",
  sikh: "Sikh",
  other: "Another faith or belief",
};

export type Words = { text: string; source: string };

/** [PLACEHOLDER: verified public-domain words for each tradition, with exact references. Owner to approve.] */
export const TRADITION_WORDS: Record<Tradition, Words[]> = { none: [], christian: [], muslim: [], jewish: [], hindu: [], buddhist: [], sikh: [], other: [] };

export const REFLECTIONS: string[] = [
  "Notice one place you're holding on today. Your jaw, your shoulders, your toes. Just notice it.",
  "Keep the effort you need. Let go of the rest.",
  "Engage, don't grip.",
  "Position over range. Get it right first; how far can come later.",
  "Balance isn't holding still. It's a thousand small adjustments you don't have to force.",
  "The least you need, not the most you can.",
  "A few minutes, done gently, beats an hour done grimly.",
  "When something feels hard, check whether it's the task or the bracing around it.",
  "Breathe out, and let your shoulders find their own place.",
  "Trust takes practice. So does trusting your own body.",
  "You don't have to fix everything today. Release one thing.",
  "Start from the ground up: feel your feet before anything else.",
  "Effort isn't the same as progress.",
  "Notice, release, then move. In that order.",
  "Some days the practice is simply showing up. That counts.",
  "What would this feel like if it were easy?",
  "Slow is how the body learns. Fast comes later, on its own.",
  "Let the floor hold you up for a moment.",
  "Control on, control off, until even the switch is quiet.",
  "Be kind to the version of you that's still learning.",
  "Tension you've carried for years won't leave in a day. Keep going, gently.",
  "No shame, no ego. Just what's true today.",
  "Stand up, settle, and let your weight spread through your whole foot.",
  "The aim isn't more control. It's needing less of it.",
  "Rest is part of the work.",
  "Small and often. Again tomorrow.",
  "Look for the sweet spot: enough, and no more.",
  "When you catch yourself gripping, that's not failure. That's recognising.",
  "Move like someone who has nothing to prove.",
  "End the day by letting go of one thing you didn't need to carry.",
];

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const pick = <T,>(list: T[], day: string) => list[((dayNumber(day) % list.length) + list.length) % list.length]!;

/** The day's thought: words from their chosen tradition when we have verified ones, otherwise the Method reflection. */
export function thoughtForDay(day: string, tradition: Tradition | null): { reflection: string; words: Words | null } {
  const words = tradition && TRADITION_WORDS[tradition].length ? pick(TRADITION_WORDS[tradition], day) : null;
  return { reflection: pick(REFLECTIONS, day), words };
}
