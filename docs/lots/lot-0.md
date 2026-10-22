# Lot 0 — base, saisie, bilan à quote-part

Cadrage court, 22/10/2026. S'appuie sur le cadrage général validé
(`docs/cadrage-lot-0.md`, résumé ; version complète locale hors dépôt).
Aucun chiffre personnel ici (ADR-0002).

## Le problème, de ton point de vue

Tu n'as aujourd'hui aucune vue de ce que tu possèdes net de dettes. À la fin
du lot 0, sur ton Mac, une page affiche ton bilan net à ta quote-part, par
enveloppe, par bien et global, avec pour chaque ligne la date, la source et
le statut (fait ou estimation) de sa valeur. Tu l'as saisi toi-même, dans
une base qui ne quitte pas ta machine.

**Démontrable seul** : « mon bilan net au jour J, à partir de mes saisies,
avec la date et la source de chaque valeur ».

## Décisions du lot (22/10/2026, Emmanuel)

| Clé | Décision |
|---|---|
| L0-1 | Le **capital restant dû** d'un crédit est, au lot 0, une **valorisation datée du passif** copiée du relevé bancaire. Le lot 1 le calculera à toute date depuis l'échéancier (S1). |
| L0-2 | **Interface web locale** dès le lot 0 : serveur Node lié à `127.0.0.1`, pages HTML rendues côté serveur, sans framework. C'est le squelette du produit ; le lot 3 le déplace sur le VPS avec mot de passe et Tailscale. |
| L0-3 | Le **PEE** est une ligne globale valorisée à la main depuis le relevé. Le détail par fonds, les VL et l'import CSV arrivent en V1. |
| L0-4 | Seams bloquants du lot : **S2** quote-part, **S6** source obligatoire, **migrations idempotentes**, **fumée du serveur**. |

## Ce que le lot construit

### Schéma v1 (SQLite, migrations numérotées)

- `migration` — version appliquée, date. Le schéma s'applique sur une base
  vide, se rejoue sans effet, et **refuse** une base d'une version inconnue.
- `profil` — un enregistrement : date de naissance, situation, parts
  fiscales, TMI, horizon, matelas cible.
- `enveloppe` — type (`immobilier_direct`, `pee`, `per`, `pea`, `cto`, `av`,
  `livret`, `compte_courant`, `societe`), libellé, établissement, date
  d'ouverture, **quote-part en fraction exacte** (numérateur, dénominateur :
  1/2, 1/3…), régime fiscal de référence (texte libre au lot 0).
- `actif` — enveloppe, nature (`bien`, `fcpe`, `etf`, `action`, `parts`,
  `liquidites`), libellé, identifiant (ISIN ou adresse), classification
  (classe, zone, secteur, devise, liquidité), date, prix et frais
  d'acquisition en centimes, date de clôture éventuelle.
- `passif` — actif financé, libellé, établissement, capital initial, taux
  nominal en points de base, durée en mois, mensualité, assurance mensuelle,
  date de première échéance, type (`amortissable`, `in_fine`).
- `valorisation` — cible (`actif` ou `passif`), date, valeur en centimes,
  **source obligatoire**, **statut obligatoire** (`fait` ou `estimation`),
  note. Pour un passif, la valeur est le capital restant dû.
- `transaction` — date, actif, type, montant en centimes, quantité,
  frais, contre-écriture éventuelle. Présente dans le schéma, **sans écran
  au lot 0** (les flux arrivent au lot 1 avec le cash-flow).

Choix de représentation : montants en centimes entiers ; quote-part en
fraction (jamais un flottant) ; dates ISO 8601 ; identifiants entiers.

### Référentiel (`lib/referentiel.mjs`)

Écriture et lecture des tables ci-dessus. Une valorisation sans source ou
sans statut est **refusée** (contrainte en base **et** vérification dans le
code, avec le motif). Dernière valorisation d'une cible à une date donnée.

### Moteur de bilan (`lib/bilan.mjs`, pur)

Entrée : enveloppes, actifs, passifs, valorisations, date du bilan.
Sortie : par enveloppe, par bien et global :

