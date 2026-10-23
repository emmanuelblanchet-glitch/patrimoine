# Lot 2 — lignes vivantes, et aides au choix

Cadrage court, 23/10/2026. Suite du lot 1 (`docs/lots/lot-1.md`). Aucun
chiffre personnel ici (ADR-0002).

## Le problème, de ton point de vue

Tu vas ouvrir un PEA et acheter un ETF monde chaque mois. Aujourd'hui
l'outil ne connaît une ligne que par la valeur que tu tapes : elle vieillit
entre deux saisies, et l'écart à la cible avec elle. À la fin du lot 2, tu
déclares ton ETF par son code, tu saisis tes achats en parts, l'outil
suit le cours tout seul et te dit où tu en es, ligne par ligne et pour la
poche entière. Et quand tu as un choix à faire (le courtier, l'ETF), il
te l'explique avec des chiffres datés et sourcés, pas de mémoire.

**Démontrable seul** — 2a : « mon ETF est là, à son cours du jour, et je
sais ce que mon épargne rapporte » ; 2b : « voilà pourquoi tel ETF et tel
courtier, chiffres à l'appui ».

## Décisions du lot (23/10/2026, Emmanuel)

| Clé | Décision |
|---|---|
| L2-1 | **Cours depuis Yahoo Finance** (point d'accès « chart », un cours de clôture par jour, en lecture seule, sans compte). Non officiel : mesuré le 23/10 sur trois ETF, peut casser sans préavis ; l'outil garde toujours le dernier cours avec sa date, et la saisie manuelle reste possible. TradingView écarté : pas d'API publique de cours (seule une API pour courtiers sous contrat). |
| L2-2 | **Valeur d'une ligne cotée = parts × dernier cours.** Les achats se saisissent en parts et prix. Les lignes sans cours (livret, fonds euros, PEE) restent saisies en montant. |
| L2-3 | **Performance par ligne** (plus-value depuis l'achat, en euros et en %) **et rendement de la poche** (taux de rendement interne des versements datés, la réponse à « mon épargne rapporte combien ? »). Le TWR attend la V1. |
| L2-4 | **Aides au choix dans ce lot, en sous-lot 2b** : pages « Choisir mon PEA » et « Choisir mon ETF », critères pondérés pour l'usage réel, tableaux de candidats dont chaque chiffre porte sa source (URL) et sa date de relevé, alerte au-delà de six mois, recommandation rédigée (L1-3). |

## Sous-lot 2a — lignes vivantes

### Ajouter une ligne par son code

Page Lignes → « ajouter une ligne » : tu tapes un code ISIN, un symbole ou
un nom ; l'outil interroge la recherche Yahoo, te montre ce qu'il a trouvé
(nom, place de cotation, devise), tu confirmes l'enveloppe et la classe,
la ligne est créée avec son **symbole de cotation**. Un symbole déjà
présent dans la même enveloppe est refusé.

- Migration 3 : `actif.symbole_cours` ; table `cours` (actif, date, cours
  en centimes, source) ; `transactions.quantite_millioniemes` déjà prévu.
- Sont cotées les natures `etf` et `action` ; les autres restent en
  montant.

### Saisir un achat

Page Versement, renommée « J'ai versé / j'ai acheté » : pour une ligne
cotée, « j'ai acheté N parts à P € le … » (frais facultatifs) → une
transaction `achat` avec quantité et montant, immuable. Pour les autres
lignes, comme aujourd'hui. La ligne porte dès lors sa **quantité** (somme
des achats) et son **coût d'acquisition**.

### Les cours

- Un **collecteur** isolé des moteurs (`collecteurs/yahoo.mjs`) : lit le
  point d'accès chart pour un symbole, rend des cours datés ; refuse le
  vide, les valeurs nulles ou non numériques ; écrit dans `cours` sans
  doublon (même actif, même date). Toutes les requêtes sont des lectures ;
  rien d'autre que le symbole ne part (S10).
- Rafraîchissement : à l'ouverture de « Ma poche », si le dernier cours
  d'une ligne a plus de **20 heures**, le collecteur part en arrière-plan,
  comme l'explication ; la page ne l'attend jamais. Un bouton « Actualiser
  les cours » force le rafraîchissement.
- Chaque cours est une valorisation de statut **fait**, source « Yahoo
  Finance », datée du jour de cotation. En panne de source, la page montre
  le dernier cours et son âge, et le dit.

### Performance

- Par ligne cotée : valeur du jour − coût d'acquisition, en euros et en %.
- Poche : **TRI** (XIRR) des flux datés — versements, achats, abondements
  en sortie, valeur de la poche en entrée à la date du jour. Calcul pur,
  vérifié sur des exemples à réponse connue. Affiché seulement avec au
  moins un flux de plus de 30 jours ; marqué estimation en deçà d'un an.

### Dates clés des enveloppes

La date d'ouverture d'une enveloppe (déjà au modèle) nourrit une ligne
« PEA : avantages fiscaux acquis le … » (cinq ans) sur Allocation et
Lignes. Aucune règle bloquante au lot 2 : il n'y a pas de vente.

### Retouches de la recette du lot 1

- Pourcentages **entiers** dans l'explication (consigne à Claude et texte
  de repli) ; la date de la page en **heure locale** ; `pages.mjs` scindé
  en gabarit commun, pages de la poche, pages détaillées.

## Sous-lot 2b — aides au choix

- Deux fichiers de données dans le dépôt, sans donnée personnelle :
  `docs/references/courtiers-pea.json` et `docs/references/etf-monde-pea.json`.
  Chaque fait (frais par ordre, droits de garde, frais de gestion, prix de
  part, encours, éligibilité, indice, réplication, capitalisant) porte
  `valeur`, `source` (URL) et `releve_le`. Constitués par Claude à partir
  des pages des émetteurs et des grilles tarifaires, relus par Emmanuel.
- Pages `/choisir/pea` et `/choisir/etf` : les critères et leur poids pour
  l'usage réel (montant mensuel, nombre d'ordres par an, ETF visé), un
  **coût annuel estimé** par candidat, les faits avec leur date, une
  alerte quand un fait a plus de six mois, et une recommandation rédigée
  depuis ces chiffres (L1-3), marquée aide à la décision.
