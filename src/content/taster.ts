// The free Method taster: three short emails over three days, each with one exercise from
// Stage 1 of Lower Body Regeneration (feet and balance). Wording is taken from the programme.

export type TasterDay = { subject: string; intro: string; exercise: string; steps: string[]; watch: string; close: string };

export const TASTER: TasterDay[] = [
  {
    subject: "Day 1 of 3: the short foot",
    intro: "Everything in the method starts from the ground up, with your feet. Today's exercise is the first one in the programme. It looks tiny. It isn't.",
    exercise: "Short foot",
    steps: [
      "Sit barefoot on a hard chair, towards the front edge, feet flat on the floor. Sit tall without bracing, knees in line with your toes.",
      "Let your toes go long and completely loose. They shouldn't grip or press into the floor at all.",
      "Keeping the toes loose, gently draw the ball of your foot back towards your heel. The foot shortens and the arch rises.",
      "Hold for about 5 seconds, then slowly release. 8-10 times.",
      "Now the real exercise: keep the arch where it is, and see how much effort you can let go of everywhere else. Most of us over-control.",
    ],
    watch: "Toes curling or clawing to fake the arch, the thighs tightening, and holding your breath.",
    close: "Tomorrow: toe yoga, and the surprising thing it shows you about how hard you press.",
  },
  {
    subject: "Day 2 of 3: toe yoga",
    intro: "Yesterday you found the arch without gripping. Today you'll find out how much force you use when you don't need to.",
    exercise: "Toe yoga",
    steps: [
      "Same starting position as the short foot: hard chair, sitting tall without bracing, feet flat, toes loose.",
      "Press your big toe gently into the floor and lift the other four toes away from it. Hold for a couple of seconds, then lower them slowly.",
      "Then swap: the four toes rest down and the big toe lifts. Hold, and lower slowly.",
      "Go back and forth, unhurried. 8-10 each way.",
      "Look for the sweet spot of pressure: the least you need, not the most you can.",
    ],
    watch: "Pressing the big toe far too hard (almost everyone does at first), the glutes tensing, and the ribs or spine twisting to help.",
    close: "Tomorrow: standing on one leg, and letting go of the grip.",
  },
  {
    subject: "Day 3 of 3: single-leg balance",
    intro: "Today you stand up. Balance is where the gripping really shows itself, and where letting go starts to change how you stand.",
    exercise: "Single-leg balance",
    steps: [
      "Stand barefoot near a wall or door frame, feet about shoulder-width apart.",
      "Softly line up your ankles, knees and hips, then let the stacking carry on up: pelvis, ribs, head. A gentle nudge, then release.",
      "Shift onto one foot and lift the other. Keep a slight bend in the standing knee.",
      "Your toes, especially the big toe, will grip the floor. That's natural. Now begin to release the grip, so it only switches on when you need it.",
      "Let yourself sway. Hold for up to 90 seconds if you can, then change legs.",
    ],
    watch: "The knee rolling inwards, the hip dropping or swinging out, and leaning a long way over the standing leg.",
    close: "That's the start of Stage 1. The full programme builds from here.",
  },
];

/** Shown in every taster email. */
export const TASTER_SAFETY = "Go gently and stop if anything hurts. This is education and movement coaching, not medical advice. If you have an injury or a medical condition, check with a health professional first.";