- valeur = dernière valorisation à la date, × quote-part ;
- dette = dernier capital restant dû à la date, × quote-part ;
- net = valeur − dette ; la quote-part s'applique **toujours aux deux** (S2) ;
- statut d'une ligne = statut de sa valorisation ; statut d'un agrégat =
  `estimation` dès qu'un composant l'est ;
- un actif **sans valorisation** est listé « non valorisé » et exclu du
  total, avec un avertissement — jamais compté à zéro en silence ;
- âge de chaque valorisation en jours, pour signaler ce qui date.

Arithmétique en entiers ; un seul arrondi, à l'affichage.

### Serveur local (`serveur/`)

- Node `http` natif, écoute **uniquement** sur `127.0.0.1`, port fixé dans
  la configuration ; refuse de démarrer sans `PATRIMOINE_DB`, et **refuse un
  chemin de base situé dans le dépôt** (ADR-0002 rendu structurel).
- Pages : `/` bilan ; `/enveloppes`, `/actifs`, `/passifs`,
  `/valorisations` : liste + formulaire d'ajout. HTML rendu côté serveur,
  CSS inline, lisible sur un petit écran (le lot 3 ne redessine pas).
- Écritures par formulaire `POST` ; une écriture invalide répond 400 avec le
  motif ; une requête dont l'en-tête `Host` n'est pas l'adresse locale est
  refusée (403) — garde contre une page tierce qui posterait vers le serveur.
- Fichiers statiques servis depuis `public/` seulement, extensions
  allowlistées ; tout autre chemin répond 404.
- Pas d'authentification au lot 0 : le serveur n'est joignable que depuis
  le Mac. Mot de passe et réseau privé au lot 3.

### Première saisie (recette manuelle, hors dépôt)

Enveloppes et actifs à saisir par Emmanuel : les deux résidences principales
(quote-part 1/2 chacune, crédit sur l'une avec son capital restant dû), le
bien en résidence étudiante et son crédit, le bien sous Pinel et son crédit,
la réserve de liquidités, le PEE (ligne globale), les parts de société
(statut `estimation`). Les valeurs des biens sont des estimations datées,
avec leur source.

## Seams testés (bloquants, jeux synthétiques)

| Seam | Comportement garanti |
|---|---|
| S2 quote-part | Un bien à 1/2 divise valeur et dette ensemble ; le net d'une enveloppe à 1/3 est exactement le tiers du net à 100 %. |
| S6 source obligatoire | Une valorisation sans source ou sans statut est refusée par le référentiel avec le motif, et par la base si on la contourne. |
| Migrations | Schéma appliqué sur base vide ; rejeu sans effet ; version inconnue refusée. |
| Fumée serveur | N'écoute que sur 127.0.0.1 ; `GET /` répond 200 avec le bilan ; un chemin hors `public/` répond 404 ; un `POST` invalide répond 400 avec le motif ; un `Host` étranger répond 403 ; un chemin de base dans le dépôt empêche le démarrage. |
| Bilan | Sur un jeu synthétique : net global, propagation du statut `estimation`, actif non valorisé signalé et exclu, âge des valorisations. |

Plus les tests existants du socle (garde-fou anti-prod, validateur).

## Hors lot 0, explicitement

Échéanciers et calcul du capital restant dû (lot 1) ; transactions, loyers
et cash-flow (lot 1) ; dispositifs et paramètres fiscaux, simulateur de
sortie (lot 2) ; accès iPhone, mot de passe, VPS, sauvegarde chiffrée
(lot 3) ; détail du PEE par fonds et import CSV (V1) ; fiche
technico-fonctionnelle (naît à la livraison de ce lot, `docs/schemas/`).

## Livraison

Branche `lot-0/bilan-quote-part` depuis `main` ; `/revue` avant push ; PR
ouverte par Emmanuel. À la livraison : `CLAUDE.md` (carte : `serveur/`,
`public/`, variable `PATRIMOINE_DB`), `CONTEXT.md` (« solde d'un passif »),
fiche technico-fonctionnelle, épisode de clôture sans montants.
