// Public site content. Wording comes from the owner's own description (see docs/METHOD.md).
// Anything not yet confirmed by the owner is marked with placeholder() so it shows
// clearly on the test site and is caught by the pre-launch check.
// From Step 5 the programme catalogue and FAQs move into the database, editable in admin.

/** Marks text the owner hasn't confirmed yet. Rendered as a highlighted <mark> by views. */
export type Placeholder = { placeholder: string };
export const placeholder = (note: string): Placeholder => ({ placeholder: note });
export type Copy = string | Placeholder;

export const PHILOSOPHY = {
  headline: ["Let go of the tension,", "and rediscover how your body is meant to move."],
  lede:
    "Most of us spend years gripping, bracing and forcing our way through movement without ever noticing. The Body Regeneration Method teaches you to recognise where you're holding on, release it, and rebuild strength and balance from the ground up, starting with your feet.",
};

/** Owner-confirmed track record (2026-10-23). Keep evidence for the number (see docs/METHOD.md). */
export const TRACK_RECORD = "Shared freely with thousands of people around the world for years. Now available as a complete programme.";

/** Fuller explanation of each principle (method page). From the owner's voice note, 2026-10-24. */
export const PRINCIPLES_DEPTH: { title: string; paragraphs: string[] }[] = [
  {
    title: "Recognise",
    paragraphs: [
      "Recognising works both ways. You become aware of the tension, gripping and compensating patterns you've built up, and you also learn to recognise the muscles that genuinely should be working, which are often the ones the compensation has been covering for.",
    ],
  },
  {
    title: "Release",
    paragraphs: [
      "Release happens in layers. First you let go of the muscles that have been compensating. Then you go further, and ease the excess tension and pressure even in the muscles you do need, until you find the equilibrium point where the body is supported without being forced.",
      "Take standing on one leg. You need steady pressure through the big toe and the little toes, the stabilising muscles working, and your hips level and square. But most of us recruit far more than that: bracing through the back, tensing the shoulders, holding the breath. Release is about keeping what the balance needs and letting go of everything else.",
    ],
  },
  {
    title: "Reconnect",
    paragraphs: [
      "With the excess effort gone, you reconnect with each specific part of a movement: where the pressure is, which muscles switch on and when. You don't just do the movement, you understand it from the inside.",
    ],
  },
  {
    title: "Retrain and Strengthen",
    paragraphs: [
      "The first exercises focus on recognising, releasing and reconnecting. Only once those foundations are in place does the work turn to retraining movement patterns and progressively building strength and balance on top of them.",
    ],
  },
  {
    title: "Integrate",
    paragraphs: [
      "At the advanced stages, the exercises add complexity on purpose: keeping a steady breathing pattern, counting a rhythm as you raise and lower your heels, holding your awareness on several things at once. At first, the mind finds this genuinely hard, because there's a lot for the nervous system to organise at the same time.",
      "That's the point. Known as dual-task training, it teaches your body to keep simple movements well controlled while your attention is busy elsewhere, which is exactly what everyday life asks of it.",
    ],
  },
];

/** The four stages of learning a skill. The programmes walk you through all four. */
export const LEARNING_STAGES: { title: string; summary: string }[] = [
  { title: "Unconsciously incompetent", summary: "You don't know you're gripping. It just feels normal." },
  { title: "Consciously incompetent", summary: "You start to notice it. Frustrating at first, but it's real progress." },
  { title: "Consciously competent", summary: "You can do it well, as long as you concentrate." },
  { title: "Unconsciously competent", summary: "Your body does it by itself. This is the goal." },
];

/** Effortless action: the feeling the method is after. */
export const EFFORTLESS = [
  "There's an old idea from Taoism called wu wei, often translated as \"effortless action\": doing exactly what's needed, and nothing more. That's the feeling the method is after.",
  "It isn't collapse, and it isn't laziness. You release the tension, find the muscles that should be working, and then release even those, back to the level your reflexes need. Then you learn to trust those reflexes.",
];

/** The "why" behind the method, used on the homepage and the method page. */
export const WHY = {
  title: "Most of us were never taught how to move. We learned how to hold on.",
  paragraphs: [
    "Over years of sitting, rushing, training hard and pushing through, the body learns to protect itself. It grips through the feet, braces through the knees and tightens around the hips. It happens so gradually that most people never realise they're doing it.",
    "That holding comes at a cost. When muscles are always working to keep you safe, they can't do the job they're there for. Certain positions stop being available to you, simple movements start to feel like effort, and you never quite trust yourself in a balanced position. Training harder on top of that only makes the pattern stronger.",
    "The Body Regeneration Method works the other way round. First you learn to recognise where you're gripping and forcing. Then you learn to let go of that unnecessary effort without losing the stability you genuinely need, and rebuild coordination, strength and balance on a foundation you can trust.",
    "There's nothing mystical about it. It's a practical, step-by-step approach to movement that anyone can learn, whatever their age or starting point.",
  ],
};

