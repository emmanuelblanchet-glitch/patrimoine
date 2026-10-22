# ADR-0002 — Le dépôt ne contient jamais de données

**Date** : 22/10/2026 · **Statut** : accepté

## Contexte

Le projet manipule des données personnelles et financières : biens, crédits,
revenus, valorisations. Le dépôt sera hébergé sur GitHub (privé) pour les
gates de CI. Jarvis, un autre projet du poste, a fait le choix inverse
(l'état vit en fichiers dans le dépôt) ; il fallait trancher ici.

## Décision

**Le dépôt est du code, jamais des données.** La base SQLite vit sur le VPS
(D1), hors git, avec ses sauvegardes chiffrées. Aucun montant, aucune
adresse de bien, aucun relevé, aucun chiffre personnel n'entre dans un
fichier, un commit, une fixture ou une documentation du dépôt. Le cadrage
complet, qui contient des chiffres, reste local hors dépôt ; seul un résumé
sans chiffres est committé.

Le check : `scripts/valider.mjs` refuse les fichiers suivis qui ressemblent
à une base, un environnement ou une sauvegarde, impose les motifs du
`.gitignore`, et cherche les motifs de clés d'API et d'IBAN dans le contenu.
Il tourne au pre-commit et en CI.

## Alternatives écartées

- Données en fichiers versionnés (modèle Jarvis) : pratique, mais GitHub est
  un tiers, et l'historique git n'oublie jamais une donnée committée.
- Dépôt local sans hébergeur : pas de CI, pas de PR, donc pas de gate.

## Conséquences

- Les tests n'utilisent que des jeux synthétiques.
- Une sauvegarde de la base est un fichier chiffré rapatrié sur le Mac,
  jamais un commit.
- Une fuite de donnée dans le dépôt se corrige par réécriture d'historique,
  pas par un commit de suppression.
