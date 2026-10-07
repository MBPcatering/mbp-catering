"use client";

import { useState } from "react";
import { evaluateQuoteRequest, RequestType } from "@/lib/quote-rules";

type FormState = { requestType: RequestType; eventDate: string; guestCount: number };

export function QuoteForm() {
  const [state, setState] = useState<FormState>({ requestType: "b2b", eventDate: "", guestCount: 10 });
  const [submitted, setSubmitted] = useState(false);
  const eligibility = state.eventDate ? evaluateQuoteRequest(state) : null;
  const update = (field: keyof FormState, value: string | number) => setState((current) => ({ ...current, [field]: value }));

  return <form className="quote-form" onSubmit={(event) => { event.preventDefault(); if (!eligibility || eligibility.eligible) setSubmitted(true); }}>
    <div className="form-step"><span>01</span><div><h2>Votre événement</h2><p>Quelques détails pour orienter notre proposition.</p></div></div>
    <div className="form-grid"><label>Type de demande<select value={state.requestType} onChange={(event) => update("requestType", event.target.value as RequestType)}><option value="b2b">Catering B2B</option><option value="private">Événement privé</option><option value="other">Autre demande</option></select></label><label>Date de l’événement<input required type="date" value={state.eventDate} onChange={(event) => update("eventDate", event.target.value)} /></label><label>Heure souhaitée<input type="time" /></label><label>Nombre de personnes<input required min="1" type="number" value={state.guestCount} onChange={(event) => update("guestCount", Number(event.target.value))} /></label><label className="span-two">Lieu / adresse de l’événement<input required placeholder="Rue, code postal, ville" /></label></div>
    {eligibility && !eligibility.eligible && <p className="form-alert">{eligibility.reason === "minimum-guests" ? "Nos formules démarrent à 10 personnes. Pour une demande spéciale, contactez-nous." : "Ce délai est trop court pour une confirmation en ligne. Contactez-nous : nous vérifierons ce qui reste possible."}</p>}
    <div className="form-step"><span>02</span><div><h2>Votre envie</h2><p>Nous affinons ensuite ensemble.</p></div></div>
    <div className="form-grid"><label>Offre souhaitée<select><option>À discuter avec MBP</option><option>Pains garnis</option><option>Poké bowls</option><option>Buffet</option><option>Walking dinner / zakouskis</option><option>Petit déjeuner</option></select></label><label>Livraison<select><option>Oui, à livrer</option><option>À emporter</option><option>À préciser</option></select></label><label className="span-two">Vos précisions<textarea rows={4} placeholder="Allergies, service, budget, ambiance ou toute autre information utile…" /></label></div>
    <div className="form-step"><span>03</span><div><h2>Vos coordonnées</h2><p>Nous vous répondons avec une proposition personnalisée.</p></div></div>
    <div className="form-grid"><label>Prénom<input required autoComplete="given-name" /></label><label>Nom<input required autoComplete="family-name" /></label><label>Entreprise <em>(facultatif)</em><input /></label><label>Téléphone<input required type="tel" autoComplete="tel" /></label><label className="span-two">E-mail<input required type="email" autoComplete="email" /></label></div>
    <label className="consent"><input required type="checkbox" /> J’accepte que MBP Catering utilise mes coordonnées pour traiter cette demande.</label>
    <button className="button" disabled={Boolean(eligibility && !eligibility.eligible)}>{submitted ? "Demande prête à être envoyée" : "Envoyer ma demande"}</button>
    {submitted && <p className="success-message">Merci. Votre demande est structurée pour notre équipe et pourra bientôt être transmise à notre système de suivi.</p>}
    <p className="form-note">Minimum 10 personnes · B2B : 48 h minimum · Événement privé : 5 jours minimum · Livraison gratuite dès 250 €</p>
  </form>;
}