/** Why the flagship starts at the feet. */
export const FOUNDATION = {
  title: "Everything starts at the feet",
  paragraphs: [
    "Your feet are the foundation for every step you take. When your arches and toes aren't doing their job, the ankles, knees and hips above them have to compensate, and the whole body learns to hold on.",
    "That's why Lower Body Regeneration begins at the ground and works upwards, one stage at a time. And the effect doesn't stop at the hips: because everything above is built on what happens below, the work you do on your feet shapes how your whole body stands, walks and moves.",
  ],
};

export type Principle = { n: number; title: string; summary: string };

export const PRINCIPLES: Principle[] = [
  { n: 1, title: "Recognise", summary: "Become aware of the tension, gripping and compensation you hold, and of the muscles you should be using instead." },
  { n: 2, title: "Release", summary: "Let go of the effort you don't need: first the compensating muscles, then the excess in the ones doing the work, until you find your balance point." },
  { n: 3, title: "Reconnect", summary: "Rediscover sensation, pressure distribution and controlled muscular engagement through each part of a movement." },
  { n: 4, title: "Retrain", summary: "Practise simple movements with improved coordination and awareness." },
  { n: 5, title: "Strengthen", summary: "Progressively develop strength, balance and physical capability." },
  { n: 6, title: "Integrate", summary: "Bring these improvements into everyday movement and more demanding tasks, keeping movement simple and controlled even when your mind is busy." },
];

export const WHO_FOR: string[] = [
  "Anyone who has moved in compensating ways for years and wants to rebuild properly, from the ground up.",
  "Older adults who have never trained, or who are returning to movement after time away.",
  "People who are tired of forcing their body into positions and want a calmer, more aware way to build strength.",
  "People who have tried physiotherapy or other approaches for years without lasting change, and are ready for something different.",
];

export const NOT_FOR: string[] = [
  "Anyone with a recent or significant injury, such as a torn muscle, tendon or ligament.",
  "Anyone with a condition currently being treated by a physiotherapist or doctor, unless they have cleared you to train.",
  "Anyone who is pregnant, has had recent surgery, or has unexplained pain, until you have checked with your GP.",
];

export type Stage = { title: string; summary: string };

export type Programme = {
  slug: string;
  title: string;
  short: string;
  status: "available" | "coming-soon";
  flagship?: boolean;
  price: Copy;
  stages?: Stage[];
  includes?: Copy[];
  access?: Copy;
};

export const PROGRAMMES: Programme[] = [
  {
    slug: "lower-body-regeneration",
    title: "Lower Body Regeneration",
    short:
      "Our flagship programme rebuilds the way you move from the ground up: from the feet and balance, through the shins, Achilles and calves, to the hips and knees. Comes with the Core & Hips programme free.",
    status: "available",
    flagship: true,
    price: placeholder("Flagship price"),
    access: placeholder("How long buyers keep access (e.g. lifetime)"),
    stages: [
      { title: "Feet & balance", summary: "Short foot, toe yoga, toe spreading and single-leg balance. Learn the method itself, and let your feet support you instead of gripping. Everything else stands on this." },
      { title: "Shins, Achilles & calves", summary: "Tibialis raises and calf raises: basic strength for the lower leg, built in the position you've got." },
      { title: "Hips & knees", summary: "Glute bridge, clamshells, single-leg hinge and split squat: connect the feet to the hips, so the knees can move freely instead of being forced." },
      { title: "Integrate", summary: "Pogo hops in two parts, first with conscious control, then letting go and trusting your reflexes. The culmination of the programme." },
    ],
    includes: [
      "11 exercises across four stages. Each one has a detailed starting position, how to do it, what to watch for, and easier and harder versions, so you can start wherever you are.",
      "The full guide, one page at a time: the philosophy first, then each exercise, with Next and Previous buttons. No endless scrolling.",
      "Listen mode, a short Key points version, and a one-page exercise sheet you can print or keep on your phone.",
      "Demonstration videos, so you can see what each movement looks like.",
      "Free bonus: the complete Core & Hips programme, with 20 more exercises for the hips, the breath and the deep core.",
      "Advised: one round a day, about 25–35 minutes while you're learning and 15–20 once you know it. Not every day is needed.",
      "Your own members' area, where your programmes are always waiting for you.",
    ],
  },
  {
    slug: "core-and-hips",
    title: "Core & Hips",
    short:
      "Open and strengthen the hips, then rebuild the deep core from the breath up, with released, reflexive support instead of bracing. Free with Lower Body Regeneration.",
    status: "available",
    price: placeholder("Core & Hips price (free with Lower Body)"),
    access: placeholder("How long buyers keep access (e.g. lifetime)"),
    stages: [
      { title: "Open the hips", summary: "90/90 switches, hip circles, leg swings and simple stretches. Build range off the correct pattern, without leaning or forcing." },
      { title: "Strengthen the hips", summary: "Step hip hikes, side-lying leg raises, banded side steps and supported hip airplanes." },
      { title: "Breath & deep core", summary: "360° breathing and simple floor positions inspired by how babies first learn to stabilise and move." },
      { title: "The culmination", summary: "Dead bug, bird dog, front plank and side plank, done released but deep." },
    ],
    includes: [
      "Two programmes in one: Hips (10 exercises) and Core (11 exercises).",
      "Every exercise with a detailed starting position, how to do it, what to watch for, and easier and harder versions.",
      "The same page-by-page guide, Listen mode, Key points and printable exercise sheet.",
      "Advised: one round of each a day if you have the time, about 20 minutes each while you're learning. Do them together, alternate them, or split them across the week.",
      "Included free with Lower Body Regeneration.",
    ],
  },
  { slug: "upper-body", title: "Upper Body", short: "The same principles applied to the shoulders, arms and upper back, where so many of us hold tension.", status: "coming-soon", price: placeholder("Price") },
  { slug: "hips", title: "Hips", short: "The hips half of Core & Hips on its own: open and strengthen the hips, building range off the correct pattern.", status: "coming-soon", price: placeholder("Price") },
  { slug: "core", title: "Core", short: "The core half of Core & Hips on its own: rebuild reflexive support from the breath up, without bracing.", status: "coming-soon", price: placeholder("Price") },
  { slug: "breathwork-regulation", title: "Breathwork & Regulation", short: "Learn to use your breath to settle the body, support release and recover well.", status: "coming-soon", price: placeholder("Price") },
  { slug: "full-body", title: "Full Body", short: "The complete method brought together, from head to toe.", status: "coming-soon", price: placeholder("Price") },
  { slug: "stretching", title: "Stretching", short: "Gentle, open stretching programmes for the upper body, lower body and full body.", status: "coming-soon", price: placeholder("Price") },
];

