# Heartbeats n8n — préparation locale

Ces propositions restent locales et inactives. Elles ne doivent pas être importées, publiées ou activées avant le déploiement de la migration de monitoring et des routes Vercel correspondantes.

## Fichiers proposés

- `mbp-catering-v2-staging-heartbeat.proposal.json`
- `mbp-catering-v2-alertes-v3-heartbeat.proposal.json`

Les deux introduisent exactement deux nœuds avant le claim existant : un HTTP Request de heartbeat et un contrôle `accepted === true`.

## Credential à créer lors de l'import

Associer uniquement aux nœuds `Monitoring Heartbeat` un credential HTTP Header Auth distinct, configuré dans n8n Cloud avec :

- Header : `Authorization`
- Valeur : `Bearer <AUTOMATION_HEARTBEAT_SECRET>`

Ne pas réutiliser `Header Auth account` destiné à `N8N_AUTOMATION_SECRET`. Aucun credential, secret ou en-tête n'est exporté dans les JSON.

## Comportement choisi

Le heartbeat est volontairement **best effort** : une réponse refusée, invalide, un timeout ou une indisponibilité de la route ne bloque pas le cycle métier. Dans tous ces cas, le flux atteint le claim normal sans boucle ni retry automatique.

Ce choix évite qu'une panne du monitoring empêche le traitement d'une demande de devis ou d'une alerte technique. L'absence de heartbeat devient alors visible au monitor indépendant après le délai prévu.

| Situation heartbeat | Sortie n8n | Effet métier |
| --- | --- | --- |
| `200 { accepted: true }` | validation TRUE | claim normal |
| `401`, `400`, `500` ou JSON non conforme | validation FALSE | claim normal |
| timeout ou erreur réseau | sortie d'erreur HTTP | claim normal |

Le heartbeat ne passe ni identifiant de devis, ni payload, ni e-mail, ni téléphone, ni `lockToken`. Il ne déclenche aucun SMTP.

## Contrôles avant import futur

1. Appliquer et vérifier les migrations V3 puis monitoring sur Supabase Cloud.
2. Déployer les routes Vercel et configurer `AUTOMATION_HEARTBEAT_SECRET`, uniquement côté serveur.
3. Créer le credential HTTP Header Auth dédié dans n8n Cloud, sans exporter sa valeur.
4. Importer les propositions en conservant `active: false`.
5. Comparer la proposition STAGING au workflow Cloud existant : son export n'est pas présent dans ce dépôt, notamment pour son déclencheur et son modèle SMTP.
6. Relier le nœud heartbeat au début du cycle, conserver les deux sorties d'échec vers le claim, puis vérifier l'absence de nœud SMTP supplémentaire.
7. Exécuter des tests synthétiques séparés avant toute activation.

## Limite de validation

Les JSON ont été validés structurellement. Leur exécution n'est pas vérifiée : elle nécessiterait une instance n8n isolée, les routes déployées et un credential non exportable.
