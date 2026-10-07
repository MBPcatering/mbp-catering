export const locales = ["fr", "nl", "en"] as const;
export type Locale = (typeof locales)[number];

export const copy = {
  fr: {
    nav: ["Accueil", "B2B", "Événements privés", "Catalogue", "À propos", "Contact"],
    quote: "Demander un devis", catalogue: "Voir le catalogue", tagline: "My Best Partner",
    hero: "Des tables qui font parler de votre événement.",
    intro: "Un catering généreux, précis et vivant pour les moments qui comptent à Bruxelles et dans ses environs.",
    b2b: "Pour les entreprises", private: "Pour vos moments privés",
    b2bText: "Réunions, lunchs, séminaires ou dîners de direction : une offre souple, pensée pour votre rythme.",
    privateText: "Un anniversaire, une réception ou une grande tablée : nous construisons le menu qui rassemble.",
    catalogueTitle: "Le goût du choix, sans le bruit.",
    catalogueText: "Notre catalogue 2026-2027 rassemble nos formules signatures. Parcourez-le, puis partagez-nous votre idée.",
    logistics: "Bruxelles & environs · jusqu’à ± 40 km", freeDelivery: "Livraison offerte dès 250 €",
  },
  nl: {
    nav: ["Home", "B2B", "Privé-evenementen", "Catalogus", "Over ons", "Contact"],
    quote: "Offerte aanvragen", catalogue: "Bekijk de catalogus", tagline: "My Best Partner",
    hero: "Tafels waar uw evenement over blijft praten.",
    intro: "Royale, verfijnde catering voor de momenten die tellen in Brussel en omgeving.",
    b2b: "Voor bedrijven", private: "Voor uw privémomenten",
    b2bText: "Vergaderingen, lunches, seminars of directiediners: een flexibele formule op uw ritme.",
    privateText: "Een verjaardag, receptie of groot diner: samen maken we een menu dat verbindt.",
    catalogueTitle: "Veel smaak, helder gekozen.",
    catalogueText: "Onze catalogus 2026-2027 verzamelt onze signatuurformules. Bekijk hem en vertel ons uw idee.",
    logistics: "Brussel & omgeving · tot ± 40 km", freeDelivery: "Gratis levering vanaf €250",
  },
  en: {
    nav: ["Home", "B2B", "Private events", "Catalogue", "About", "Contact"],
    quote: "Request a quote", catalogue: "View catalogue", tagline: "My Best Partner",
    hero: "Tables your guests will talk about.",
    intro: "Generous, considered catering for the moments that matter in Brussels and beyond.",
    b2b: "For business", private: "For private moments",
    b2bText: "Meetings, lunches, seminars and board dinners: a flexible offer made for your schedule.",
    privateText: "A birthday, reception or long-table dinner: we create the menu that brings people together.",
    catalogueTitle: "A world of flavour, clearly curated.",
    catalogueText: "Our 2026-2027 catalogue gathers our signature formulas. Browse it, then tell us your idea.",
    logistics: "Brussels & surroundings · up to ± 40 km", freeDelivery: "Free delivery from €250",
  },
} as const;

export const routes = ["b2b", "evenements-prives", "catalogue", "a-propos", "galerie", "faq", "contact", "devis"] as const;
