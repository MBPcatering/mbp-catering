# MBP Catering

Site vitrine et générateur de demandes de devis pour MBP Catering, destiné aux entreprises et aux événements privés à Bruxelles et dans les environs.

## Aperçu

Le MVP comprend :

- pages Accueil, À propos, Catering B2B, Événements privés, Catalogue, Galerie, FAQ, Contact et Demander un devis ;
- navigation multilingue FR, NL et EN ;
- design responsive mobile-first inspiré du catalogue MBP 2026-2027 ;
- formulaire de devis structuré pour une future connexion à Supabase et n8n ;
- validation des règles commerciales principales ;
- endpoint `POST /api/quote-requests` prêt à recevoir les demandes qualifiées.

## Stack

- Next.js 15
- TypeScript
- Tailwind CSS
- Zod
- Vitest

## Installation

```bash
npm install
npm run dev
```

Ouvrez ensuite [http://localhost:3000/fr](http://localhost:3000/fr).

## Commandes utiles

```bash
npm run dev
npm test
npm run build
```

## Règles commerciales

| Règle | Valeur |
| --- | --- |
| Minimum de commande | 10 personnes |
| Délai B2B | 48 heures minimum |
| Délai événements privés | 5 jours minimum |
| Zone de livraison | Bruxelles et environs, environ 40 km |
| Livraison offerte | Dès 250 € |
| Acompte V2 | 30 % à l’acceptation du devis |

Certaines familles de produits peuvent disposer de leurs propres minimums. Par exemple, les zakouskis sont prévus à partir de 50 pièces dans le catalogue de référence.

## Architecture

```text
Visiteur
  -> Next.js / formulaire de devis
  -> Supabase / PostgreSQL
  -> n8n / e-mails et notifications
  -> Stripe / acompte de 30 % (V2)
```

Le point d’entrée applicatif du devis est `src/app/api/quote-requests/route.ts`. Le schéma de données est défini dans `src/lib/quote-request.ts` et les validations commerciales dans `src/lib/quote-rules.ts`.

## Variables d’environnement

Copiez `.env.example` vers `.env.local`, puis renseignez les valeurs lorsque Supabase et n8n sont configurés :

```bash
cp .env.example .env.local
```

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
N8N_QUOTE_WEBHOOK_URL=
```

Ne publiez jamais les clés serveur ou les secrets dans le navigateur ni dans Git.

## Catalogue

Le catalogue 2026-2027 reste la référence commerciale de MBP. Le site en propose une navigation synthétique afin d’éviter de dupliquer ses 33 pages sous forme de nombreuses pages produit.

## Prochaines étapes

1. Connecter le formulaire à une table `quote_requests` dans Supabase.
2. Déclencher les confirmations client et notifications MBP via n8n.
3. Ajouter les photos, logo et contenus définitifs fournis par MBP.
4. Préparer le paiement de l’acompte de 30 % avec Stripe en V2.
