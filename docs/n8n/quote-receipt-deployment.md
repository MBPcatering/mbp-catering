# Accusé de réception des devis — déploiement contrôlé

Le workflow proposé dans `mbp-catering-v3-quote-receipt-event-driven.proposal.json` reste **inactif**. Il est déclenché par un webhook authentifié et une récupération toutes les six heures ; il ne contient aucun polling à la minute.

## Modèles inclus

Les modèles FR, NL et EN confirment uniquement la réception, donnent la référence du devis et précisent que l’équipe examinera la demande. Ils ne contiennent ni promesse de délai, ni détail d’événement, ni donnée de contact autre que l’adresse du destinataire nécessaire à l’envoi.

## Préparation Cloud requise

1. Appliquer la migration `20261122162058_add_quote_request_receipts.sql` après sauvegarde et vérification de l’historique.
2. Déployer le code avec `QUOTE_RECEIPT_EMAIL_ENABLED` absent ou `false`.
3. Importer le workflow inactif ; associer `MBP - Automation V3` aux quatre appels HTTP (`claim`, `delivery-started`, `succeeded` et `delivery-unknown`) et `SMTP account` au nœud SMTP.
4. Créer un credential Header Auth entrant dédié au webhook d’accusé. Ne pas réutiliser les secrets STAGING, ALERTES ou `N8N_AUTOMATION_SECRET`.
5. Configurer `N8N_RECEIPT_WEBHOOK_URL` et `N8N_RECEIPT_WEBHOOK_SECRET` sur Vercel Production, sans révéler leurs valeurs.
6. Vérifier que le workflow est publié mais inactif, puis l’activer. Enfin seulement, définir `QUOTE_RECEIPT_EMAIL_ENABLED=true`.

## Sûreté de livraison

L’outbox crée au plus un événement d’accusé par devis. Après `delivery_started`, tout échec SMTP est placé en `delivery_unknown` et n’est jamais relancé automatiquement. Les échecs antérieurs à cette transition restent récupérables par verrou expiré ou par la récupération à six heures.

## Retour arrière

Définir `QUOTE_RECEIPT_EMAIL_ENABLED=false` avant de désactiver le workflow. Les événements déjà `delivery_unknown` exigent une décision humaine ; ils ne doivent pas être remis en attente automatiquement.
