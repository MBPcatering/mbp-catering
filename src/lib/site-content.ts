export const locales = ["fr", "nl", "en"] as const;
export type Locale = (typeof locales)[number];

export const copy = {
  fr: {
    nav: [
      "Accueil",
      "B2B",
      "Événements privés",
      "Catalogue",
      "À propos",
      "Contact",
    ],
    quote: "Demander un devis",
    catalogue: "Voir le catalogue",
    tagline: "My Best Partner",
    hero: "Des tables qui font parler de votre événement.",
    intro:
      "Un catering généreux, précis et vivant pour les moments qui comptent à Bruxelles et dans ses environs.",
    b2b: "Pour les entreprises",
    private: "Pour vos moments privés",
    b2bText:
      "Réunions, lunchs, séminaires ou dîners de direction : une offre souple, pensée pour votre rythme.",
    privateText:
      "Un anniversaire, une réception ou une grande tablée : nous construisons le menu qui rassemble.",
    catalogueTitle: "Le goût du choix, sans le bruit.",
    catalogueText:
      "Notre catalogue 2026-2027 rassemble nos formules signatures. Parcourez-le, puis partagez-nous votre idée.",
    logistics: "Bruxelles & environs · jusqu’à ± 40 km",
    freeDelivery: "Livraison offerte dès 250 €",
  },
  nl: {
    nav: [
      "Home",
      "B2B",
      "Privé-evenementen",
      "Catalogus",
      "Over ons",
      "Contact",
    ],
    quote: "Offerte aanvragen",
    catalogue: "Bekijk de catalogus",
    tagline: "My Best Partner",
    hero: "Tafels waar uw evenement over blijft praten.",
    intro:
      "Royale, verfijnde catering voor de momenten die tellen in Brussel en omgeving.",
    b2b: "Voor bedrijven",
    private: "Voor uw privémomenten",
    b2bText:
      "Vergaderingen, lunches, seminars of directiediners: een flexibele formule op uw ritme.",
    privateText:
      "Een verjaardag, receptie of groot diner: samen maken we een menu dat verbindt.",
    catalogueTitle: "Veel smaak, helder gekozen.",
    catalogueText:
      "Onze catalogus 2026-2027 verzamelt onze signatuurformules. Bekijk hem en vertel ons uw idee.",
    logistics: "Brussel & omgeving · tot ± 40 km",
    freeDelivery: "Gratis levering vanaf €250",
  },
  en: {
    nav: ["Home", "B2B", "Private events", "Catalogue", "About", "Contact"],
    quote: "Request a quote",
    catalogue: "View catalogue",
    tagline: "My Best Partner",
    hero: "Tables your guests will talk about.",
    intro:
      "Generous, considered catering for the moments that matter in Brussels and beyond.",
    b2b: "For business",
    private: "For private moments",
    b2bText:
      "Meetings, lunches, seminars and board dinners: a flexible offer made for your schedule.",
    privateText:
      "A birthday, reception or long-table dinner: we create the menu that brings people together.",
    catalogueTitle: "A world of flavour, clearly curated.",
    catalogueText:
      "Our 2026-2027 catalogue gathers our signature formulas. Browse it, then tell us your idea.",
    logistics: "Brussels & surroundings · up to ± 40 km",
    freeDelivery: "Free delivery from €250",
  },
} as const;

export const routes = [
  "b2b",
  "evenements-prives",
  "catalogue",
  "a-propos",
  "galerie",
  "faq",
  "contact",
  "devis",
  "confidentialite",
] as const;

export type RouteSlug = (typeof routes)[number];

export type DetailPageCopy = {
  title: string;
  lead: string;
  body: string;
  points: readonly string[];
};

export const detailPages: Record<
  Locale,
  Record<Exclude<RouteSlug, "devis">, DetailPageCopy>
