# Patrimoine — assistant personnel de gestion de patrimoine (PATRIMOINE-01)

Usage strictement personnel : Emmanuel seul, jamais partagé ni commercialisé.
Cadrage de référence : `Dev/cadrage-patrimoine-01.html` (local, **hors dépôt**
parce qu'il contient des chiffres) ; résumé sans chiffres committé :
`docs/cadrage-lot-0.md`. La charte `Dev/CLAUDE.md` s'applique d'office.

## Garde-fous — non négociables

1. **Le dépôt est du code, jamais des données** (ADR-0002) : aucun montant,
   aucune adresse de bien, aucun relevé, aucune base, aucun chiffre
   personnel — ni dans un fichier, ni dans un commit, ni dans une fixture.
   Les données vivent dans la base SQLite sur le VPS (D1) et dans ses
   sauvegardes chiffrées. Les tests n'utilisent que des jeux synthétiques.
   Vérifié par `scripts/valider.mjs` (fichiers suivis, `.gitignore`, motifs
   de secrets et d'IBAN).
2. **Aucune écriture vers l'extérieur** : jamais d'ordre, de virement,
   d'écriture chez une banque, un courtier, un service. Les collecteurs
   lisent, et c'est tout (seam S10, à poser avec le premier collecteur).
3. **Chaque nombre porte sa source et son statut** — fait, estimation ou
   opinion. Une valorisation sans source est refusée à l'écriture (S6).
4. **Les règles fiscales sont des paramètres datés par année, sourcés par
   une URL, jamais du code.** Un calcul pour l'année N sans paramètre N
   échoue bruyamment ; aucun repli silencieux sur N−1 (S3).
5. **Cloisonnement** : rien de Bright, d'Up Flow, de l'e-commerce, du
   trading ni du Coach n'entre ici — ni fichier, ni nom, ni donnée. Les
   parts de société sont **une** ligne valorisée à la main, sans aucun lien
   avec les données de l'activité professionnelle.
6. **Mémoire Graphiti `patrimoine`** (D2, cinquième cerveau, port 8005) :
   un épisode porte des décisions, des dates et de la structure, **jamais
   de montants**. Nom d'épisode : `PATRIMOINE-01 — …`.
7. **Les tests n'atteignent jamais la base réelle** : `lib/base.mjs` refuse,
   en mode test, tout chemin hors du dossier temporaire du système. Codé en
   dur et protégé par `.verrous`.
8. **Montants en centimes entiers, transactions immuables**, corrections par
   contre-écriture (modèle du cadrage, § 04).

## Carte

- `lib/` — moteurs purs, sans accès réseau (échéanciers, bilan à quote-part,
  fiscalité, performance, risque). `lib/base.mjs` ouvre la base.
- `scripts/valider.mjs` — validateur d'état ; `.githooks/pre-commit` = **le**
  gate bloquant (la protection de branche GitHub n'est pas appliquée sur les
  dépôts privés du plan, constat jarvis 12/08/2026).
- `tests/` — `node:test`, zéro dépendance ; `tests/aide.mjs` donne une base
  jetable par run.
- `docs/adr/` décisions fondatrices · `CONTEXT.md` glossaire ·
  `docs/cadrage-lot-0.md` résumé du cadrage · `docs/schemas/` fiche
  technico-fonctionnelle (naît au premier lot livré, série DOC-SCHEMAS-01).
- `.verrous` / `.supprimes` — déclarations VERROU-AGENT-01.
- `.mcp.json` (local, ignoré) — cerveau `graphiti-patrimoine`.

## Environnement de test

Base jetable par run dans le dossier temporaire (`tests/aide.mjs`), aucune
configuration requise : `npm test` ou `node --test`. La base réelle n'est
jointe que par l'application, via `PATRIMOINE_DB`, à partir du lot 3 ; aucun
test ne lit cette variable.

## Routine

Cadrage du lot → développement sur une branche depuis `main` → `/revue` →
push → PR ouverte par Emmanuel (lien pull/new + titre + description prêts).
Jamais de push direct sur `main`. Clôture de session : épisode
`PATRIMOINE-01 — …` dans le cerveau patrimoine, ingestion vérifiée par
requête Cypher directe, jamais par `get_episodes`.
