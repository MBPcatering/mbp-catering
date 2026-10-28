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

#### Workflow ALERTES V3 — proposition locale non déployée

La V3 des alertes est implémentée et testée localement, mais la migration Supabase, les routes associées et le workflow n8n ne sont pas encore déployés. Le workflow V2 ALERTES Cloud reste inactif.

Les alertes techniques restent idempotentes dans `automation_alerts`, avec une seule alerte par couple événement/type (`delivery_unknown` ou `dead_letter`). Leur traitement V3 suit la séquence `claim → delivery-started → SMTP → succeeded | delivery-unknown` :

1. `POST /api/internal/automation/alerts/claim` avec `{ "p_limit": 1 }` réserve une alerte et renvoie `{ "alerts": [{ "id", "automationEventId", "alertType", "idempotencyKey", "payload", "attempts", "lockToken" }] }` ou `{ "alerts": [] }`.
2. `POST /api/internal/automation/alerts/delivery-started` avec `{ "alert_id": "uuid", "lock_token": "uuid" }` doit confirmer `{ "deliveryStarted": true }` avant tout SMTP. Un résultat `false` ou `stale` bloque l'envoi.
3. `POST /api/internal/automation/alerts/succeeded` confirme une livraison SMTP connue avec le même verrou.
4. Après un résultat SMTP incertain, `POST /api/internal/automation/alerts/delivery-unknown` met l'alerte en quarantaine. Aucun retry automatique n'est alors autorisé.
5. `POST /api/internal/automation/alerts/reschedule` ne traite que les erreurs certaines survenues avant SMTP et renvoie une disposition `retry_scheduled`, `dead_letter`, `delivery_unknown` ou `stale`.

Les corps JSON sont stricts : les identifiants et verrous sont des UUID, `p_limit` est limité à `1` au niveau HTTP et `error` est obligatoire, non vide et limité à 1 000 caractères. Une entrée invalide renvoie `400`, une authentification absente ou invalide `401`, et une erreur de configuration ou Supabase `500` sans détail interne.

#### États, verrouillage et prévention des doublons

- Avant `delivery_started_at`, une réservation expirée peut être reprise sans risque.
- Après `delivery_started_at`, tout échec ou verrou expiré devient `delivery_unknown`. Aucun renvoi automatique n’est autorisé, car SMTP ne garantit pas qu’un message non confirmé n’a pas été remis.
- Après huit échecs confirmés avant SMTP, le devis passe à `dead_letter`; les deux états terminaux génèrent une alerte technique idempotente.
- Les événements historiques `processing` sont considérés comme potentiellement envoyés lors de la migration et seront mis en quarantaine plutôt que renvoyés automatiquement.
- Les alertes techniques V3 ont elles aussi un verrou de dix minutes. Toute transition vérifie strictement l'identifiant, le `lockToken` courant et la validité temporelle du verrou ; un token expiré ou obsolète est rejeté sans changement d'état.
- Seules les erreurs certaines avant SMTP sont replanifiées, avec un backoff exponentiel plafonné à une heure. Après huit tentatives, l'alerte passe à `dead_letter`.
- Après `delivery_started_at`, un timeout, une erreur SMTP incertaine ou l'expiration du verrou place l'alerte dans `delivery_unknown`. Aucun renvoi automatique n'est permis depuis `delivery_unknown` ou `dead_letter`.
- Les états `delivery_unknown` et `dead_letter` exigent une revue et une résolution manuelles avant toute reprise éventuelle.

### Monitoring indépendant — socle local non déployé

Le dépôt contient un socle de monitoring local, distinct de n8n. Il n'est pas encore migré sur Supabase Cloud, déployé sur Vercel ou raccordé à Uptime Kuma.

Deux workflows logiques peuvent envoyer un heartbeat minimal : `staging` et `alerts`. Une migration crée uniquement des lignes techniques avec l'heure du dernier cycle et leur état d'activation attendu ; elle ne stocke ni devis, ni adresse e-mail, ni téléphone, ni `lockToken`.

- `POST /api/internal/monitoring/heartbeat` accepte uniquement `{ "workflow": "staging" | "alerts" }` et exige `Authorization: Bearer <AUTOMATION_HEARTBEAT_SECRET>`.
- `GET /api/internal/monitoring/status` exige `Authorization: Bearer <MONITOR_SECRET>` et renvoie uniquement un état `healthy`, `warning`, `critical` ou `unknown`, ainsi que des compteurs techniques agrégés. `healthy` et `warning` répondent `200`; `critical` et `unknown` répondent `503`, afin qu'un moniteur HTTP ne traite jamais un incident comme sain.
- Les réponses sont systématiquement `Cache-Control: no-store`. Aucun endpoint de monitoring ne doit être rendu public.

Les seuils centralisés sont : heartbeat attendu toutes les 5 minutes, incident après 15 minutes sans heartbeat, traitement éligible en retard après 10 minutes et alerte de tentatives élevées à partir de 6 sur 8. Les workflows ne sont surveillés que lorsque leur ligne technique est explicitement marquée comme attendue active ; ainsi, les workflows n8n actuellement inactifs ne créent pas de faux incident.

Un heartbeat absent ou incohérent, un verrou expiré, `delivery_unknown` et `dead_letter` sont renvoyés comme `critical`. Les verrous expirés sont volontairement considérés critiques : sans connaître le début effectif d'un SMTP, le monitor adopte le scénario le plus sûr.

#### Configuration future d'Uptime Kuma

Uptime Kuma devra être hébergé séparément de n8n et de Vercel. Il devra contrôler :

1. La disponibilité publique du site ou de l'API Vercel.
2. L'endpoint privé de statut avec `MONITOR_SECRET` transmis dans l'en-tête Authorization.
3. La disponibilité réseau de n8n Cloud, sans lire de données d'exécution.

Les notifications doivent passer par un canal distinct de n8n. Elles doivent contenir uniquement l'état global et des compteurs, jamais un payload de devis, une erreur SMTP brute ou un `lockToken`.

#### Ordre de déploiement futur

1. Créer une sauvegarde Supabase récente et vérifier les migrations V3 puis monitoring en dry-run.
2. Appliquer V3, puis la migration de monitoring, sur Supabase Cloud après autorisation explicite.
3. Déployer les routes Next.js et renseigner `AUTOMATION_HEARTBEAT_SECRET` et `MONITOR_SECRET` dans Vercel, sans préfixe `NEXT_PUBLIC_`.
4. Configurer Uptime Kuma et vérifier les réponses `healthy`, `warning`, `critical` et `unknown` avec des données synthétiques.
5. Marquer les workflows attendus actifs, puis ajouter leurs heartbeats n8n sans activer les workflows avant une validation distincte.

Pour revenir en arrière avant activation, laisser les workflows comme non attendus actifs et retirer les routes de la version déployée suivante. Aucun workflow n8n, SMTP ou état d'outbox ne doit être modifié par le monitor.

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
