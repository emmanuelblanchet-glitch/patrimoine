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
   lisent, et c'est tout (seam S10, testé sur `collecteurs/yahoo.mjs`).
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
   contre-écriture (modèle du cadrage, § 04) — triggers en base.
9. **Claude met en mots, il ne décide rien** (lot 1, L1-3) : les chiffres
   viennent des règles codées ; ce qui part vers l'API est exactement la
   liste de `CLES_CHARGE_UTILE` (ni libellés, ni immobilier détaillé, ni
   identité — testé), ou `CLES_CHARGE_UTILE_ETF` pour « Choisir mon ETF » ; texte mis en cache par empreinte ; sans clé, sans
   réseau ou en erreur, un texte de repli s'affiche et la page ne dépend
   jamais de l'appel. L'appel est en lecture seule, sans outil.
10. **La saisie est un parcours en français**, jamais des champs du modèle
    de données (recadrage du 22/10/2026).

## Carte

- `lib/` — moteurs purs, sans accès réseau. `lib/base.mjs` ouvre la base ;
  `schema.mjs` migrations numérotées (une migration publiée ne se modifie
  jamais) ; `referentiel.mjs` écriture/lecture validées (S6), versements, lignes
  cotées, achats et leur annulation ;
  `bilan.mjs` bilan à quote-part en fractions exactes (S2) ;
  `allocation.mjs` cible, bandes 5/25, répartition du versement en option A
  (S-L1-1) ; `objectif.mjs` point de départ, amorçage des lignes, classes
  (S-L1-2) ; `poche.mjs` assemble la poche, rendement sur les lignes
  alimentées ; `explication.mjs` charge utile minimale, empreinte, texte de
  repli (S-L1-3/4/5) ; `cours.mjs` cours idempotents et valorisation parts ×
  cours (S-L2-2) ; `performance.mjs` plus-value et TRI (S-L2-3) ;
  `references.mjs` lit et vérifie le fichier de faits datés et sourcés
  (S-L2-6, S-L2-8) ; `choix-etf.mjs` coût des candidats, classement, charge
  utile fermée `CLES_CHARGE_UTILE_ETF` et repli (S-L2-5, S-L2-7) ;
  `fraction.mjs`, `saisie.mjs`, `format.mjs`.
- `collecteurs/` — ce qui lit l'extérieur, isolé des moteurs : `yahoo.mjs`
  (parseurs purs testés sur fixtures + GET du symbole seul, S-L2-1, S10).
- `serveur/` — serveur local (Node `http`, 127.0.0.1 seulement, l'hôte
  n'est pas réglable) : `config.mjs` refuse une base dans le dépôt ;
  `application.mjs` gardes Host/Origin, routes, statiques ; `gabarit.mjs`,
  `pages-poche.mjs`, `pages-details.mjs`, `pages-choix.mjs` HTML échappé ;
  `formulaires.mjs` ;
  `claude.mjs` (API Messages, `fetch` natif, clé `ANTHROPIC_API_KEY`) ;
  `explications.mjs` cache + appel en arrière-plan + repli, un fournisseur
  par sujet (poche, etf) ; `cours.mjs`
  rafraîchissement des cours en arrière-plan (20 h, recul 1 h) ;
  `session.mjs` porte du mode public (empreinte scrypt, cookie signé,
  essais) ; `pages-session.mjs` ; `demarrer.mjs` point d'entrée. Les deux
  seuls appels sortants : Anthropic (texte) et Yahoo Finance (cours, GET du
  symbole). En mode public, le routeur exige le relais HTTPS, l'identité
  Tailscale du seul utilisateur, puis une session ; 10 recherches/minute.
- `public/` — seuls fichiers statiques servis (à plat ou dans `fonts/`,
  extensions allowlistées). Polices embarquées : jamais chargées d'un tiers.
- `docs/design/reglages.json` — le système de design retenu par Emmanuel
  dans l'atelier ; `public/style.css` en dérive.
- `docs/references/etf-monde-pea.json` — les faits de « Choisir mon ETF »
  (candidats et courtier), chacun avec source officielle et date de relevé ;
  relevés à la main, jamais par un collecteur ; aucune donnée personnelle.
- `scripts/` — `valider.mjs` validateur d'état ; `sauvegarder.mjs` sauvegarde
  chiffrée et restauration ; `deployer-vps.sh` (commit de main seulement),
  `transferer-base-vps.sh`, `empreinte-phrase.mjs` ; `deploiement/`
  Dockerfile, compose (réseau de l'hôte, mode public déclaré), tâche de
  sauvegarde quotidienne, modèles d'environnement sans valeur, et
  `LISEZMOI.md`, le pas-à-pas de mise en service. `valider.mjs` — `.githooks/pre-commit` = **le**
  gate bloquant (la protection de branche GitHub n'est pas appliquée sur les
  dépôts privés du plan, constat jarvis 12/08/2026).
- `tests/` — `node:test`, zéro dépendance ; `tests/aide.mjs` donne une base
  jetable par run.
- `docs/adr/` décisions fondatrices · `CONTEXT.md` glossaire ·
  `docs/cadrage-lot-0.md` résumé du cadrage général · `docs/lots/` cadrage
  court de chaque lot (référence de l'axe Conformité) · `docs/schemas/` fiche
  technico-fonctionnelle (naît au premier lot livré, série DOC-SCHEMAS-01).
- `.verrous` / `.supprimes` — déclarations VERROU-AGENT-01.
- `.mcp.json` (local, ignoré) — cerveau `graphiti-patrimoine`.

## Environnement de test

Base jetable par run dans le dossier temporaire (`tests/aide.mjs`), aucune
configuration requise : `npm test` ou `node --test`. Aucun test ne lit
`PATRIMOINE_DB` pour ouvrir une base ; la fumée du serveur démarre sur une
base jetable et un port libre.

## Lancer l'outil

Sur le VPS (lot 3) : voir `deploiement/LISEZMOI.md`. En bref :
`scripts/deployer-vps.sh` depuis le Mac sur `main`, environnement dans
`/home/ubuntu/patrimoine/patrimoine.env`, base dans
`/home/ubuntu/patrimoine/donnees/`, relais `tailscale serve --https=8006`,
sauvegarde chaque nuit par le cron d'`ubuntu`
(`deploiement/sauvegarde-quotidienne.sh`, phrase dans `sauvegarde.env`).

En local, sur le Mac :

```sh
mkdir -p ~/Patrimoine
PATRIMOINE_DB=~/Patrimoine/patrimoine.db npm run serveur   # http://127.0.0.1:8710/
```

`PATRIMOINE_PORT` change le port. La base est créée et migrée au premier
démarrage ; un chemin situé dans le dépôt est refusé. `ANTHROPIC_API_KEY`
dans l'environnement du serveur active l'argumentation rédigée par Claude ;
sans elle, texte de repli. Une clé créée au niveau de l'organisation (non
rattachée à un espace de travail) exige en plus `ANTHROPIC_WORKSPACE_ID`.

## Routine

Cadrage du lot → développement sur une branche depuis `main` → `/revue` →
push → PR ouverte par Emmanuel (lien pull/new + titre + description prêts).
Jamais de push direct sur `main`. Clôture de session : épisode
`PATRIMOINE-01 — …` dans le cerveau patrimoine, ingestion vérifiée par
requête Cypher directe, jamais par `get_episodes`.
