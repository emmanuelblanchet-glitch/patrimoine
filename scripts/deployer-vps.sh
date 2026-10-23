#!/bin/sh
# Déploie l'outil sur le VPS (lot 3, L3-2) : copie les fichiers SUIVIS par
# git — jamais une base, un fichier d'environnement ou le câblage MCP — puis
# reconstruit et relance le conteneur. Aucun jeton GitHub sur le VPS.
#
#   scripts/deployer-vps.sh                 depuis le Mac, sur la branche main à jour
#   DEPLOYER_SIMULATION=1 scripts/deployer-vps.sh   imprime la liste sans rien envoyer
set -eu
DEPOT=${DEPLOYER_DEPOT:-$(cd "$(dirname "$0")/.." && pwd)}
HOTE=${PATRIMOINE_VPS:-vps-memoire}
DEST=${PATRIMOINE_VPS_DEPOT:-/home/ubuntu/patrimoine/depot}

LISTE=$(mktemp)
trap 'rm -f "$LISTE"' EXIT
git -C "$DEPOT" ls-files > "$LISTE"
if grep -Eq '(^|/)\.env|\.db$|(^|/)\.mcp\.json$' "$LISTE"; then
  echo "Refus : un fichier de données ou de secret est suivi par git." >&2
  exit 1
fi
if [ "${DEPLOYER_SIMULATION:-}" = "1" ]; then
  cat "$LISTE"
  exit 0
fi
# tar + ssh : rien d'autre que les fichiers de la liste ne part ; l'ancien dépôt est remplacé en entier.
tar -C "$DEPOT" -cf - -T "$LISTE" | ssh "$HOTE" "mkdir -p '$DEST' && find '$DEST' -mindepth 1 -delete && tar -xf - -C '$DEST'"
ssh "$HOTE" "cd '$DEST/deploiement' && docker compose up -d --build && docker compose ps"
