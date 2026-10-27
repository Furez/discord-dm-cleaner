# Discord DM Cleaner

> **Projet développé avec l'aide d'une IA** (OpenCode / DeepSeek V4.1 Flash), à partir d'un besoin personnel et testé sur un cas réel.

Petit outil en ligne de commande pour supprimer **un par un** les messages que **vous** avez envoyés dans une conversation privée Discord, en passant par l'interface réelle (Vesktop / Discord Electron + Chrome DevTools Protocol). Aucun token, aucune API Discord : le script simule de vrais clics (clic droit → « Supprimer le message » → confirmation).

## ⚠️ Avertissements

- **La suppression est définitive** et **visible par l'autre personne**.
- Automatiser une compte Discord peut être contraire aux **CGU de Discord**. Vous utilisez cet outil **à vos propres risques** (limitation, blocage de compte, etc.).
- L'outil ne supprime que les messages dont le menu contextuel propose « Supprimer le message » **et** dont l'aperçu de confirmation affiche bien l'auteur attendu. Malgré ces garde-fous, testez d'abord en mode simulation (`--dry-run`, activé par défaut).
- Ne lancez pas plusieurs instances en parallèle sur le même client.

## Fonctionnement

1. Connexion au port de débogage de Vesktop (CDP).
2. Positionnement en bas de l'historique, puis parcours **de bas en haut**.
3. Pour chaque message :
   - détermination de l'auteur via l'en-tête du message ;
   - clic droit réel sur le message ;
   - vérification que le menu contient « Supprimer le message » (preuve que le message vous appartient) ;
   - ouverture de la boîte de confirmation ;
   - vérification que l'aperçu contient votre pseudo **et** le début du texte du message ciblé ;
   - clic sur « Supprimer », puis vérification de la disparition du message.
4. Pause configurable entre chaque suppression pour limiter les risques de limitation anti-spam.
5. Arrêt automatique après 3 échecs consécutifs.

Les messages système (appels, etc.) et les messages de l'autre personne sont ignorés.

## Prérequis

- **Node.js 22 ou plus** (le client WebSocket natif est utilisé).
- **Vesktop** (ou Discord Electron) sur Linux, macOS ou Windows.
- Le client lancé avec un **port de débogage** :

```bash
# Vesktop Flatpak
flatpak run dev.vencord.Vesktop --remote-debugging-port=9222

# Vesktop AppImage
./Vesktop.AppImage --remote-debugging-port=9222
```

Vérification : `curl http://127.0.0.1:9222/json/list` doit renvoyer la page Discord.

> ⚠️ Le port de débogage permet à tout processus local de contrôler votre session Discord. Refermez Vesktop (ou relancez-le sans l'option) une fois terminé.

## Installation

```bash
git clone <url-du-depot>
cd discord-dm-cleaner
# aucune dépendance à installer
```

## Utilisation

1. Ouvrez la conversation concernée dans Vesktop (ou laissez le script le faire via `--channel`).
2. Récupérez l'identifiant du salon : dans l'URL `https://discord.com/channels/@me/<channelId>`.
3. Lancez d'abord une **simulation** (aucune suppression) :

```bash
node src/delete-my-messages.mjs \
  --channel 123456789012345678 \
  --author "VotrePseudo"
```

4. Si la liste vous convient, passez en suppression réelle :

```bash
node src/delete-my-messages.mjs \
  --channel 123456789012345678 \
  --author "VotrePseudo" \
  --delete
```

### Options

| Option | Défaut | Description |
|---|---|---|
| `--channel, -c` | — | Identifiant du salon DM (obligatoire). |
| `--author, -a` | — | Pseudo exact affiché sur vos messages (obligatoire). |
| `--delete` | `false` | Suppression réelle. Sans cette option : simulation. |
| `--lang` | `fr` | Langue de l'interface Discord (`fr` ou `en`). |
| `--port` | `9222` | Port de débogage CDP. |
| `--delay` | `1500` | Délai de base entre deux suppressions (ms). |
| `--max` | `100000` | Nombre maximum d'actions. |

Exemple en anglais :

```bash
node src/delete-my-messages.mjs -c 123456789012345678 -a "MyUsername" --lang en --delete
```

## Limites connues

- Dépend de la structure DOM de Discord (classes obfusquées) et des libellés de l'interface ; une mise à jour de Discord peut casser le script.
- La liste des messages est virtualisée : le script fait défiler l'historique pour charger les messages plus anciens.
- Les messages système ne sont pas supprimables et sont ignorés.
- Testé principalement avec Vesktop sur Linux en français.

## Licence

MIT — voir [LICENSE](LICENSE).

## Crédits

- Idée, tests et validation : **Furez**.
- Développement : réalisé **avec l'aide d'une IA** (OpenCode, modèle DeepSeek V4.1 Flash).

Ce projet est fourni à titre éducatif et personnel. Utilisez-le de manière responsable.
