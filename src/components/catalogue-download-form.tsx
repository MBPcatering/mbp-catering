"use client";

import { FormEvent, useState } from "react";
import { catalogueFormCopy } from "@/lib/form-copy";
import { Locale } from "@/lib/site-content";

type DownloadState = "idle" | "loading" | "success" | "error";

export function CatalogueDownloadForm({ locale = "fr" }: { locale?: Locale }) {
  const text = catalogueFormCopy[locale];
  const [state, setState] = useState<DownloadState>("idle");
  const [downloadUrl, setDownloadUrl] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/catalogue-downloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        company: form.get("company"),
        email: form.get("email"),
        phone: form.get("phone"),
        consent: form.get("consent") === "on",
      }),
    });

    if (!response.ok) {
      setState("error");
      return;
    }

    const data = (await response.json()) as { downloadUrl: string };
    setDownloadUrl(data.downloadUrl);
    setState("success");
  }

  if (state === "success")
    return (
      <div className="catalogue-success" role="status">
        <p className="kicker">{text.thanks}</p>
        <h2>{text.ready}</h2>
        <p>{text.success}</p>
        <a className="button" href={downloadUrl} download>
          {text.download}
        </a>
      </div>
    );

  return (
    <form className="catalogue-form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          <span className="field-label">{text.firstName}</span>
          <input name="firstName" required autoComplete="given-name" />
        </label>
        <label>
          <span className="field-label">{text.lastName}</span>
          <input name="lastName" required autoComplete="family-name" />
        </label>
        <label>
          <span className="field-label">
            {text.company} <em>{text.optional}</em>
          </span>
          <input name="company" autoComplete="organization" />
        </label>
        <label>
          <span className="field-label">{text.phone}</span>
          <input name="phone" required type="tel" autoComplete="tel" />
        </label>
        <label className="span-two">
          <span className="field-label">{text.email}</span>
          <input name="email" required type="email" autoComplete="email" />
        </label>
      </div>
      <label className="consent">
        <input name="consent" required type="checkbox" /> {text.consent}
      </label>
      <button className="button" disabled={state === "loading"}>
        {state === "loading" ? text.loading : text.submit}
      </button>
      {state === "error" && <p className="form-alert">{text.error}</p>}
    </form>
  );
}
