"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { quoteFormCopy } from "@/lib/form-copy";
import {
  type QuoteFormDraft,
  type QuoteFormField,
  type QuoteFormStep,
  canStartQuoteSubmission,
  createQuoteFormDraft,
  getNextQuoteFormStep,
  getPreviousQuoteFormStep,
  getQuoteFormControlId,
  getQuoteFormErrorId,
  getQuoteSubmissionResult,
  getUrgencyNotice,
  prepareQuoteRequestPayload,
  validateQuoteFormStep,
} from "@/lib/quote-form-flow";
import {
  quoteAdditionalServices,
  quoteEventTypes,
  quoteOffers,
} from "@/lib/quote-form-options";
import { Locale } from "@/lib/site-content";

const steps: QuoteFormStep[] = [1, 2, 3, 4, 5];

function todayForDateInput() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

export function QuoteForm({ locale = "fr" }: { locale?: Locale }) {
  const text = quoteFormCopy[locale];
  const [draft, setDraft] = useState<QuoteFormDraft>(createQuoteFormDraft);
  const [step, setStep] = useState<QuoteFormStep>(1);
  const [errors, setErrors] = useState<Partial<Record<QuoteFormField, string>>>(
    {},
  );
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);

  const urgency = getUrgencyNotice(draft);
  const minimumEventDate = todayForDateInput();

  useEffect(() => {
    stepHeading.current?.focus();
  }, [step]);

  function update<Field extends QuoteFormField>(
    field: Field,
    value: QuoteFormDraft[Field],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function toggleArrayField(field: "services" | "additionalServices", value: string) {
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function focusFirstError(nextErrors: Partial<Record<QuoteFormField, string>>) {
    const field = Object.keys(nextErrors)[0];
    if (!field) return;
    requestAnimationFrame(() =>
      document.getElementById(getQuoteFormControlId(field as QuoteFormField))?.focus(),
    );
  }

  function goNext() {
    const next = getNextQuoteFormStep(step, draft);
    setErrors(next.errors);
    if (Object.keys(next.errors).length > 0) {
      focusFirstError(next.errors);
      return;
    }
    setStep(next.step);
  }

  function goBack() {
    setErrors({});
    setStep(getPreviousQuoteFormStep(step));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStartQuoteSubmission(isSubmitting, submitted)) return;

    const finalErrors = validateQuoteFormStep(draft, 5);
    if (Object.keys(finalErrors).length > 0) {
      setErrors(finalErrors);
      focusFirstError(finalErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(false);
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(prepareQuoteRequestPayload(draft)),
      });

      if (getQuoteSubmissionResult(response.ok).status === "success") {
        setSubmitted(true);
      } else {
        setSubmissionError(true);
      }
    } catch {
      setSubmissionError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  const requestTypeLabel = {
    b2b: text.requestB2b,
    private: text.requestPrivate,
    other: text.requestOther,
  };
  const optionLabel = (value: string) => {
    const option = [
      ...quoteEventTypes,
      ...quoteOffers,
      ...quoteAdditionalServices,
    ].find((item) => item.value === value);
    return option ? text[option.labelKey] : value;
  };
  const errorMessage = (field: QuoteFormField) =>
    errors[field] ? text[`error${errors[field]}`] ?? text.errorGeneric : undefined;
  const stepLabel = (currentStep: QuoteFormStep) => text[`step${currentStep}`];

  if (submitted) {
    return (
      <div className="quote-form quote-form-success" aria-live="polite">
        <h2>{text.thankYou}</h2>
        <p className="success-message">{text.success}</p>
      </div>
    );
  }

  return (
    <form className="quote-form quote-form-v3" onSubmit={submit} noValidate>
      <ol className="quote-progress" aria-label={text.progressLabel}>
        {steps.map((item) => (
          <li
            key={item}
            className={item === step ? "is-current" : item < step ? "is-complete" : ""}
          >
            <button
              type="button"
              onClick={() => item < step && setStep(item)}
              disabled={item > step}
            >
              <span>{String(item).padStart(2, "0")}</span>
              {stepLabel(item)}
            </button>
          </li>
        ))}
      </ol>

      <section className="quote-step" aria-labelledby="quote-step-title">
        <p className="quote-step-count">
          {text.stepOf.replace("{current}", String(step)).replace("{total}", "5")}
        </p>
        <h2 id="quote-step-title" ref={stepHeading} tabIndex={-1}>
          {stepLabel(step)}
        </h2>

        {step === 1 && (
          <fieldset className="choice-grid">
            <legend>{text.requestType}</legend>
            {(["b2b", "private", "other"] as const).map((type) => (
              <label key={type} className={draft.requestType === type ? "is-selected" : ""}>
                <input
                  id={`quote-requestType-${type}`}
                  type="radio"
                  name="requestType"
                  value={type}
                  checked={draft.requestType === type}
                  onChange={() => update("requestType", type)}
                />
                <span>{requestTypeLabel[type]}</span>
              </label>
            ))}
            {draft.requestType === "other" && (
              <p className="form-note">{text.otherRequestHelp}</p>
            )}
          </fieldset>
        )}

        {step === 2 && (
          <div className="form-grid">
            <label className="span-two">
              <span className="field-label">{text.eventType}</span>
              <select
                id="quote-eventType"
                value={draft.eventType}
                onChange={(event) => update("eventType", event.target.value)}
                aria-describedby={errorMessage("eventType") ? "quote-eventType-error" : undefined}
              >
                <option value="">{text.eventTypePlaceholder}</option>
                {quoteEventTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {text[option.labelKey]}
                  </option>
                ))}
              </select>
              {errorMessage("eventType") && (
                <span id="quote-eventType-error" className="field-error">
                  {errorMessage("eventType")}
                </span>
              )}
            </label>
            <label>
              <span className="field-label">{text.eventDate}</span>
              <input
                id="quote-eventDate"
                min={minimumEventDate}
                type="date"
                value={draft.eventDate}
                onChange={(event) => update("eventDate", event.target.value)}
                aria-describedby={errorMessage("eventDate") ? "quote-eventDate-error" : undefined}
              />
              {errorMessage("eventDate") && (
                <span id="quote-eventDate-error" className="field-error">
                  {errorMessage("eventDate")}
                </span>
              )}
            </label>
            <label>
              <span className="field-label">{text.eventTime}</span>
              <select value={draft.eventTime} onChange={(event) => update("eventTime", event.target.value)}>
                <option value="">{text.chooseTime}</option>
                <option value="breakfast">{text.breakfast}</option>
                <option value="lunch">{text.lunch}</option>
                <option value="dinner">{text.dinner}</option>
              </select>
            </label>
            <label>
              <span className="field-label">{text.guests}</span>
              <input
                id="quote-guestCount"
                min="10"
                type="number"
                value={draft.guestCount}
                onChange={(event) => update("guestCount", Number(event.target.value))}
                aria-describedby={errorMessage("guestCount") ? "quote-guestCount-error" : undefined}
              />
              {errorMessage("guestCount") && (
                <span id="quote-guestCount-error" className="field-error">
                  {errorMessage("guestCount")}
                </span>
              )}
            </label>
            <label className="span-two">
              <span className="field-label">{text.address}</span>
              <input
                id="quote-address"
                autoComplete="street-address"
                value={draft.address}
                onChange={(event) => update("address", event.target.value)}
                placeholder={text.placeholder}
                aria-describedby={errorMessage("address") ? "quote-address-error" : undefined}
              />
              {errorMessage("address") && (
                <span id="quote-address-error" className="field-error">
                  {errorMessage("address")}
                </span>
              )}
            </label>
            {urgency?.status === "urgent" && (
              <p className="form-alert span-two">
                {draft.requestType === "b2b"
                  ? text.urgentNoticeB2b
                  : draft.requestType === "private"
                    ? text.urgentNoticePrivate
                    : text.urgentNoticeOther}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="form-grid">
            <fieldset
              id={getQuoteFormControlId("services")}
              className="offer-choices span-two"
              aria-describedby={errorMessage("services") ? "quote-services-error" : undefined}
            >
              <legend>
                {text.offers} <em>{text.multiple}</em>
              </legend>
              {quoteOffers.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={draft.services.includes(option.value)}
                    onChange={() => toggleArrayField("services", option.value)}
                  /> {text[option.labelKey]}
                </label>
              ))}
              {errorMessage("services") && (
                <span id={getQuoteFormErrorId("services")} className="field-error">
                  {errorMessage("services")}
                </span>
              )}
            </fieldset>
            <fieldset className="offer-choices span-two">
              <legend>{text.additionalServices}</legend>
              {quoteAdditionalServices.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={draft.additionalServices.includes(option.value)}
                    onChange={() => toggleArrayField("additionalServices", option.value)}
                  /> {text[option.labelKey]}
                </label>
              ))}
            </fieldset>
            <p className="delivery-included span-two">
              <strong>{text.deliveryIncluded}</strong>
              <span>{text.deliveryText}</span>
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="form-grid">
            <label><span className="field-label">{text.firstName}</span><input id="quote-firstName" autoComplete="given-name" value={draft.firstName} onChange={(event) => update("firstName", event.target.value)} aria-describedby={errorMessage("firstName") ? getQuoteFormErrorId("firstName") : undefined} />{errorMessage("firstName") && <span id={getQuoteFormErrorId("firstName")} className="field-error">{errorMessage("firstName")}</span>}</label>
            <label><span className="field-label">{text.lastName}</span><input id="quote-lastName" autoComplete="family-name" value={draft.lastName} onChange={(event) => update("lastName", event.target.value)} aria-describedby={errorMessage("lastName") ? getQuoteFormErrorId("lastName") : undefined} />{errorMessage("lastName") && <span id={getQuoteFormErrorId("lastName")} className="field-error">{errorMessage("lastName")}</span>}</label>
            <label><span className="field-label">{text.company} {draft.requestType !== "b2b" && <em>{text.optional}</em>}</span><input id="quote-company" autoComplete="organization" value={draft.company} onChange={(event) => update("company", event.target.value)} aria-describedby={errorMessage("company") ? getQuoteFormErrorId("company") : undefined} />{errorMessage("company") && <span id={getQuoteFormErrorId("company")} className="field-error">{errorMessage("company")}</span>}</label>
            <label><span className="field-label">{text.phone}</span><input id="quote-phone" autoComplete="tel" type="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} aria-describedby={errorMessage("phone") ? getQuoteFormErrorId("phone") : undefined} />{errorMessage("phone") && <span id={getQuoteFormErrorId("phone")} className="field-error">{errorMessage("phone")}</span>}</label>
            <label className="span-two"><span className="field-label">{text.email}</span><input id="quote-email" autoComplete="email" type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} aria-describedby={errorMessage("email") ? getQuoteFormErrorId("email") : undefined} />{errorMessage("email") && <span id={getQuoteFormErrorId("email")} className="field-error">{errorMessage("email")}</span>}</label>
          </div>
        )}

        {step === 5 && (
          <>
            <div className="quote-review">
              <p><strong>{text.requestType}</strong><span>{requestTypeLabel[draft.requestType]}</span></p>
              <p><strong>{text.eventType}</strong><span>{optionLabel(draft.eventType)}</span></p>
              <p><strong>{text.eventDate}</strong><span>{draft.eventDate}</span></p>
              <p><strong>{text.guests}</strong><span>{draft.guestCount}</span></p>
              <p><strong>{text.address}</strong><span>{draft.address}</span></p>
              <p><strong>{text.offers}</strong><span>{draft.services.map(optionLabel).join(", ")}</span></p>
              {draft.additionalServices.length > 0 && <p><strong>{text.additionalServices}</strong><span>{draft.additionalServices.map(optionLabel).join(", ")}</span></p>}
              <p><strong>{text.delivery}</strong><span>{text.deliveryIncluded}</span></p>
            </div>
            <label className="form-textarea"><span className="field-label">{text.notes}</span><textarea id="quote-notes" rows={4} value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder={text.notesPlaceholder} aria-describedby={errorMessage("notes") ? "quote-notes-error" : undefined} />{errorMessage("notes") && <span id="quote-notes-error" className="field-error">{errorMessage("notes")}</span>}</label>
            <label className="consent"><input id="quote-consent" type="checkbox" checked={draft.consent} onChange={(event) => update("consent", event.target.checked)} aria-describedby={errorMessage("consent") ? getQuoteFormErrorId("consent") : undefined} /> {text.consent}</label>
            {errorMessage("consent") && <p id={getQuoteFormErrorId("consent")} className="field-error">{errorMessage("consent")}</p>}
          </>
        )}
      </section>

      <div className="quote-navigation">
        {step > 1 && <button type="button" className="button button-secondary" onClick={goBack}>{text.previous}</button>}
        {step < 5 ? <button type="button" className="button" onClick={goNext}>{text.next}</button> : <button className="button" disabled={isSubmitting}>{isSubmitting ? text.submitting : text.submit}</button>}
      </div>
      <div aria-live="polite">{submissionError && <p className="form-alert">{text.submitError}</p>}</div>
      <p className="form-note">{text.rules}</p>
    </form>
  );
}
