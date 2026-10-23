#!/bin/sh
# Transfert UNIQUE de la base du Mac vers le VPS (lot 3), AVANT le premier
# déploiement : copie cohérente par VACUUM INTO, envoi sous umask 077 dans le
# dossier de données, refus d'écraser une base déjà présente. Ensuite l'agent
# launchd du Mac se retire : une seule base vivante.
#
#   PATRIMOINE_DB=~/Patrimoine/patrimoine.db scripts/transferer-base-vps.sh
set -eu
HOTE=vps-memoire
DONNEES=/home/ubuntu/patrimoine/donnees
: "${PATRIMOINE_DB:?PATRIMOINE_DB : chemin de la base du Mac}"
TEMP=$(mktemp -d)
# La copie en clair ne survit pas au script, même en cas d'échec.
trap 'rm -rf "$TEMP"' EXIT
node -e "
const { DatabaseSync } = require('node:sqlite');
const b = new DatabaseSync(process.argv[1], { readOnly: true });
b.exec(\"VACUUM INTO '\" + process.argv[2].replaceAll(\"'\", \"''\") + \"'\");
b.close();" "$PATRIMOINE_DB" "$TEMP/patrimoine.db"
if ! ssh "$HOTE" "test ! -e '$DONNEES/patrimoine.db'"; then
  echo "Refus : une base existe déjà sur le VPS ($DONNEES/patrimoine.db), ou le VPS ne répond pas." >&2
  exit 1
fi
ssh "$HOTE" "umask 077 && mkdir -p '$DONNEES' && cat > '$DONNEES/patrimoine.db.partiel' && mv '$DONNEES/patrimoine.db.partiel' '$DONNEES/patrimoine.db'" < "$TEMP/patrimoine.db"
echo "Base transférée sur le VPS. Prochaine étape : scripts/deployer-vps.sh"
