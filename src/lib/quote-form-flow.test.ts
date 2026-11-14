import { describe, expect, it } from "vitest";
import {
  quoteAdditionalServices,
  quoteEventTypes,
  quoteOffers,
} from "./quote-form-options";
import { quoteFormCopy } from "./form-copy";
import {
  createQuoteFormDraft,
  canStartQuoteSubmission,
  getNextQuoteFormStep,
  getQuoteFormControlId,
  getQuoteFormErrorId,
  getPreviousQuoteFormStep,
  getQuoteReviewItems,
  getQuoteSubmissionResult,
  getUrgencyNotice,
  prepareQuoteRequestPayload,
  validateQuoteFormStep,
} from "./quote-form-flow";

const now = new Date("2026-10-29T12:00:00.000Z");

function completeDraft(overrides: Record<string, unknown> = {}) {
  return {
    ...createQuoteFormDraft(),
    requestType: "b2b" as const,
    eventType: "business-lunch",
    eventDate: "2026-11-02",
    guestCount: 20,
    address: "Rue de la Gare 1, 1000 Bruxelles",
    services: ["buffets"],
    firstName: "Ada",
    lastName: "Lovelace",
    company: "MBP Test",
    phone: "+32 470 00 00 00",
    email: "ada@example.test",
    consent: true,
    ...overrides,
  };
}

describe("quote form catalogue", () => {
  it("provides all five step labels in every supported locale", () => {
    for (const locale of ["fr", "nl", "en"] as const) {
      for (const step of [1, 2, 3, 4, 5]) {
        expect(quoteFormCopy[locale][`step${step}`]).toMatch(/\S/);
      }
    }
  });

  it("uses stable catalogue values and never offers delivery or collection as an extra", () => {
    expect(quoteEventTypes.map((option) => option.value)).toEqual([
      "corporate-breakfast",
      "meeting-seminar",
      "business-lunch",
      "cocktail-reception",
      "corporate-dinner",
      "private-event",
      "other",
    ]);
    expect(quoteOffers.map((option) => option.value)).toContain("undecided");
    expect(quoteAdditionalServices.map((option) => option.value)).toEqual([
      "service-staff",
      "other-needs",
    ]);
  });

  it("has translated catalogue labels and delivery guidance in every locale", () => {
    const requiredKeys = [
      ...quoteEventTypes,
      ...quoteOffers,
      ...quoteAdditionalServices,
    ].map((option) => option.labelKey);
    requiredKeys.push(
      "deliveryIncluded",
      "otherRequestHelp",
      "urgentNoticeB2b",
      "urgentNoticePrivate",
      "urgentNoticeOther",
    );

    for (const locale of ["fr", "nl", "en"] as const) {
      for (const key of requiredKeys) {
        expect(quoteFormCopy[locale][key], `${locale}:${key}`).toMatch(/\S/);
      }
    }
  });

  it("describes delivery as included in every locale", () => {
    for (const locale of ["fr", "nl", "en"] as const) {
      expect(quoteFormCopy[locale].rules).not.toMatch(/250|€|EUR/i);
      expect(quoteFormCopy[locale].deliveryIncluded).toMatch(/\S/);
    }
  });
});

