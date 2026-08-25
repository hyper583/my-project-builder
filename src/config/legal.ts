/**
 * Who is operating this service, and when the terms last changed.
 *
 * Everything a lawyer or a payment processor needs to identify you lives here
 * rather than being typed into three pages, so the answer cannot differ
 * depending on which page a student reads.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE VALUES MARKED "TO BE COMPLETED" ARE NOT REAL AND MUST BE FILLED IN BEFORE
 * TAKING LIVE PAYMENTS. Paystack asks to see these pages when approving a live
 * account, and an operator a customer cannot identify or contact is a fair
 * reason to refuse one. Nothing here has been reviewed by a lawyer.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const LEGAL = {
  /** The trading name shown to students. */
  serviceName: "My Project Builder",

  /** The person or registered company that contracts with the student. */
  operator: "TO BE COMPLETED — your name, or your registered company name",

  /** Registered address. Required by Paystack, and by consumer law generally. */
  address: "TO BE COMPLETED — registered or business address",

  /** Where a student writes about their account, a refund, or their data. */
  contactEmail: "TO BE COMPLETED — a support address you monitor",

  /**
   * When these documents last changed.
   *
   * Written by hand rather than generated from the build date: a date that
   * moves every deploy tells a reader nothing about whether the terms they
   * agreed to are still the terms.
   */
  lastUpdated: "25 August 2026",

  /** The country whose law governs the agreement and whose courts hear disputes. */
  jurisdiction: "the Federal Republic of Nigeria",
} as const;

/** True while the placeholders above are still placeholders. */
export const legalDetailsIncomplete: boolean = [
  LEGAL.operator,
  LEGAL.address,
  LEGAL.contactEmail,
].some((value) => value.startsWith("TO BE COMPLETED"));
