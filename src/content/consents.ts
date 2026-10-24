// Checkout tick boxes. The exact wording and version are saved with every order and
// consent record. If you change the wording, bump the version.

export const CHECKOUT_CONSENTS = {
  health_declaration: {
    version: "2026-10-23",
    required: true,
    label:
      "I have read the health disclaimer. None of the \"not suitable\" points apply to me, or a doctor or physiotherapist has cleared me to train.",
  },
  terms: {
    version: "2026-10-23",
    required: true,
    label: "I agree to the terms of sale and have read the privacy policy.",
  },
  immediate_access: {
    version: "2026-10-24",
    required: true,
    label: "I want access straight away. I understand I lose my 14-day right to cancel once access begins. My 90-day money-back guarantee still applies.",
  },
  marketing_email: {
    version: "2026-10-23",
    required: false,
    label: "Email me occasional news and new programmes (optional, unsubscribe any time).",
  },
} as const;

export type ConsentKind = keyof typeof CHECKOUT_CONSENTS;
export const CONSENT_KINDS = Object.keys(CHECKOUT_CONSENTS) as ConsentKind[];
