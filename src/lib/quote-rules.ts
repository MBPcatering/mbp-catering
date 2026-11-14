export type RequestType = "b2b" | "private" | "other";

type QuoteRuleInput = {
  requestType: RequestType;
  guestCount: number;
  eventDate: string;
};

export type QuoteEligibility =
  | { status: "accepted"; eligible: true; urgent: false }
  | {
      status: "urgent";
      eligible: true;
      urgent: true;
      reason: "notice_period";
    }
  | {
      status: "rejected";
      eligible: false;
      urgent: false;
      reason: "minimum-guests" | "past-date";
    };

const requiredNoticeHours: Record<RequestType, number> = {
  b2b: 48,
  private: 120,
  other: 120,
};

function parseEventDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  const eventDate = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    eventDate.getFullYear() !== Number(year) ||
    eventDate.getMonth() !== Number(month) - 1 ||
    eventDate.getDate() !== Number(day)
  ) {
    return null;
  }

  return eventDate;
}

export function evaluateQuoteRequest(
  request: QuoteRuleInput,
  now = new Date(),
): QuoteEligibility {
  if (request.guestCount < 10) {
    return {
      status: "rejected",
      eligible: false,
      urgent: false,
      reason: "minimum-guests",
    };
  }

  const eventDate = parseEventDate(request.eventDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!eventDate || eventDate < today) {
    return {
      status: "rejected",
      eligible: false,
      urgent: false,
      reason: "past-date",
    };
  }

  eventDate.setHours(23, 59, 59, 999);
  const noticeHours = (eventDate.getTime() - now.getTime()) / 3_600_000;

  if (noticeHours < requiredNoticeHours[request.requestType]) {
    return {
      status: "urgent",
      eligible: true,
      urgent: true,
      reason: "notice_period",
    };
  }

  return { status: "accepted", eligible: true, urgent: false };
}
