"use client";

import { FormEvent, useState } from "react";

type DownloadState = "idle" | "loading" | "success" | "error";

export function CatalogueDownloadForm() {
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
        firstName: form.get("firstName"), lastName: form.get("lastName"), company: form.get("company"),
        email: form.get("email"), phone: form.get("phone"), consent: form.get("consent") === "on",
      }),
    });

    if (!response.ok) {
      setState("error");
      return;
    }

    const data = await response.json() as { downloadUrl: string };
    setDownloadUrl(data.downloadUrl);
    setState("success");
  }

  if (state === "success") return <div className="catalogue-success" role="status"><p className="kicker">Merci</p><h2>Votre catalogue est prêt.</h2><p>Merci pour votre intérêt. Utilisez le bouton ci-dessous pour télécharger le catalogue MBP Catering 2026-2027.</p><a className="button" href={downloadUrl} download>Télécharger le catalogue</a></div>;

  return <form className="catalogue-form" onSubmit={submit}>
    <div className="form-grid"><label><span className="field-label">Prénom</span><input name="firstName" required autoComplete="given-name" /></label><label><span className="field-label">Nom</span><input name="lastName" required autoComplete="family-name" /></label><label><span className="field-label">Entreprise <em>(facultatif)</em></span><input name="company" autoComplete="organization" /></label><label><span className="field-label">Téléphone</span><input name="phone" required type="tel" autoComplete="tel" /></label><label className="span-two"><span className="field-label">E-mail professionnel</span><input name="email" required type="email" autoComplete="email" /></label></div>
    <label className="consent"><input name="consent" required type="checkbox" /> J’accepte que MBP Catering utilise mes coordonnées pour me transmettre le catalogue et me recontacter à son sujet.</label>
    <button className="button" disabled={state === "loading"}>{state === "loading" ? "Préparation…" : "Recevoir le catalogue"}</button>
    {state === "error" && <p className="form-alert">Nous n’avons pas pu préparer le catalogue. Vérifiez vos coordonnées et réessayez.</p>}
  </form>;
}
