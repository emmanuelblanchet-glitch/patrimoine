#!/bin/sh
# Migration UNIQUE de la base du Mac vers le VPS (lot 3) : copie cohérente
# par VACUUM INTO, envoi dans le dossier de données du conteneur, relance.
# Après quoi l'agent launchd du Mac se retire : une seule base vivante.
#
#   PATRIMOINE_DB=~/Patrimoine/patrimoine.db scripts/migrer-base-vps.sh
set -eu
HOTE=${PATRIMOINE_VPS:-vps-memoire}
DONNEES=${PATRIMOINE_VPS_DONNEES:-/home/ubuntu/patrimoine/donnees}
: "${PATRIMOINE_DB:?PATRIMOINE_DB : chemin de la base du Mac}"
COPIE=$(mktemp -d)/patrimoine.db
node -e "const { DatabaseSync } = require('node:sqlite'); const b = new DatabaseSync(process.argv[1], { readOnly: true }); b.exec(\"VACUUM INTO '\" + process.argv[2] + \"'\"); b.close();" "$PATRIMOINE_DB" "$COPIE"
ssh "$HOTE" "mkdir -p '$DONNEES' && test ! -e '$DONNEES/patrimoine.db'" || { echo "Refus : une base existe déjà sur le VPS ($DONNEES/patrimoine.db)." >&2; exit 1; }
scp -q "$COPIE" "$HOTE:$DONNEES/patrimoine.db"
rm -rf "$(dirname "$COPIE")"
ssh "$HOTE" "chmod 600 '$DONNEES/patrimoine.db' && cd /home/ubuntu/patrimoine/depot/deploiement && docker compose restart && docker compose logs --tail 3"
echo "Base migrée. Retire maintenant l'agent du Mac : launchctl bootout gui/\$(id -u)/fr.emmanuel.patrimoine && rm ~/Library/LaunchAgents/fr.emmanuel.patrimoine.plist"