- Règles portées : un seul PEA par personne ; un seul ETF monde suffit.

### Précisé au développement (2a)

- Le **rendement** ne compte que les lignes alimentées par un flux suivi :
  la réserve saisie au point de départ n'est pas un versement, l'y mettre
  rendrait le TRI absurde. Affiché « calcul impossible » si les flux ne
  permettent pas de conclure.
- La **date d'ouverture du PEA** se saisit au point de départ, à côté de la
  case « un PEA » ; elle donne la date des cinq ans sur Allocation et Lignes.
- La recherche Yahoo par **nom** ne répond pas de façon fiable : l'écran
  demande le code ISIN ou le symbole.
- Défaut ancien trouvé par le test de bout en bout : le routeur n'appelait
  la validation du domaine que si la lecture du formulaire avait déjà une
  erreur ; elle joue désormais toujours.
- La page « Versement » devient « Mouvement » : j'ai acheté des parts
  (lignes cotées), j'ai versé (lignes sans cours).

### Précisé après la revue (2a)

- Le **prix de la séance en cours** n'est pas une clôture : le collecteur
  l'écarte (`currentTradingPeriod`), sinon il serait enregistré comme
  clôture du jour et figé à jamais (un cours écrit ne se réécrit pas).
- Une ligne cotée dans une **autre devise que l'euro** est refusée au
  rafraîchissement, et la page le dit ; sans ce refus, un ETF de Londres
  s'additionnerait en pence.
- Le **stock d'une ligne alimentée** au moment où l'outil l'a prise en
  charge (sa valorisation « point de départ ») entre dans le TRI comme un
  flux à sa date ; sinon, un versement sur le livret donne un rendement
  absurde.
- Un **PEA enregistré sans date** reçoit sa date depuis le point de départ
  (champ proposé tant qu'elle manque), sans créer de doublon.
- Un **achat erroné s'annule** depuis Mouvement : contre-écriture
  `annulation_achat` (parts et montant en négatif, référence à l'achat),
  une seule fois par achat ; l'achat annulé disparaît de la liste et de la
  position, jamais de la base. Un achat en parts ne se saisit que sur une
  ligne cotée ; une ligne sans cours reçoit un versement.
- Le symbole est **contraint en base** (forme, unicité par enveloppe) ; la
  création d'une ligne cotée est une opération du domaine
  (`creerLigneCotee`), plus une suite d'écritures dans le routeur.
- Les parts se lisent en chiffres (`lireParts`, millionièmes) et le coût
  d'un achat se calcule en fraction exacte : jamais de flottant.

## Seams testés (bloquants, jeux synthétiques, jamais le réseau)

| Seam | Comportement garanti |
|---|---|
| S-L2-1 collecteur | La lecture d'une réponse Yahoo (fixture) rend des cours datés ; vide, erreur, valeur nulle ou non numérique → refus explicite ; deux lectures du même jour n'écrivent qu'une ligne. |
| S-L2-2 valorisation | Valeur = parts × cours, quantité en millionièmes, un seul arrondi ; une ligne cotée sans cours est « non valorisée », jamais à zéro. |
| S-L2-3 performance | Plus-value par ligne ; TRI sur exemples connus (un flux, deux flux, versements mensuels) à 0,01 point près ; refus d'un TRI sans flux. |
| S-L2-4 ajout par code | Une recherche (fixture) → confirmation → ligne créée avec son symbole ; doublon de symbole refusé ; symbole illisible refusé. |
| S-L2-5 aides | Chaque fait des fichiers de référence a une source et une date ; un fait de plus de six mois est signalé ; le coût annuel se recalcule depuis les faits. |
| S10 | Les collecteurs n'émettent que des GET, et seul le symbole part. |

## Hors lot 2, explicitement

Orientations d'actualité (V1) ; ventes, arbitrages, règles de vente ;
iPhone, mot de passe, VPS (lot 3) ; détail du PEE par fonds ; TWR ;
dividendes (ETF capitalisant visé) ; devises autres que l'euro.

## Points d'attention

- Yahoo voit le symbole demandé et l'adresse du Mac : il apprend quel ETF
  tu suis, pas combien. Acceptable pour une ligne ; à dire.
- Un cours de clôture n'est pas un prix d'exécution : la plus-value
  affichée est une estimation à la clôture.
- Les aides au choix nomment des établissements : zone la plus proche du
  conseil réglementé, admissible parce que l'outil ne sert qu'à toi.

## Livraison

Branche `lot-2/lignes-vivantes` depuis `main` ; 2a puis 2b, chacun revu
(`/revue`) et poussé ; PR ouvertes par Emmanuel. À la livraison :
`CLAUDE.md` (collecteurs, références), `CONTEXT.md` (cours, symbole,
achat, TRI), fiche technico-fonctionnelle rafraîchie, épisode de clôture.