export type Faq = { q: string; a: Copy[] };

export const FAQS: Faq[] = [
  {
    q: "Where should I start?",
    a: [
      "Start with the flagship, Lower Body Regeneration, which comes with Core & Hips free. Read the full guide before you begin, ideally a few times, so you understand the philosophy behind the training. Then, as you get to know it, move on to Listen mode, the Key points and finally the one-page exercise sheet.",
    ],
  },
  {
    q: "Who is the method for?",
    a: ["People who have moved in compensating ways for years, older adults who haven't trained, people who've tried physiotherapy for years without lasting change, and anyone who wants to stop forcing their body and rebuild from the ground up."],
  },
  {
    q: "Is it suitable if I have an injury?",
    a: ["It isn't designed for significant injuries such as torn muscles, tendons or ligaments, or for conditions being treated by a physiotherapist or doctor. If that's you, get their go-ahead first. If anything causes pain, stop."],
  },
  {
    q: "Is this medical treatment or physiotherapy?",
    a: ["No. It's education and movement coaching. If you have a medical condition or an injury, check with your doctor or physiotherapist before you start."],
  },
  {
    q: "How do I get my programme after buying?",
    a: ["You don't need an account to buy. After payment we email you a link to create your account. Log in and your programmes are waiting in your members' area."],
  },
  { q: "How long do I keep access?", a: [placeholder("Access length, e.g. lifetime access to programmes you've bought")] },
  {
    q: "Do I need any equipment?",
    a: [
      "Very little. You train barefoot, and you'll need a hard chair, a step or stair, a wall or door frame to hold, a sofa or bench, and a mat or towel. For some of the harder versions, a resistance band, a light weight or a yoga ball are useful but optional.",
    ],
  },
  {
    q: "How long does it take, and how often should I do it?",
    a: [
      "Everything is advised rather than fixed. We advise one round a day if you have the time: about 25–35 minutes for Lower Body while you're learning, and 15–20 minutes once you know it. You don't need to do it every day. Some people train daily because they love it, others two or three times a week, and both are fine.",
    ],
  },
  {
    q: "What do I get free with Lower Body Regeneration?",
    a: ["The full Core & Hips programme: 10 exercises for the hips and 11 for the breath and deep core, built on the same philosophy. It appears in your members' area alongside Lower Body."],
  },
  {
    q: "How can I pay?",
    a: ["Checkout is handled securely by Stripe. You can pay by debit or credit card, Apple Pay or Google Pay, and PayPal where available. We never see your card details."],
  },
  {
    q: "Can I buy more than one programme?",
    a: ["Yes. Add programmes to your basket and check out once. Each one you buy appears in your members' area."],
  },
  {
    q: "Can I earn by recommending the method?",
    a: ["Yes. Every customer gets a personal share link and earns commission on sales made through it.", placeholder("Commission rate")],
  },
];

export const COACH = {
  name: placeholder("Coach name"),
  story: [
    placeholder("Your story in your own words: how you came to this, what changed for you, and why you teach it"),
  ] as Copy[],
};
