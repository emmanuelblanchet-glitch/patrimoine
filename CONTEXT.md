# Glossaire — Patrimoine (PATRIMOINE-01)

Termes du domaine, figés au cadrage du 22/10/2026. Employer ces termes,
jamais de synonymes. Un terme entre ici à l'instant où il se fige.

## Le patrimoine

- **Enveloppe** : le contenant fiscal ou juridique d'un actif — immobilier
  direct, PEE, PER, PEA, compte-titres, assurance-vie, livret, compte
  courant, société. Porte la **quote-part** de détention et son régime
  fiscal de référence.
- **Actif** : ce qui est possédé, rattaché à une enveloppe — bien
  immobilier, fonds (FCPE, ETF), action, parts de société, liquidités.
- **Passif** : un crédit — capital, taux, durée, mensualité, assurance,
  bien financé.
- **Échéance** : une ligne de l'échéancier d'un passif — part de capital,
  part d'intérêts, assurance, **capital restant dû** (CRD) à une date.
- **Quote-part** : la fraction d'un actif ou d'un passif qui t'appartient
  (indivision). Tout est stocké à 100 %, la quote-part s'applique au calcul
  (ADR-0003).
- **Transaction** : tout flux daté, immuable, en centimes — achat, vente,
  versement, retrait, abondement, loyer, charge, taxe, intérêt, dividende,
  impôt. Une erreur se corrige par **contre-écriture**.
- **Valorisation** : la valeur d'un actif à une date, avec sa **source** et
  son **statut**.
- **Statut d'un nombre** : **fait** (relevé, cours, acte), **estimation**
  (DVF, simulation, projection), **opinion** (orientation de veille).
- **Dispositif fiscal** : un engagement attaché à un bien, avec sa date de
  fin et la conséquence d'une sortie anticipée — Pinel, Censi-Bouvard,
  LMNP.
- **Paramètre fiscal** : une règle chiffrée, datée par année et sourcée par
  une URL — PFU, prélèvements sociaux, abattements de plus-value, plafonds,
  barème.
- **Poche immobilière** / **poche financière** : les deux régimes de
  mesure du risque (cadrage § 06). L'immobilier se mesure par scénarios, la
  poche financière par statistiques, et jamais l'un avec les méthodes de
  l'autre.
- **Solde d'un passif** : son capital restant dû à une date. Au lot 0, il
  est saisi depuis le relevé de prêt comme une **valorisation** du passif ;
  au lot 1, il se calcule depuis l'échéancier.
- **Bilan net** : actif − passif, à la quote-part, par bien et global. Un
  bilan est **incomplet** quand un actif n'a pas de valeur ou qu'un crédit
  n'a pas de solde à la date : l'actif sort du total, la dette y reste.
- **Non valorisé** : un actif sans aucune valorisation à la date du bilan.
  Il est signalé et exclu de la valeur, jamais compté à zéro en silence.
  Pour un crédit, on dit **sans solde**.
- **Dette sans bien** : le crédit d'un bien qui n'est pas au bilan à la date
  (cédé, ou pas encore acquis) et qui garde un solde non nul. Il reste
  compté, signalé, et rend le bilan incomplet.
- **Date de cession** : la date à laquelle un actif sort du patrimoine
  (champ `date_cloture`). Il n'apparaît plus au bilan à partir de ce jour.
- **Cash-flow d'un bien** : loyers − charges − crédit − impôt estimé, par
  mois.

## La poche financière (lot 1)

- **Poche** : l'ensemble des lignes financières (hors immobilier, hors
  parts de société), ce que l'outil pilote.
- **Ligne** : un actif de la poche, qui porte une **classe** :
  `actions_monde`, `sans_risque`, ou `mixte` avec sa **part actions** (le
  PEE). Un actif financier sans classe ne compte pas dans la poche.
- **Point de départ** : les six questions (de côté et matelas, par mois,
  PEE et sa part actions, horizon, perte maximale, immobilier net estimé).
  Une seule ligne en base (`objectif`), modifiable.
- **Amorçage** : à la première réponse, l'outil crée les lignes évidentes
  sans doublon (livret de réserve, PEE, PEA et assurance-vie si déjà
  ouverts), valorisées « point de départ ».
- **Exposition** : la poche vue par classe, après éclatement des lignes
  mixtes.
- **Destination** d'une classe : la ligne qui reçoit son versement (PEA
  pour les actions ; livret tant qu'il est sous le matelas, sinon
  assurance-vie), ou l'**enveloppe à ouvrir**.
- **Versement du mois** : le montant du point de départ, réparti par la
  règle (option A). **Rattrapage** : tout à la classe la plus en retard ;
  **prorata** : quand tout est dans la bande.
- **Charge utile** : ce qui part vers Claude, et rien d'autre
  (`CLES_CHARGE_UTILE`). **Empreinte** : son hachage, clé du cache.
- **Explication** (le cadrage dit aussi « argumentation ») : le texte qui
  met en mots la décision des règles ; rédigé par Claude, ou de repli.
- **Texte de repli** : l'explication écrite par gabarit depuis les mêmes
  chiffres, quand Claude n'a pas (encore) répondu.
- **Recul** : après un appel en échec, dix minutes sans nouvel essai.
- **Part financière** : poche ÷ (poche + immobilier net saisi).
  **Trajectoire** : son estimation à épargne et rendement constants.

## Les objectifs et l'allocation

- **Objectif** : une cible chiffrée et datée, rattachée à une poche. La
  cible de rendement de la poche financière (A5) s'affiche à côté du
  réalisé et de la bande réaliste, sans jamais pousser au levier.
- **Plancher de perte** (« perte maximale » à l'écran, `perteMaxPb` dans
  le code) : la perte globale maximale tolérée sur la poche financière
  (D3 : −30 %). Il déclenche les alertes et borne la projection.
- **Allocation cible** : poids cible par classe d'actifs, avec sa **bande de
  tolérance** (règle 5/25).
- **Rééquilibrage par les flux** : remettre dans la bande avec les
  versements nouveaux d'abord ; vendre seulement si encore hors bande.
- **Règle d'enveloppe** : une contrainte qui bloque une proposition
  (PEE bloqué 5 ans, PEA clos si retrait avant 5 ans, Pinel repris si sortie
  avant terme). Toute proposition passe par les règles d'enveloppe avant
  d'être affichée.

## La veille (V2)

- **Item de veille** : un fait d'actualité, avec son URL, sa date, son thème
  et les expositions qu'il touche.
- **Orientation** : une opinion de l'outil tirée de la veille — thèse,
  niveau de conviction, risques, conséquence fiscale, mention « aide à la
  décision ». Sans source, pas d'orientation (S9).
- **Journal** : la trace datée des orientations et des décisions prises, sans
  notation.

## Le projet

- **Seam** : une porte du système où un comportement est garanti par un
  test bloquant (S1 à S10 au cadrage).
- **Lot** : une tranche démontrable seule ; chaque lot a son cadrage court
  et sa revue.
- **Épisode** : l'entrée de clôture de session dans le cerveau Graphiti
  `patrimoine` — décisions, dates, structure ; jamais de montants.