describe("quote form flow", () => {
  it("advances through a valid step and preserves the same draft when going back", () => {
    const draft = completeDraft();
    const next = getNextQuoteFormStep(2, draft, now);

    expect(next).toEqual({ step: 3, errors: {} });
    expect(getPreviousQuoteFormStep(next.step)).toBe(2);
    expect(draft.address).toBe("Rue de la Gare 1, 1000 Bruxelles");
  });

  it("builds a review that includes delivery without a collection option", () => {
    const review = getQuoteReviewItems(completeDraft());

    expect(review).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "delivery", value: "delivery" }),
        expect.objectContaining({ key: "eventType", value: "business-lunch" }),
      ]),
    );
    expect(review.some((item) => item.value === "collection")).toBe(false);
  });

  it("provides stable control and error IDs for accessible validation", () => {
    expect(getQuoteFormControlId("services")).toBe("quote-services");
    expect(getQuoteFormErrorId("services")).toBe("quote-services-error");
    expect(getQuoteFormErrorId("consent")).toBe("quote-consent-error");
  });

  it("allows only one submission while a request is pending or already successful", () => {
    expect(canStartQuoteSubmission(false, false)).toBe(true);
    expect(canStartQuoteSubmission(true, false)).toBe(false);
    expect(canStartQuoteSubmission(false, true)).toBe(false);
  });

  it("maps API success and failure to non-sensitive submission states", () => {
    expect(getQuoteSubmissionResult(true)).toEqual({ status: "success" });
    expect(getQuoteSubmissionResult(false)).toEqual({ status: "error" });
  });

  it("requires a company only for B2B contact details", () => {
    const b2bErrors = validateQuoteFormStep(
      completeDraft({ company: "" }),
      4,
      now,
    );
    const privateErrors = validateQuoteFormStep(
      completeDraft({ requestType: "private", company: "" }),
      4,
      now,
    );

    expect(b2bErrors.company).toBe("company-required");
    expect(privateErrors.company).toBeUndefined();
  });

  it("blocks past events and requests below ten guests before review", () => {
    expect(
      validateQuoteFormStep(
        completeDraft({ eventDate: "2026-10-28" }),
        2,
        now,
      ).eventDate,
    ).toBe("past-date");
    expect(
      validateQuoteFormStep(completeDraft({ guestCount: 9 }), 2, now)
        .guestCount,
    ).toBe("minimum-guests");
  });

  it("reports past-date and minimum-guests independently when both rules fail", () => {
    const errors = validateQuoteFormStep(
      completeDraft({ eventDate: "2026-10-28", guestCount: 9 }),
      2,
      now,
    );

    expect(errors).toMatchObject({
      eventDate: "past-date",
      guestCount: "minimum-guests",
    });
  });

  it("keeps an urgent B2B request submittable below 48 hours", () => {
    const draft = completeDraft({ eventDate: "2026-10-30" });

    expect(getUrgencyNotice(draft, now)).toMatchObject({
      status: "urgent",
      reason: "notice_period",
    });
    expect(validateQuoteFormStep(draft, 2, now)).toEqual({});
  });

  it("treats a B2B request at the 48-hour boundary as standard", () => {
    const boundaryNow = new Date(2026, 9, 29, 23, 59, 59, 999);
    const draft = completeDraft({ eventDate: "2026-10-31" });

    expect(getUrgencyNotice(draft, boundaryNow)).toMatchObject({
      status: "accepted",
    });
  });

  it("keeps an urgent private request submittable below 120 hours", () => {
    const draft = completeDraft({
      requestType: "private",
      eventDate: "2026-11-02",
      company: "",
    });

    expect(getUrgencyNotice(draft, now)).toMatchObject({
      status: "urgent",
      reason: "notice_period",
    });
    expect(validateQuoteFormStep(draft, 2, now)).toEqual({});
  });

  it("treats a private request at the 120-hour boundary as standard", () => {
    const boundaryNow = new Date(2026, 9, 29, 23, 59, 59, 999);
    const draft = completeDraft({
      requestType: "private",
      eventDate: "2026-11-03",
      company: "",
    });

    expect(getUrgencyNotice(draft, boundaryNow)).toMatchObject({
      status: "accepted",
    });
  });

  it("keeps the technical 120-hour threshold for other while flagging it for confirmation", () => {
    const draft = completeDraft({
      requestType: "other",
      eventDate: "2026-11-02",
      company: "",
    });

    expect(getUrgencyNotice(draft, now)).toMatchObject({
      status: "urgent",
      requiresCommercialConfirmation: true,
    });
  });

  it("treats other as standard at the retained 120-hour technical boundary", () => {
    const boundaryNow = new Date(2026, 9, 29, 23, 59, 59, 999);
    const draft = completeDraft({
      requestType: "other",
      eventDate: "2026-11-03",
      company: "",
    });

    expect(getUrgencyNotice(draft, boundaryNow)).toMatchObject({
      status: "accepted",
      requiresCommercialConfirmation: true,
    });
  });

  it("always sends delivery as included and never exposes a collection choice", () => {
    const payload = prepareQuoteRequestPayload(completeDraft());

    expect(payload.delivery).toBe("delivery");
    expect(Object.values(payload)).not.toContain("collection");
  });
});
