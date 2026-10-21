"use client";

import { useState } from "react";
import { evaluateQuoteRequest, RequestType } from "@/lib/quote-rules";
import { quoteFormCopy } from "@/lib/form-copy";
import { Locale } from "@/lib/site-content";

type FormState = {
  requestType: RequestType;
  eventDate: string;
  guestCount: number;
};

function todayForDateInput() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

export function QuoteForm({ locale = "fr" }: { locale?: Locale }) {
  const text = quoteFormCopy[locale];
  const [state, setState] = useState<FormState>({
    requestType: "b2b",
    eventDate: "",
    guestCount: 10,
  });
  const [submitted, setSubmitted] = useState(false);
  const eligibility = state.eventDate ? evaluateQuoteRequest(state) : null;
  const minimumEventDate = todayForDateInput();
  const update = (field: keyof FormState, value: string | number) =>
    setState((current) => ({ ...current, [field]: value }));

  return (
    <form
      className="quote-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!eligibility || eligibility.eligible) setSubmitted(true);
      }}
    >
      <div className="form-step">
        <span>01</span>
        <div>
          <h2>{text.event}</h2>
          <p>{text.eventHelp}</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span className="field-label">{text.requestType}</span>
          <select
            value={state.requestType}
            onChange={(event) =>
              update("requestType", event.target.value as RequestType)
            }
          >
            <option value="b2b">{text.requestB2b}</option>
            <option value="private">{text.requestPrivate}</option>
            <option value="other">{text.requestOther}</option>
          </select>
        </label>
        <label>
          <span className="field-label">{text.eventDate}</span>
          <input
            required
            min={minimumEventDate}
            type="date"
            value={state.eventDate}
            onChange={(event) => update("eventDate", event.target.value)}
          />
        </label>
        <label>
          <span className="field-label">{text.eventTime}</span>
          <select defaultValue="">
            <option value="" disabled>
              {text.chooseTime}
            </option>
            <option>{text.breakfast}</option>
            <option>{text.lunch}</option>
            <option>{text.dinner}</option>
          </select>
        </label>
        <label>
          <span className="field-label">{text.guests}</span>
          <input
            required
            min="10"
            type="number"
            value={state.guestCount}
            onChange={(event) =>
              update("guestCount", Number(event.target.value))
            }
          />
        </label>
        <label className="span-two">
          <span className="field-label">{text.address}</span>
          <input required placeholder={text.placeholder} />
        </label>
      </div>
      {eligibility && !eligibility.eligible && (
        <p className="form-alert">
          {eligibility.reason === "minimum-guests"
            ? text.alertMinimum
            : eligibility.reason === "past-date"
              ? text.alertPastDate
              : text.alertDeadline}
        </p>
      )}
      <div className="form-step">
        <span>02</span>
        <div>
          <h2>{text.wishes}</h2>
          <p>{text.wishesHelp}</p>
        </div>
      </div>
      <div className="form-grid">
        <fieldset className="offer-choices span-two">
          <legend>
            {text.offers} <em>{text.multiple}</em>
          </legend>
          <label>
            <input type="checkbox" name="services" value="sandwiches" />{" "}
            {text.serviceSandwiches}
          </label>
          <label>
            <input type="checkbox" name="services" value="poke-bowls" />{" "}
            {text.servicePoke}
          </label>
          <label>
            <input type="checkbox" name="services" value="buffet" />{" "}
            {text.serviceBuffet}
          </label>
          <label>
            <input type="checkbox" name="services" value="walking-dinner" />{" "}
            {text.serviceWalkingDinner}
          </label>
          <label>
            <input type="checkbox" name="services" value="breakfast" />{" "}
            {text.serviceBreakfast}
          </label>
          <label>
            <input type="checkbox" name="services" value="discuss-with-mbp" />{" "}
            {text.serviceDiscuss}
          </label>
        </fieldset>
        <div className="delivery-note span-two">
          <strong>{text.delivery}</strong>
          <span>{text.deliveryText}</span>
        </div>
        <label className="span-two form-textarea">
          <span className="field-label">{text.notes}</span>
          <textarea rows={4} placeholder={text.notesPlaceholder} />
        </label>
      </div>
      <div className="form-step">
        <span>03</span>
        <div>
          <h2>{text.contacts}</h2>
          <p>{text.contactsHelp}</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span className="field-label">{text.firstName}</span>
          <input required autoComplete="given-name" />
        </label>
        <label>
          <span className="field-label">{text.lastName}</span>
          <input required autoComplete="family-name" />
        </label>
        <label>
          <span className="field-label">
            {text.company} <em>{text.optional}</em>
          </span>
          <input />
        </label>
        <label>
          <span className="field-label">{text.phone}</span>
          <input required type="tel" autoComplete="tel" />
        </label>
        <label className="span-two">
          <span className="field-label">{text.email}</span>
          <input required type="email" autoComplete="email" />
        </label>
      </div>
      <label className="consent">
        <input required type="checkbox" /> {text.consent}
      </label>
      <button
        className="button"
        disabled={Boolean(eligibility && !eligibility.eligible)}
      >
        {submitted ? text.submitted : text.submit}
      </button>
      {submitted && <p className="success-message">{text.success}</p>}
      <p className="form-note">{text.rules}</p>
    </form>
  );
}
