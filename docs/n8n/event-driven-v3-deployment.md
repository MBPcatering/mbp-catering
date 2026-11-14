# Déploiement n8n V3 événementiel

Ces exports restent inactifs à l'importation. Ne les publiez ni ne les activez
sans validation de la production.

## Variables Vercel Production

Créer quatre variables sensibles, sans les inscrire dans Git :

- `N8N_STAGING_WEBHOOK_URL` et `N8N_STAGING_WEBHOOK_SECRET`
- `N8N_ALERTS_WEBHOOK_URL` et `N8N_ALERTS_WEBHOOK_SECRET`

Les deux secrets webhook doivent être aléatoires, distincts entre eux et
distincts de `N8N_AUTOMATION_SECRET`. Le code refuse une réutilisation connue.
Chaque URL doit être une URL HTTPS `mbpcatering.app.n8n.cloud/webhook/...`,
sans port non standard.

## Associations n8n Cloud

Pour chaque export, créer et attacher un credential Header Auth entrant dédié
au nœud `Automation Wake-up` correspondant. Il doit exiger l'en-tête
`Authorization: Bearer <secret-webhook-dédié>`. Ne pas partager ce credential
entre STAGING et ALERTES.

Réutiliser uniquement les credentials Cloud existants pour les nœuds sortants :

- `Automation V3` : les quatre appels métier ;
- `Monitoring Heartbeat` : le heartbeat ;
- SMTP existant : l'envoi de notification.

Ne jamais exporter les valeurs de ces credentials. Les exports contiennent
volontairement aucune référence de credential afin d'empêcher un import vers
un mauvais environnement.

## Activation contrôlée

Importer et contrôler les graphes inactifs. Déployer ensuite le code Vercel
avec les quatre variables. Publier/activer STAGING, confirmer son heartbeat,
puis ALERTES. Ne mettre `expected_active` à `true` qu'après le premier
heartbeat de chaque workflow. Le Schedule Trigger de six heures est le filet
de récupération ; les signaux webhook ne transportent aucune donnée métier.