> = {
  fr: {
    b2b: {
      title: "Catering B2B, pensé pour votre agenda.",
      lead: "Des formats souples pour les réunions, séminaires, lunchs d’équipe et dîners de direction.",
      body: "De la première réunion à la dernière assiette, MBP compose une proposition qui respecte votre timing, vos invités et votre lieu.",
      points: [
        "Petits déjeuners et lunchs",
        "Pains garnis & poké bowls",
        "Buffets d’entreprise",
        "Dîners de direction",
      ],
    },
    "evenements-prives": {
      title: "Les moments privés ont leur propre rythme.",
      lead: "Réceptions, anniversaires et repas de famille, imaginés à votre façon.",
      body: "Partagez-nous l’ambiance et le nombre d’invités. Nous assemblons la formule qui donne à votre table son caractère.",
      points: [
        "Réceptions et anniversaires",
        "Buffets et plats à partager",
        "Zakouskis & walking dinners",
        "Options sur mesure",
      ],
    },
    catalogue: {
      title: "Le catalogue MBP, votre point de départ.",
      lead: "Notre sélection 2026-2027 réunit les grandes formules qui font notre cuisine.",
      body: "Plutôt que de multiplier les pages, nous gardons le catalogue comme référence vivante. Il vous aide à vous projeter ; l’équipe MBP vous aide à choisir.",
      points: [
        "Zakouskis chauds et froids",
        "Pains garnis classique et premium",
        "Buffets Healthy, Libanais, Italien, Méditerranéen et plus",
        "Desserts, petits déjeuners et dîners de direction",
      ],
    },
    "a-propos": {
      title: "MBP, My Best Partner autour de la table.",
      lead: "Un partenaire fiable pour les entreprises et les moments qui se célèbrent.",
      body: "Notre métier est de rendre l’organisation plus simple et le repas plus mémorable, avec une attention particulière portée aux produits, aux détails et à vos invités.",
      points: [
        "Basé à Bruxelles",
        "Catering B2B & privé",
        "Formules généreuses",
        "Accompagnement personnalisé",
      ],
    },
    galerie: {
      title: "Des tables faites pour se retrouver.",
      lead: "Un aperçu de l’esprit MBP : généreux, coloré, vivant.",
      body: "Les visuels de réalisations seront enrichis avec les photos de MBP. Cette première version donne la structure d’une galerie légère et inspirante.",
      points: [
        "Lunchs d’entreprise",
        "Buffets",
        "Réceptions privées",
        "Détails de table",
      ],
    },
    faq: {
      title: "Les réponses aux questions essentielles.",
      lead: "Les règles les plus utiles avant de nous transmettre votre demande.",
      body: "Votre demande reste unique : ces repères nous permettent de répondre rapidement et d’organiser l’événement dans de bonnes conditions.",
      points: [
        "Minimum de 10 personnes",
        "48 h minimum pour le B2B",
        "5 jours minimum pour les événements privés",
        "Livraison autour de Bruxelles, jusqu’à ± 40 km",
      ],
    },
    contact: {
      title: "Parlons de ce que vous préparez.",
      lead: "Une question avant de demander un devis ? Notre équipe est à votre écoute.",
      body: "Pour une demande complète, le formulaire de devis est le meilleur point de départ. Pour le reste, contactez MBP directement.",
      points: [
        "info@mbpcatering.be",
        "Réponse personnalisée",
        "Bruxelles et environs",
        "Livraison offerte dès 250 €",
      ],
    },
    confidentialite: {
      title: "Votre confidentialité compte.",
      lead: "MBP Catering utilise vos informations uniquement pour répondre à votre demande et assurer le suivi de nos échanges.",
      body: "Vos coordonnées peuvent être collectées lorsque vous demandez un devis ou le catalogue. Elles ne sont pas vendues à des tiers et sont conservées seulement pendant la durée nécessaire au suivi commercial ou légal.",
      points: [
        "Droit d’accès et de rectification",
        "Droit à l’effacement",
        "Retrait du consentement",
        "Contact : info@mbpcatering.be",
      ],
    },
  },
  nl: {
    b2b: {
      title: "B2B-catering op het ritme van uw agenda.",
      lead: "Flexibele formules voor vergaderingen, seminars, teamlunches en directiediners.",
      body: "Van de eerste vergadering tot het laatste bord stelt MBP een voorstel samen dat rekening houdt met uw timing, gasten en locatie.",
      points: [
        "Ontbijten en lunches",
        "Belegde broodjes & poké bowls",
        "Bedrijfsbuffetten",
        "Directiediners",
      ],
    },
    "evenements-prives": {
      title: "Privémomenten hebben hun eigen ritme.",
      lead: "Recepties, verjaardagen en familiemaaltijden, helemaal volgens uw wensen.",
      body: "Vertel ons over de sfeer en het aantal gasten. Wij stellen de formule samen die uw tafel karakter geeft.",
      points: [
        "Recepties en verjaardagen",
        "Buffetten en deelgerechten",
        "Hapjes & walking dinners",
        "Maatwerkopties",
      ],
    },
    catalogue: {
      title: "De MBP-catalogus, uw vertrekpunt.",
      lead: "Onze selectie 2026-2027 brengt de belangrijkste formules van onze keuken samen.",
      body: "In plaats van tientallen pagina’s te maken, houden we de catalogus als levende referentie. Zo kunt u zich een beeld vormen, en helpt MBP u kiezen.",
      points: [
        "Warme en koude hapjes",
        "Klassieke en premium belegde broodjes",
        "Healthy, Libanese, Italiaanse en mediterrane buffetten",
        "Desserts, ontbijten en directiediners",
      ],
    },
    "a-propos": {
      title: "MBP, My Best Partner aan tafel.",
      lead: "Een betrouwbare partner voor bedrijven en momenten die gevierd worden.",
      body: "Wij maken de organisatie eenvoudiger en de maaltijd memorabeler, met aandacht voor producten, details en uw gasten.",
      points: [
        "Gevestigd in Brussel",
        "B2B- en privécatering",
        "Royale formules",
        "Persoonlijke begeleiding",
      ],
    },
    galerie: {
      title: "Tafels om samen te komen.",
      lead: "Een blik op de MBP-sfeer: royaal, kleurrijk en levendig.",
      body: "De realisaties worden nog aangevuld met MBP-foto’s. Deze eerste versie biedt alvast een lichte en inspirerende galerijstructuur.",
      points: [
        "Bedrijfslunches",
        "Buffetten",
        "Privérecepties",
        "Tafeldetails",
      ],
    },
    faq: {
      title: "Antwoorden op de belangrijkste vragen.",
      lead: "De nuttigste richtlijnen voordat u uw aanvraag verstuurt.",
      body: "Elke aanvraag is uniek: deze richtlijnen helpen ons snel te antwoorden en uw evenement onder goede omstandigheden te organiseren.",
      points: [
        "Minimaal 10 personen",
        "Minimaal 48 uur voor B2B",
        "5 dagen voor privé-evenementen",
        "Levering rond Brussel, tot ± 40 km",
      ],
    },
    contact: {
      title: "Vertel ons wat u voorbereidt.",
      lead: "Een vraag voordat u een offerte aanvraagt? Ons team helpt u graag.",
      body: "Voor een volledige aanvraag is het offerteformulier het beste vertrekpunt. Voor andere vragen kunt u MBP rechtstreeks contacteren.",
      points: [
        "info@mbpcatering.be",
        "Persoonlijk antwoord",
        "Brussel en omgeving",
        "Gratis levering vanaf €250",
      ],
    },
    confidentialite: {
      title: "Uw privacy is belangrijk.",
      lead: "MBP Catering gebruikt uw gegevens uitsluitend om uw aanvraag te beantwoorden en onze uitwisseling op te volgen.",
      body: "Uw gegevens kunnen worden verzameld wanneer u een offerte of catalogus aanvraagt. Ze worden niet verkocht aan derden en alleen bewaard zolang dat commercieel of wettelijk nodig is.",
      points: [
        "Recht op inzage en correctie",
        "Recht op verwijdering",
        "Intrekking van toestemming",
        "Contact: info@mbpcatering.be",
      ],
    },
  },
  en: {
    b2b: {
      title: "B2B catering designed around your schedule.",
      lead: "Flexible formats for meetings, seminars, team lunches and board dinners.",
      body: "From the first meeting to the final plate, MBP creates a proposal that respects your timing, guests and venue.",
      points: [
        "Breakfasts and lunches",
        "Sandwiches & poké bowls",
        "Corporate buffets",
        "Board dinners",
      ],
    },
    "evenements-prives": {
      title: "Private occasions have their own rhythm.",
      lead: "Receptions, birthdays and family meals imagined your way.",
      body: "Tell us about the atmosphere and guest count. We assemble the formula that gives your table its character.",
      points: [
        "Receptions and birthdays",
        "Buffets and sharing dishes",
        "Canapés & walking dinners",
        "Tailored options",
      ],
    },
    catalogue: {
      title: "The MBP catalogue, your starting point.",
      lead: "Our 2026-2027 selection brings together the key formulas from our kitchen.",
      body: "Rather than multiplying pages, we keep the catalogue as a living reference. It helps you picture your event, then MBP helps you choose.",
      points: [
        "Hot and cold canapés",
        "Classic and premium sandwiches",
        "Healthy, Lebanese, Italian and Mediterranean buffets",
        "Desserts, breakfasts and board dinners",
      ],
    },
    "a-propos": {
      title: "MBP, My Best Partner around the table.",
      lead: "A trusted partner for business and occasions worth celebrating.",
      body: "We make organisation easier and meals more memorable, with close attention to products, details and your guests.",
      points: [
        "Based in Brussels",
        "Business & private catering",
        "Generous formulas",
        "Personal guidance",
      ],
    },
    galerie: {
      title: "Tables made for gathering.",
      lead: "A glimpse of the MBP spirit: generous, colourful and alive.",
      body: "This selection will be enriched with MBP event photography. This first version already provides a light, inspiring gallery structure.",
      points: [
        "Corporate lunches",
        "Buffets",
        "Private receptions",
        "Table details",
      ],
    },
    faq: {
      title: "Answers to the essential questions.",
      lead: "The most useful guidelines before sending your request.",
      body: "Every request is unique: these guidelines help us respond quickly and organise your event in the right conditions.",
      points: [
        "Minimum of 10 guests",
        "48 hours minimum for B2B",
        "5 days for private events",
        "Delivery around Brussels, up to ± 40 km",
      ],
    },
    contact: {
      title: "Tell us what you are planning.",
      lead: "A question before requesting a quote? Our team is here to help.",
      body: "For a complete request, the quote form is the best place to start. For anything else, contact MBP directly.",
      points: [
        "info@mbpcatering.be",
        "Personalised response",
        "Brussels and surroundings",
        "Free delivery from €250",
      ],
    },
    confidentialite: {
      title: "Your privacy matters.",
      lead: "MBP Catering uses your information only to respond to your request and follow up on our exchanges.",
      body: "Your details may be collected when you request a quote or catalogue. They are never sold to third parties and are kept only for as long as commercially or legally necessary.",
      points: [
        "Right of access and correction",
        "Right to erasure",
        "Withdrawal of consent",
        "Contact: info@mbpcatering.be",
      ],
    },
  },
};

