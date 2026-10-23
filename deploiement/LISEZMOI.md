# Mise en service sur le VPS (lot 3)

Pas-à-pas pour Emmanuel, depuis le Terminal du Mac, dans `~/Dev/patrimoine`
sur `main` à jour. Aucun secret n'apparaît à l'écran ni dans l'historique,
sauf la phrase de sauvegarde, affichée une fois pour le gestionnaire de mots
de passe. Les fichiers d'environnement vivent sur le VPS, en 600, jamais dans
le dépôt.

## 0. Préalables, à la main

1. Console Tailscale → **DNS** → **HTTPS Certificates** : activer.
2. iPhone : installer **Tailscale**, se connecter avec le même compte.

## 1. Dossiers sur le VPS

```sh
ssh vps-memoire 'install -d -m 700 ~/patrimoine ~/patrimoine/donnees && install -d -m 700 ~/backups/patrimoine/base'
```

## 2. Environnement du serveur (`~/patrimoine/patrimoine.env`)

```sh
node scripts/empreinte-phrase.mjs | ssh vps-memoire 'umask 077; cat >> ~/patrimoine/patrimoine.env'
ssh vps-memoire 'umask 077; tailscale status --json | python3 -c "import json,sys; j=json.load(sys.stdin); print(\"PATRIMOINE_HOTE_PUBLIC=\" + j[\"Self\"][\"DNSName\"].rstrip(\".\") + \":8006\"); print(\"PATRIMOINE_UTILISATEUR=\" + j[\"User\"][str(j[\"Self\"][\"UserID\"])][\"LoginName\"])" >> ~/patrimoine/patrimoine.env'
sed -n 's/^export //p' ~/Patrimoine/cle.env | ssh vps-memoire 'umask 077; cat >> ~/patrimoine/patrimoine.env'
ssh vps-memoire 'sed -E "s/=.*/=…/" ~/patrimoine/patrimoine.env'
```

Résultat attendu de la dernière commande : six lignes, valeurs masquées
(`PATRIMOINE_PHRASE_EMPREINTE=…`, `PATRIMOINE_SECRET_SESSION=…`,
`PATRIMOINE_HOTE_PUBLIC=…`, `PATRIMOINE_UTILISATEUR=…`, `ANTHROPIC_API_KEY=…`,
`ANTHROPIC_WORKSPACE_ID=…`).

## 3. Phrase de sauvegarde (`~/patrimoine/sauvegarde.env`)

```sh
P=$(openssl rand -base64 30); echo "$P"
```

Copier la phrase affichée dans le gestionnaire de mots de passe
(« Patrimoine — sauvegardes »). Sans elle, aucune sauvegarde ne se restaure.

```sh
printf 'PATRIMOINE_SAUVEGARDE_PHRASE=%s\n' "$P" | ssh vps-memoire 'umask 077; cat > ~/patrimoine/sauvegarde.env'; unset P; clear
```

## 4. Arrêter l'outil du Mac, transférer la base

```sh
launchctl bootout gui/$(id -u)/fr.emmanuel.patrimoine
PATRIMOINE_DB=~/Patrimoine/patrimoine.db scripts/transferer-base-vps.sh
```

## 5. Déployer, relayer

```sh
scripts/deployer-vps.sh
ssh vps-memoire 'sudo tailscale serve --bg --https=8006 http://127.0.0.1:8006 && tailscale serve status'
```

Ouvrir `https://<nom tailnet du VPS>:8006/` sur le Mac : la page « Patrimoine,
ta phrase de passe ». En cas de 403 « Cette adresse n'est pas celle du
serveur » : `ssh vps-memoire 'docker logs patrimoine | tail -5'` montre
l'hôte reçu (`hôte refusé : …`) — le reporter dans `PATRIMOINE_HOTE_PUBLIC`,
puis `ssh vps-memoire 'cd ~/patrimoine/depot/deploiement && docker compose up -d'`.

## 6. Sauvegarde quotidienne et restauration testée

```sh
ssh vps-memoire '(crontab -l 2>/dev/null | grep -v sauvegarde-quotidienne; echo "30 3 * * * /home/ubuntu/patrimoine/depot/deploiement/sauvegarde-quotidienne.sh >> /home/ubuntu/patrimoine/sauvegarde.log 2>&1") | crontab -'
ssh vps-memoire '~/patrimoine/depot/deploiement/sauvegarde-quotidienne.sh'
ssh vps-memoire 'F=$(ls -t ~/backups/patrimoine/base/*.chiffre | head -1); docker run --rm --network none --read-only --tmpfs /tmp --env-file ~/patrimoine/sauvegarde.env -v ~/backups/patrimoine/base:/sauvegardes:ro patrimoine:local node scripts/sauvegarder.mjs restaurer "/sauvegardes/$(basename "$F")" /tmp/essai.db'
```

Résultat attendu de la dernière commande : `Base restaurée : /tmp/essai.db (11 tables)`
(la copie d'essai disparaît avec le conteneur).

## 7. Retirer l'agent du Mac, épingler sur l'iPhone

```sh
rm ~/Library/LaunchAgents/fr.emmanuel.patrimoine.plist
```

iPhone : Tailscale connecté → Safari → l'adresse du point 5 → Partager →
« Sur l'écran d'accueil ».

## Ensuite

Chaque mise en production : `git checkout main && git pull` puis
`scripts/deployer-vps.sh`. Les sauvegardes arrivent sur le Mac chaque matin
avec celles des cerveaux (`~/Backups-memoire/patrimoine/base/`).
