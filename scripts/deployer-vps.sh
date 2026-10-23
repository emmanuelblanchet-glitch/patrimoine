#!/bin/sh
# Déploie l'outil sur le VPS (lot 3, L3-2) : envoie le COMMIT courant de main
# par `git archive` (fichiers suivis seulement, jamais l'arbre de travail),
# refuse une base, un fichier d'environnement ou le câblage MCP suivis par
# git, bascule seulement une extraction complète, puis reconstruit et relance
# le conteneur. Aucun jeton GitHub sur le VPS.
#
#   scripts/deployer-vps.sh                          depuis le Mac, sur main propre
#   DEPLOYER_SIMULATION=1 scripts/deployer-vps.sh    imprime la liste sans rien envoyer
set -eu
DEPOT=${DEPLOYER_DEPOT:-$(cd "$(dirname "$0")/.." && pwd)}
HOTE=vps-memoire
DEST=/home/ubuntu/patrimoine/depot
INTERDITS='(^|/)\.env|\.env$|\.(db|sqlite3?)(-wal|-shm|-journal)?$|(^|/)\.mcp\.json$'

branche=$(git -C "$DEPOT" rev-parse --abbrev-ref HEAD)
if [ "$branche" != main ]; then
  echo "Refus : branche « $branche » ; on ne déploie que main." >&2
  exit 1
fi
if [ -n "$(git -C "$DEPOT" status --porcelain --untracked-files=no)" ]; then
  echo "Refus : modifications non commitées ; on déploie un commit, pas un brouillon." >&2
  exit 1
fi
LISTE=$(git -C "$DEPOT" -c core.quotePath=false ls-tree -r --name-only HEAD)
if printf '%s\n' "$LISTE" | grep -Eq "$INTERDITS"; then
  echo "Refus : un fichier de données ou de secret est suivi par git." >&2
  exit 1
fi
if [ "${DEPLOYER_SIMULATION:-}" = 1 ]; then
  printf '%s\n' "$LISTE"
  exit 0
fi
# Extraction dans un dossier neuf ; la bascule n'a lieu que si l'archive est
# complète (une archive tronquée fait échouer tar, set -e arrête tout).
git -C "$DEPOT" archive --format=tar HEAD | ssh "$HOTE" "set -e
rm -rf '$DEST.neuf' && mkdir -p '$DEST.neuf'
tar -xf - -C '$DEST.neuf'
test -f '$DEST.neuf/deploiement/compose.yml'
rm -rf '$DEST.ancien'
if [ -d '$DEST' ]; then mv '$DEST' '$DEST.ancien'; fi
mv '$DEST.neuf' '$DEST' && rm -rf '$DEST.ancien'"
ssh "$HOTE" "cd '$DEST/deploiement' && docker compose up -d --build && docker compose ps"
echo "Déployé : $(git -C "$DEPOT" rev-parse --short HEAD)"
