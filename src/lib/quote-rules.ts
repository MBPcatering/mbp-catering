export type RequestType = "b2b" | "private" | "other";

type QuoteRuleInput = {
  requestType: RequestType;
  guestCount: number;
  eventDate: string;
};

export type QuoteEligibility =
  | { eligible: true }
  | { eligible: false; reason: "minimum-guests" | "notice-period" };

const requiredNoticeHours: Record<RequestType, number> = {
  b2b: 48,
  private: 120,
  other: 120,
};

export function evaluateQuoteRequest(
  request: QuoteRuleInput,
  now = new Date(),
): QuoteEligibility {
  if (request.guestCount < 10) {
    return { eligible: false, reason: "minimum-guests" };
  }

  const eventDate = new Date(`${request.eventDate}T23:59:59`);
  const noticeHours = (eventDate.getTime() - now.getTime()) / 3_600_000;

  if (noticeHours < requiredNoticeHours[request.requestType]) {
    return { eligible: false, reason: "notice-period" };
  }

  return { eligible: true };
}
