# ADR-0001 — Node natif et `node:sqlite`, zéro dépendance

**Date** : 22/10/2026 · **Statut** : accepté (décision D4 du cadrage)

## Contexte

Le cadrage a tranché « Node + SQLite + front HTML/modules ES, sans
framework ». Restait à choisir comment parler à SQLite : un module natif
compilé (`better-sqlite3`), ou le module intégré `node:sqlite` livré avec
Node ≥ 22.5 et sans drapeau depuis Node 23.4.

## Décision

Tout l'outillage tourne sur **Node ≥ 24 natif** : `node:sqlite`
(`DatabaseSync`), `node:test`, `fetch`. Le `package.json` n'a aucune
dépendance, et le validateur (`scripts/valider.mjs`) échoue si l'une
apparaît. Front en HTML et modules ES, sans bundler.

## Alternatives écartées

- `better-sqlite3` : API équivalente, mais compilation native à chaque
  version de Node et sur le VPS ; une dépendance de plus à tenir.
- Supabase / Postgres : connu, mais les données partiraient chez un tiers,
  contraire au cadrage (A2 ne vaut que pour l'analyse par le modèle).
- Python : les études trading l'utilisent ; une seconde stack pour un outil
  d'une personne. Admis seulement pour un collecteur dont la bibliothèque
  n'existe qu'en Python.

## Conséquences

- `node:sqlite` reste marqué « en développement actif » par Node : si une
  version le casse, `better-sqlite3` offre la même surface SQL ; le code
  d'accès passe par `lib/base.mjs` seul pour rendre ce repli local.
- La CI et le conteneur du VPS fixent Node 24.
- Aucune mise à jour de dépendances à suivre ; la surface d'attaque est
  celle de Node.
