"use client";

import { useState } from "react";
import { evaluateQuoteRequest, RequestType } from "@/lib/quote-rules";

type FormState = {
  requestType: RequestType;
  eventDate: string;
  guestCount: number;
};

export function QuoteForm() {
  const [state, setState] = useState<FormState>({
    requestType: "b2b",
    eventDate: "",
    guestCount: 10,
  });
  const [submitted, setSubmitted] = useState(false);
  const eligibility = state.eventDate ? evaluateQuoteRequest(state) : null;
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
          <h2>Votre événement</h2>
          <p>Quelques détails pour orienter notre proposition.</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span className="field-label">Type de demande</span>
          <select
            value={state.requestType}
            onChange={(event) =>
              update("requestType", event.target.value as RequestType)
            }
          >
            <option value="b2b">Catering B2B</option>
            <option value="private">Événement privé</option>
            <option value="other">Autre demande</option>
          </select>
        </label>
        <label>
          <span className="field-label">Date de l’événement</span>
          <input
            required
            type="date"
            value={state.eventDate}
            onChange={(event) => update("eventDate", event.target.value)}
          />
        </label>
        <label>
          <span className="field-label">Moment souhaité</span>
          <select defaultValue="">
            <option value="" disabled>
              Choisissez un moment
            </option>
            <option>Petit-déjeuner</option>
            <option>Lunch</option>
            <option>Dîner</option>
          </select>
        </label>
        <label>
          <span className="field-label">Nombre de personnes</span>
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
          <span className="field-label">Lieu / adresse de l’événement</span>
          <input required placeholder="Rue, code postal, ville" />
        </label>
      </div>
      {eligibility && !eligibility.eligible && (
        <p className="form-alert">
          {eligibility.reason === "minimum-guests"
            ? "Nos formules démarrent à 10 personnes. Pour une demande spéciale, contactez-nous."
            : "Ce délai est trop court pour une confirmation en ligne. Contactez-nous : nous vérifierons ce qui reste possible."}
        </p>
      )}
      <div className="form-step">
        <span>02</span>
        <div>
          <h2>Votre envie</h2>
          <p>Nous affinons ensuite ensemble.</p>
        </div>
      </div>
      <div className="form-grid">
        <fieldset className="offer-choices span-two">
          <legend>
            Offres souhaitées <em>(plusieurs choix possibles)</em>
          </legend>
          <label>
            <input type="checkbox" name="services" value="Pains garnis" /> Pains
            garnis
          </label>
          <label>
            <input type="checkbox" name="services" value="Poké bowls" /> Poké
            bowls
          </label>
          <label>
            <input type="checkbox" name="services" value="Buffet" /> Buffet
          </label>
          <label>
            <input
              type="checkbox"
              name="services"
              value="Walking dinner / zakouskis"
            />{" "}
            Walking dinner / zakouskis
          </label>
          <label>
            <input type="checkbox" name="services" value="Petit déjeuner" />{" "}
            Petit-déjeuner
          </label>
          <label>
            <input
              type="checkbox"
              name="services"
              value="À discuter avec MBP"
            />{" "}
            À discuter avec MBP
          </label>
        </fieldset>
        <div className="delivery-note span-two">
          <strong>Livraison</strong>
          <span>Votre commande est livrée à l’adresse indiquée.</span>
        </div>
        <label className="span-two form-textarea">
          <span className="field-label">Vos précisions</span>
          <textarea
            rows={4}
            placeholder="Allergies, service, budget, ambiance ou toute autre information utile…"
          />
        </label>
      </div>
      <div className="form-step">
        <span>03</span>
        <div>
          <h2>Vos coordonnées</h2>
          <p>Nous vous répondons avec une proposition personnalisée.</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span className="field-label">Prénom</span>
          <input required autoComplete="given-name" />
        </label>
        <label>
          <span className="field-label">Nom</span>
          <input required autoComplete="family-name" />
        </label>
        <label>
          <span className="field-label">
            Entreprise <em>(facultatif)</em>
          </span>
          <input />
        </label>
        <label>
          <span className="field-label">Téléphone</span>
          <input required type="tel" autoComplete="tel" />
        </label>
        <label className="span-two">
          <span className="field-label">E-mail</span>
          <input required type="email" autoComplete="email" />
        </label>
      </div>
      <label className="consent">
        <input required type="checkbox" /> J’accepte que MBP Catering utilise
        mes coordonnées pour traiter cette demande.
      </label>
      <button
        className="button"
        disabled={Boolean(eligibility && !eligibility.eligible)}
      >
        {submitted ? "Demande prête à être envoyée" : "Envoyer ma demande"}
      </button>
      {submitted && (
        <p className="success-message">
          Merci. Votre demande est structurée pour notre équipe et pourra
          bientôt être transmise à notre système de suivi.
        </p>
      )}
      <p className="form-note">
        Minimum 10 personnes · B2B : 48 h minimum · Événement privé : 5 jours
        minimum · Livraison gratuite dès 250 €
      </p>
    </form>
  );
}