export const footerCopy = {
  fr: {
    heading: ["Des tables qui", "restent en mémoire."],
    explore: ["Accueil", "Catering B2B", "Événements privés", "À propos"],
    discover: [
      "Le catalogue",
      "Galerie",
      "Questions fréquentes",
      "Demander un devis",
    ],
    privacy: "RGPD & confidentialité",
    social: "Suivez MBP",
  },
  nl: {
    heading: ["Tafels die", "bijblijven."],
    explore: ["Home", "B2B-catering", "Privé-evenementen", "Over ons"],
    discover: [
      "De catalogus",
      "Galerij",
      "Veelgestelde vragen",
      "Offerte aanvragen",
    ],
    privacy: "Privacy & AVG",
    social: "Volg MBP",
  },
  en: {
    heading: ["Tables that", "stay with you."],
    explore: ["Home", "B2B catering", "Private events", "About"],
    discover: [
      "The catalogue",
      "Gallery",
      "Frequently asked questions",
      "Request a quote",
    ],
    privacy: "Privacy & GDPR",
    social: "Follow MBP",
  },
} as const;

export const faqCopy = {
  fr: [
    [
      "Quel est le nombre minimum de personnes ?",
      "Nos formules sont prévues à partir de 10 personnes. Certaines catégories peuvent avoir leur propre minimum, par exemple les zakouskis.",
    ],
    [
      "Quel délai faut-il prévoir ?",
      "Au minimum 48 heures pour le B2B et 5 jours pour un événement privé.",
    ],
    [
      "Où livrez-vous ?",
      "À Bruxelles et dans les environs, dans un rayon d’environ 40 km. La livraison est offerte à partir de 250 €.",
    ],
  ],
  nl: [
    [
      "Wat is het minimumaantal personen?",
      "Onze formules zijn voorzien vanaf 10 personen. Sommige categorieën hebben een eigen minimum, bijvoorbeeld hapjes.",
    ],
    [
      "Welke termijn moet ik voorzien?",
      "Minimaal 48 uur voor B2B en 5 dagen voor een privé-evenement.",
    ],
    [
      "Waar leveren jullie?",
      "In Brussel en omgeving, binnen een straal van ongeveer 40 km. Levering is gratis vanaf €250.",
    ],
  ],
  en: [
    [
      "What is the minimum number of guests?",
      "Our formulas are available from 10 guests. Some categories have their own minimum, such as canapés.",
    ],
    [
      "How much notice is required?",
      "At least 48 hours for B2B and 5 days for a private event.",
    ],
    [
      "Where do you deliver?",
      "In Brussels and the surrounding area, within roughly 40 km. Delivery is free from €250.",
    ],
  ],
} as const;
