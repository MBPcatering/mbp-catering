# MBP Catering

Site vitrine et générateur de demandes de devis pour MBP Catering, destiné aux entreprises et aux événements privés à Bruxelles et dans les environs.

## Aperçu

Le MVP comprend :

- pages Accueil, À propos, Catering B2B, Événements privés, Catalogue, Galerie, FAQ, Contact et Demander un devis ;
- navigation multilingue FR, NL et EN ;
- design responsive mobile-first inspiré du catalogue MBP 2026-2027 ;
- formulaire de devis structuré pour une future connexion à Supabase et n8n ;
- validation des règles commerciales principales ;
- endpoints `POST /api/quote-requests` et `POST /api/catalogue-downloads` persistés dans Supabase local.

## Stack

- Next.js 15
- TypeScript
- Tailwind CSS
- Zod
- Vitest
- Supabase CLI et PostgreSQL local via Docker

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
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:stop
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
  -> Next.js / formulaires
  -> Route Handlers Next.js
  -> Supabase / PostgreSQL local ou Cloud
  -> automation_events (outbox transactionnelle)
  -> n8n / e-mails et notifications (à connecter)
  -> Stripe / acompte de 30 % (V2)
```

Les points d’entrée sont `src/app/api/quote-requests/route.ts` et `src/app/api/catalogue-downloads/route.ts`. Le schéma de données est défini dans `src/lib/quote-request.ts` et les validations commerciales dans `src/lib/quote-rules.ts`.

Les migrations dans `supabase/migrations/` créent `quote_requests`, `catalogue_downloads` et `automation_events`. Chaque demande et son événement d’automatisation sont enregistrés par une seule fonction SQL transactionnelle. Les tables sont protégées par RLS : aucune donnée de prospect n’est accessible avec les clés `anon` ou `authenticated`.

## Variables d’environnement

Copiez `.env.example` vers `.env.local`, puis renseignez les valeurs lorsque Supabase et n8n sont configurés :

```bash
cp .env.example .env.local
```

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUBMISSION_FINGERPRINT_SECRET=
N8N_QUOTE_WEBHOOK_URL=
N8N_AUTOMATION_SECRET=
```

Ne publiez jamais les clés serveur ou les secrets dans le navigateur ni dans Git. `N8N_AUTOMATION_SECRET` est distinct de `SUPABASE_SERVICE_ROLE_KEY` : il protège les appels n8n Cloud aux routes privées `/api/internal/automation/*` via l’en-tête `Authorization: Bearer <secret>`.

### Automatisations n8n

Les routes privées suivantes permettent à n8n Cloud de traiter les événements de devis réservés par les fonctions RPC Supabase :

- `POST /api/internal/automation/claim` avec `{ "p_limit": 1 }` ;
- `POST /api/internal/automation/succeeded` avec `{ "event_id": "uuid", "lock_token": "uuid" }` ;
- `POST /api/internal/automation/reschedule` avec `{ "event_id": "uuid", "lock_token": "uuid", "error": "message" }`.

Toutes les réponses utilisent `Cache-Control: no-store`. Les routes ne sont accessibles qu’avec `N8N_AUTOMATION_SECRET`; la clé `SUPABASE_SERVICE_ROLE_KEY` reste exclusivement côté serveur, n’est jamais renvoyée et ne doit jamais être préfixée par `NEXT_PUBLIC_`.

### Démarrage Supabase local

Prérequis : Docker doit être démarré. Aucun compte Supabase Cloud n’est nécessaire.

```bash
npm install
npm run supabase:start
npm run supabase:status -- -o env
```

Copiez `.env.example` vers `.env.local`, puis reportez les valeurs locales affichées par `supabase status` pour `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`. Générez ensuite le secret d’empreinte, uniquement pour `.env.local` :

```bash
cp .env.example .env.local
openssl rand -hex 32
npm run dev
```

Après une modification de migration pendant le développement local, réinitialisez la base pour la rejouer :

```bash
npm run supabase:reset
```

Supabase Studio est disponible à l’URL affichée par `npm run supabase:status`. Les clés locales générées par la CLI ne doivent jamais être copiées dans Git.

### Passage vers Supabase Cloud

Lorsque le compte `tech@mbpcatering.be` sera disponible :

1. Créez le projet Supabase dans la région européenne adaptée, sans modifier ni réécrire les migrations locales.
2. Authentifiez la CLI, liez le projet puis appliquez uniquement les migrations versionnées avec `npm run supabase:db-push`.
3. Dans Vercel, renseignez `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` et `SUBMISSION_FINGERPRINT_SECRET` pour les environnements Preview et Production.
4. Ne préfixez jamais `SUPABASE_SERVICE_ROLE_KEY` ou `SUBMISSION_FINGERPRINT_SECRET` par `NEXT_PUBLIC_`.
5. Vérifiez les politiques RLS et testez les deux endpoints sur Preview avant d’activer n8n ou de modifier le DNS de `mbpcatering.be`.

## Catalogue

Le catalogue 2026-2027 reste la référence commerciale de MBP. Le site en propose une navigation synthétique afin d’éviter de dupliquer ses 33 pages sous forme de nombreuses pages produit.

## Prochaines étapes

1. Déclencher les confirmations client et notifications MBP via n8n depuis `automation_events`.
2. Ajouter les photos, logo et contenus définitifs fournis par MBP.
3. Préparer le paiement de l’acompte de 30 % avec Stripe en V2.
## Déploiement des automatisations n8n

Les routes privées `/api/internal/automation/claim`, `/succeeded` et `/reschedule` sont déployées sur Vercel.

Avant d'activer le workflow n8n, vérifier :

- L'application des migrations Supabase.
- La présence des variables d'environnement requises sur Vercel.
- La protection des routes par `N8N_AUTOMATION_SECRET`.
- Le bon fonctionnement des appels authentifiés.
- Le traitement d'un événement de test de bout en bout.

Ne jamais stocker les secrets dans le dépôt GitHub.
