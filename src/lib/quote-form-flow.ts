import { type RequestType, evaluateQuoteRequest } from "./quote-rules";
import { deliveryValue } from "./quote-form-options";

export type QuoteFormStep = 1 | 2 | 3 | 4 | 5;

export type QuoteFormDraft = {
  requestType: RequestType;
  eventType: string;
  eventDate: string;
  eventTime: string;
  guestCount: number;
  address: string;
  services: string[];
  additionalServices: string[];
  notes: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  email: string;
  consent: boolean;
};

export type QuoteFormField = keyof QuoteFormDraft;
export type QuoteFormErrors = Partial<Record<QuoteFormField, string>>;

export type QuoteReviewItem = {
  key: keyof QuoteFormDraft | "delivery";
  value: string | number | boolean | string[];
};

export type UrgencyNotice = ReturnType<typeof evaluateQuoteRequest> & {
  requiresCommercialConfirmation?: boolean;
};

export function getQuoteFormControlId(field: QuoteFormField) {
  return `quote-${field}`;
}

export function getQuoteFormErrorId(field: QuoteFormField) {
  return `${getQuoteFormControlId(field)}-error`;
}

export function createQuoteFormDraft(): QuoteFormDraft {
  return {
    requestType: "b2b",
    eventType: "",
    eventDate: "",
    eventTime: "",
    guestCount: 10,
    address: "",
    services: [],
    additionalServices: [],
    notes: "",
    firstName: "",
    lastName: "",
    company: "",
    phone: "",
    email: "",
    consent: false,
  };
}

export function getUrgencyNotice(
  draft: Pick<QuoteFormDraft, "requestType" | "eventDate" | "guestCount">,
  now = new Date(),
): UrgencyNotice | null {
  if (!draft.eventDate) return null;

  const eligibility = evaluateQuoteRequest(draft, now);
  return draft.requestType === "other"
    ? { ...eligibility, requiresCommercialConfirmation: true }
    : eligibility;
}

export function validateQuoteFormStep(
  draft: QuoteFormDraft,
  step: QuoteFormStep,
  now = new Date(),
): QuoteFormErrors {
  const errors: QuoteFormErrors = {};

  if (step === 1 && !["b2b", "private", "other"].includes(draft.requestType)) {
    errors.requestType = "request-type-required";
  }

  if (step === 2) {
    if (!draft.eventType.trim()) errors.eventType = "event-type-required";
    if (!draft.eventDate) {
      errors.eventDate = "event-date-required";
    } else {
      const eligibility = evaluateQuoteRequest(
        { ...draft, guestCount: Math.max(draft.guestCount, 10) },
        now,
      );
      if (eligibility.status === "rejected" && eligibility.reason === "past-date") {
        errors.eventDate = eligibility.reason;
      }
    }
    if (draft.guestCount < 10) errors.guestCount = "minimum-guests";
    if (draft.address.trim().length < 4) errors.address = "address-required";
  }

  if (step === 3 && draft.services.length === 0) {
    errors.services = "service-required";
  }

  if (step === 4) {
    if (!draft.firstName.trim()) errors.firstName = "first-name-required";
    if (!draft.lastName.trim()) errors.lastName = "last-name-required";
    if (draft.requestType === "b2b" && !draft.company.trim()) {
      errors.company = "company-required";
    }
    if (draft.phone.trim().length < 6) errors.phone = "phone-required";
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) errors.email = "email-invalid";
  }

  if (step === 5) {
    if (
      draft.additionalServices.includes("other-needs") &&
      !draft.notes.trim()
    ) {
      errors.notes = "other-needs-required";
    }
    if (!draft.consent) errors.consent = "consent-required";
  }

  return errors;
}

export function getNextQuoteFormStep(
  step: QuoteFormStep,
  draft: QuoteFormDraft,
  now = new Date(),
): { step: QuoteFormStep; errors: QuoteFormErrors } {
  const errors = validateQuoteFormStep(draft, step, now);
  if (Object.keys(errors).length > 0 || step === 5) return { step, errors };
  return { step: (step + 1) as QuoteFormStep, errors };
}

export function getPreviousQuoteFormStep(step: QuoteFormStep): QuoteFormStep {
  return (step === 1 ? 1 : step - 1) as QuoteFormStep;
}

export function getQuoteReviewItems(draft: QuoteFormDraft): QuoteReviewItem[] {
  return [
    { key: "requestType", value: draft.requestType },
    { key: "eventType", value: draft.eventType },
    { key: "eventDate", value: draft.eventDate },
    { key: "eventTime", value: draft.eventTime },
    { key: "guestCount", value: draft.guestCount },
    { key: "address", value: draft.address },
    { key: "services", value: draft.services },
    { key: "additionalServices", value: draft.additionalServices },
    { key: "delivery", value: deliveryValue },
    { key: "notes", value: draft.notes },
    { key: "firstName", value: draft.firstName },
    { key: "lastName", value: draft.lastName },
    { key: "company", value: draft.company },
    { key: "phone", value: draft.phone },
    { key: "email", value: draft.email },
  ];
}

export function canStartQuoteSubmission(
  isSubmitting: boolean,
  submitted: boolean,
) {
  return !isSubmitting && !submitted;
}

export function getQuoteSubmissionResult(ok: boolean) {
  return ok ? { status: "success" as const } : { status: "error" as const };
}

export function prepareQuoteRequestPayload(draft: QuoteFormDraft) {
  return {
    requestType: draft.requestType,
    eventDate: draft.eventDate,
    eventTime: draft.eventTime || undefined,
    eventType: draft.eventType,
    guestCount: draft.guestCount,
    address: draft.address,
    services: draft.services,
    additionalServices: draft.additionalServices,
    delivery: deliveryValue,
    notes: draft.notes || undefined,
    firstName: draft.firstName,
    lastName: draft.lastName,
    company: draft.company || undefined,
    phone: draft.phone,
    email: draft.email,
    consent: draft.consent,
  };
}
