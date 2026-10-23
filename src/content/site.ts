// Public site content. Wording comes from the owner's own description (see docs/METHOD.md).
// Anything not yet confirmed by the owner is marked with placeholder() so it shows
// clearly on the test site and is caught by the pre-launch check.
// From Step 5 the programme catalogue and FAQs move into the database, editable in admin.

/** Marks text the owner hasn't confirmed yet. Rendered as a highlighted <mark> by views. */
export type Placeholder = { placeholder: string };
export const placeholder = (note: string): Placeholder => ({ placeholder: note });
export type Copy = string | Placeholder;

export const PHILOSOPHY = {
  headline: ["Release the tension.", "Release the force.", "Learn to love your body again."],
  lede: "A ground-up movement method. It starts where you meet the ground, your feet, and rebuilds how you stand, walk and move, one layer at a time.",
};

export type Principle = { n: number; title: string; summary: string };

export const PRINCIPLES: Principle[] = [
  { n: 1, title: "Recognise", summary: "Become aware of tension, gripping, compensation and habitual patterns." },
  { n: 2, title: "Release", summary: "Learn to let go of unnecessary muscular effort without losing useful stability." },
  { n: 3, title: "Reconnect", summary: "Rediscover sensation, pressure distribution and controlled muscular engagement." },
  { n: 4, title: "Retrain", summary: "Practise simple movements with improved coordination and awareness." },
  { n: 5, title: "Strengthen", summary: "Progressively develop strength, balance and physical capability." },
  { n: 6, title: "Integrate", summary: "Bring these improvements into everyday movement and more demanding tasks." },
];

export const WHO_FOR: string[] = [
  "People who have moved in compensating ways for years and want to rebuild properly, from the ground up.",
  "Older adults who haven't trained before, or who are coming back to movement.",
  "Anyone tired of forcing their body into positions who wants a calmer, more aware way to build strength.",
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
    short: "The flagship programme. It builds from your feet up: arches and toes, Achilles and calves, knees, then hips.",
    status: "available",
    flagship: true,
    price: placeholder("Flagship price"),
    access: placeholder("How long buyers keep access (e.g. lifetime)"),
    stages: [
      { title: "Feet, arches & toes", summary: "Learn to use your arches and toes properly. This is the foundation everything else stands on." },
      { title: "Achilles & calves", summary: "Train the Achilles and calf muscles on top of a foot that's now doing its job." },
      { title: "Knees", summary: "Bring awareness and control to the knee joints, without forcing them into position." },
      { title: "Hips", summary: "Stabilise the hips, so the whole lower body works together." },
    ],
    includes: [
      "The Full Programme: the complete teaching, philosophy first, then every stage and exercise. Read it in full before you start, ideally a few times.",
      "The Quick Run-Through: the key points of each stage, to keep beside you while you train.",
      "Video demonstrations of the exercises.",
      "Your own members' area, where your programmes are always waiting for you.",
    ],
  },
  { slug: "upper-body", title: "Upper Body", short: "The same principles, applied to the shoulders, arms and upper back.", status: "coming-soon", price: placeholder("Price") },
  { slug: "hips", title: "Hips", short: "A focused programme for hip awareness, release and stability.", status: "coming-soon", price: placeholder("Price") },
  { slug: "breathwork-regulation", title: "Breathwork & Regulation", short: "Breath and nervous-system regulation to support release and recovery.", status: "coming-soon", price: placeholder("Price") },
  { slug: "full-body", title: "Full Body", short: "The whole method, brought together head to toe.", status: "coming-soon", price: placeholder("Price") },
  { slug: "stretching", title: "Stretching", short: "Open stretching programmes for the upper body, lower body and full body.", status: "coming-soon", price: placeholder("Price") },
];

export type Faq = { q: string; a: Copy[] };

export const FAQS: Faq[] = [
  {
    q: "Where should I start?",
    a: ["Start with the flagship, Lower Body Regeneration. Read the Full Programme all the way through before you begin, ideally a few times, so you understand the philosophy behind the training. Then use the Quick Run-Through as you practise."],
  },
  {
    q: "Who is the method for?",
    a: ["People who have moved in compensating ways for years, older adults who haven't trained, and anyone who wants to stop forcing their body and rebuild from the ground up."],
  },
  {
    q: "Is it suitable if I have an injury?",
    a: ["It isn't designed for significant injuries such as torn muscles, tendons or ligaments, or for conditions being treated by a physiotherapist or doctor. If that's you, get their go-ahead first. If anything causes pain, stop."],
  },
  {
    q: "Is this medical treatment or physiotherapy?",
    a: ["No. It's education and movement coaching. It doesn't diagnose, treat or replace advice from a doctor or physiotherapist."],
  },
  {
    q: "How do I get my programme after buying?",
    a: ["You don't need an account to buy. After payment we email you a link to create your account. Log in and your programmes are waiting in your members' area."],
  },
  { q: "How long do I keep access?", a: [placeholder("Access length, e.g. lifetime access to programmes you've bought")] },
  { q: "Do I need any equipment?", a: [placeholder("Equipment needed, if any")] },
  {
    q: "Do I need a PayPal account to pay?",
    a: ["No. Checkout is through PayPal, and in most countries you can pay by debit or credit card without a PayPal account."],
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
