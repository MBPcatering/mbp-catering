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

### Automatisation n8n V2

La V2 utilise une outbox transactionnelle dans Supabase. Les demandes de devis créent un événement `quote_request.created`, réservé par n8n avec un verrou à usage unique. Les routes sont privées, répondent avec `Cache-Control: no-store` et exigent `Authorization: Bearer <N8N_AUTOMATION_SECRET>`.

`N8N_AUTOMATION_SECRET` est distinct de `SUPABASE_SERVICE_ROLE_KEY`. Configurez-le avec une valeur aléatoire longue dans `.env.local` et dans les environnements Vercel concernés, sans jamais le préfixer par `NEXT_PUBLIC_`, le journaliser ou le versionner. La clé `SUPABASE_SERVICE_ROLE_KEY` reste exclusivement côté serveur.

#### Workflow STAGING

1. `POST /api/internal/automation/claim` avec `{ "p_limit": 1 }` réserve au plus un devis et renvoie `{ "events": [{ "id", "idempotencyKey", "payload", "attempts", "lockToken" }] }`.
2. `POST /api/internal/automation/delivery-started` avec `{ "event_id": "uuid", "lock_token": "uuid" }` doit être appelé immédiatement avant SMTP. Il renvoie `{ "deliveryStarted": true }` ou `{ "deliveryStarted": false, "stale": true }`.
3. Le nœud SMTP envoie le message uniquement après une réponse `deliveryStarted: true`.
4. `POST /api/internal/automation/succeeded` avec `{ "event_id": "uuid", "lock_token": "uuid" }` confirme l’envoi et renvoie `{ "succeeded": true|false }`.
5. Si le résultat SMTP est incertain après le début d’envoi, `POST /api/internal/automation/delivery-unknown` avec `{ "event_id": "uuid", "lock_token": "uuid", "error": "message" }` renvoie `{ "deliveryUnknown": true }` ou `{ "deliveryUnknown": false, "stale": true }`.
6. Pour un échec avant SMTP, `POST /api/internal/automation/reschedule` accepte le même corps que `delivery-unknown` et renvoie `{ "disposition": "retry_scheduled|dead_letter|delivery_unknown|stale", "rescheduled": true|false }`.

#### Workflow ALERTES

Les alertes techniques sont créées de façon idempotente dans `automation_alerts` pour `delivery_unknown` et `dead_letter`.

1. `POST /api/internal/automation/alerts/claim` avec `{ "p_limit": 1 }` renvoie `{ "alerts": [{ "id", "automationEventId", "alertType", "idempotencyKey", "payload", "attempts", "lockToken" }] }` ou `{ "alerts": [] }`.
2. `POST /api/internal/automation/alerts/succeeded` avec `{ "alert_id": "uuid", "lock_token": "uuid" }` renvoie `{ "succeeded": true }` ou `{ "succeeded": false, "stale": true }`.
3. `POST /api/internal/automation/alerts/reschedule` avec `{ "alert_id": "uuid", "lock_token": "uuid", "error": "message" }` renvoie `{ "rescheduled": true }` ou `{ "rescheduled": false, "stale": true }`.

Les corps JSON sont stricts : les identifiants et verrous sont des UUID, `p_limit` est limité à `1` au niveau HTTP et `error` est obligatoire, non vide et limité à 1 000 caractères. Une entrée invalide renvoie `400`, une authentification absente ou invalide `401`, et une erreur de configuration ou Supabase `500` sans détail interne.

#### États, verrouillage et prévention des doublons

- Avant `delivery_started_at`, une réservation expirée peut être reprise sans risque.
- Après `delivery_started_at`, tout échec ou verrou expiré devient `delivery_unknown`. Aucun renvoi automatique n’est autorisé, car SMTP ne garantit pas qu’un message non confirmé n’a pas été remis.
- Après huit échecs confirmés avant SMTP, le devis passe à `dead_letter`; les deux états terminaux génèrent une alerte technique idempotente.
- Les événements historiques `processing` sont considérés comme potentiellement envoyés lors de la migration et seront mis en quarantaine plutôt que renvoyés automatiquement.
- Les alertes techniques utilisent également des verrous de dix minutes et un délai exponentiel plafonné à une heure. Elles n’ont pas encore de limite maximale de tentatives : leur destinataire doit tolérer les doublons éventuels après expiration de verrou.

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
3. Dans Vercel, renseignez `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUBMISSION_FINGERPRINT_SECRET` et `N8N_AUTOMATION_SECRET` pour les environnements Preview et Production.
4. Ne préfixez jamais `SUPABASE_SERVICE_ROLE_KEY`, `SUBMISSION_FINGERPRINT_SECRET` ou `N8N_AUTOMATION_SECRET` par `NEXT_PUBLIC_`.
5. Vérifiez les politiques RLS et testez les deux endpoints sur Preview avant d’activer n8n ou de modifier le DNS de `mbpcatering.be`.

## Catalogue

Le catalogue 2026-2027 reste la référence commerciale de MBP. Le site en propose une navigation synthétique afin d’éviter de dupliquer ses 33 pages sous forme de nombreuses pages produit.

## Prochaines étapes

1. Déclencher les confirmations client et notifications MBP via n8n depuis `automation_events`.
2. Ajouter les photos, logo et contenus définitifs fournis par MBP.
3. Préparer le paiement de l’acompte de 30 % avec Stripe en V2.
## Déploiement des automatisations n8n

Les routes privées doivent être déployées sur Vercel avec les migrations Supabase correspondantes avant toute activation n8n.

Avant d'activer le workflow n8n, vérifier :

- L'application des migrations Supabase.
- La présence des variables d'environnement requises sur Vercel.
- La protection des routes par `N8N_AUTOMATION_SECRET`.
- Le bon fonctionnement des appels authentifiés.
- Le traitement d'un événement de test de bout en bout.

Ne jamais stocker les secrets dans le dépôt GitHub.
