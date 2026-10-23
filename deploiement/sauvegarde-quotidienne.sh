#!/bin/sh
# Sauvegarde quotidienne chiffrée (lot 3, L3-3), lancée par le cron d'ubuntu
# sur l'hôte. Un conteneur éphémère, sans réseau, à partir de l'image du
# serveur : la phrase de sauvegarde (sauvegarde.env) n'entre jamais dans le
# conteneur du serveur. La base est en WAL : le dossier est monté en écriture
# pour que SQLite pose ses verrous, la copie se fait par VACUUM INTO.
set -eu
docker run --rm --network none --read-only --tmpfs /tmp --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --env-file /home/ubuntu/patrimoine/sauvegarde.env \
  -v /home/ubuntu/patrimoine/donnees:/donnees \
  -v /home/ubuntu/backups/patrimoine/base:/sauvegardes \
  patrimoine:local node scripts/sauvegarder.mjs sauvegarder /donnees/patrimoine.db /sauvegardes
