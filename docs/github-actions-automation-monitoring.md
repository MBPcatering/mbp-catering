# Surveillance métier avec GitHub Actions

Cette configuration locale n'est pas encore publiée ni active. Elle vérifie toutes les cinq minutes l'état technique de production, puis maintient au plus une issue GitHub publique intitulée `Automation monitoring incident`.

## Secrets et permissions

Créer le secret de dépôt GitHub Actions `MONITOR_SECRET` avant publication. Ne jamais placer sa valeur dans un fichier, une issue, une variable de workflow visible ou une URL.

Le job de contrôle dispose seulement de `contents: read` et reçoit `MONITOR_SECRET`. Le job de synchronisation d'incident ne reçoit pas ce secret : il utilise uniquement le jeton GitHub éphémère avec `contents: read` et `issues: write`.

## Notifications e-mail

Configurer le compte GitHub responsable de `tech@mbpcatering.be` avec cette adresse e-mail vérifiée, puis :

1. Activer les notifications e-mail GitHub Actions, en privilégiant les échecs uniquement.
2. Suivre le dépôt avec les notifications d'issues activées afin de recevoir l'ouverture et le commentaire de rétablissement de l'incident unique.
3. Vérifier par un lancement manuel après publication que le compte reçoit les notifications attendues.

GitHub Actions adresse les notifications de workflow planifié à l'utilisateur qui a modifié le cron. L'issue sert donc de signal durable et dédupliqué, mais ne remplace pas la configuration individuelle de notifications.

## Limites connues

- Les exécutions planifiées GitHub peuvent être retardées ou ignorées lors de forte charge ; le cron ne remplace pas une surveillance d'uptime indépendante.
- Dans un dépôt public, une issue est publique : son contenu doit rester strictement technique. La configuration ne publie ni identifiant client, ni payload, ni secret, ni réponse de monitoring.
- Les workflows planifiés d'un dépôt public inactif pendant 60 jours peuvent être désactivés par GitHub.
- Aucun service SMTP n'est utilisé par ce mécanisme.

## Retour arrière

Avant publication, supprimer le workflow local ou ne pas l'inclure dans le commit. Après publication, désactiver le workflow depuis GitHub Actions et fermer manuellement l'éventuelle issue technique ouverte. La désactivation n'affecte ni Vercel, ni Supabase, ni n8n.
