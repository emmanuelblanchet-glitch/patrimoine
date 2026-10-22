# Lot 1 — ma poche financière

Cadrage court, 23/10/2026, après le recadrage du même jour (l'objet de
l'outil est la poche financière à construire ; voir `docs/cadrage-lot-0.md`,
§ Roadmap). Aucun chiffre personnel ici (ADR-0002).

## Le problème, de ton point de vue

Tu veux diversifier hors de l'immobilier, et tu ne sais pas par où
commencer ni quoi faire chaque mois de tes versements. À la fin du lot 1,
l'outil te pose six questions en français, te propose une allocation
cible simple et argumentée, et sa page d'accueil te dit chaque mois quoi
faire de ton épargne, où en est ta poche, et quelle part de ton patrimoine
elle représente face à l'immobilier.

**Démontrable seul** : « voilà où j'en suis, et voilà quoi faire ce
mois-ci avec mes 500 € ».

## Décisions du lot (23/10/2026, Emmanuel — cadrage validé le 23/10/2026)

| Clé | Décision |
|---|---|
| L1-1 | **Allocation cible de départ : 60 % actions monde / 40 % sans risque.** Actions monde = un seul ETF large. Sans risque = livret (le matelas) puis fonds euros. Le PEE compte dans les deux poches selon la part actions de ses fonds. Bandes de tolérance : règle 5/25. |
| L1-2 | **Deux enveloppes** : un **PEA** pour les actions monde (à ouvrir tôt, ses avantages courent à partir de 5 ans), une **assurance-vie** en fonds euros pour la part sans risque au-delà du matelas sur livret. Confirmé par Emmanuel après explication des trois enveloppes. |
| L1-3 | **Claude rédige l'argumentation** de l'allocation et du « quoi faire ce mois-ci ». *Contre la recommandation ; livré tel quel.* Les chiffres viennent des règles codées, Claude les met en mots ; texte mis en cache tant que la situation ne change pas ; repli par gabarit sans clé ou sans réseau. |
| L1-5 | **Répartition du versement du mois (option A)** : tout le versement va à la ligne la plus éloignée sous sa cible ; quand toutes les lignes sont dans leur bande, répartition au prorata des cibles. Jamais de vente. |
| L1-4 | **Design** : réglages retenus dans l'atelier (`docs/design/reglages.json`, préréglage « Ardoise »). Polices embarquées dans `public/fonts/`, jamais chargées depuis un tiers. |

## Ce que le lot construit

### Le point de départ : six questions, une page

En français, avec une aide sous chaque question, jamais un champ du modèle :

1. Combien as-tu de côté, disponible tout de suite ? (réserve)
2. Combien veux-tu placer chaque mois ?
3. Qu'y a-t-il sur ton PEE, et quelle part est en actions ? (« je ne sais
   pas » = 50 %, à préciser plus tard)
4. Dans combien d'années comptes-tu te servir de cet argent ? (horizon)
5. Quelle perte maximale accepterais-tu de voir, sans vendre ? (défaut −30 %, D3)
6. Que vaut ton immobilier net de crédits, à la louche ? (une estimation,
   datée — c'est la seule chose qu'on lui demande sur l'immobilier)

Les réponses se rangent dans `profil` et dans une table `objectif`. On
peut y revenir à tout moment (« Réglages → mon point de départ »).

### L'allocation cible et ses lignes

- Une table `allocation_cible` : classe → poids cible, bande.
- Chaque **ligne** de la poche est un actif existant du modèle (ETF,
  liquidités, FCPE…) portant une **classe** (`actions_monde`,
  `sans_risque`, `mixte` avec une part actions) et son enveloppe.
- Une page « mon allocation » : la cible en lignes compréhensibles, quelle
  enveloppe pour chacune et pourquoi, le texte d'argumentation (L1-3) et la
  mention « aide à la décision, pas un conseil réglementé ».

### La page d'accueil (maquette validée dans l'atelier)

- valeur de la poche (dernières valorisations saisies ; les cours
  automatiques viennent au lot 2) ;
- part financier / immobilier = poche ÷ (poche + immobilier net saisi), et
  une trajectoire **estimation** à épargne constante et rendement
  paramétrable (défaut 5 %/an) ;
- **quoi faire ce mois-ci** : la règle répartit le versement du mois vers
  les lignes sous leur cible (la plus éloignée d'abord ; si tout est dans
  la bande, au prorata des cibles). Aucune vente au lot 1 : on ne
  rééquilibre que par les flux ;
- allocation contre la cible (barres) ; lignes avec source et date de
  chaque valeur.

### La saisie du mois

« J'ai versé X sur telle ligne, le … » : une phrase, trois champs. Elle
crée une transaction (type `versement`) et, si tu le dis, la nouvelle
valeur de la ligne. L'abondement du PEE se saisit de la même façon.

### L'argumentation par Claude (L1-3)

- Appel côté serveur, clé dans `ANTHROPIC_API_KEY` sur le Mac, jamais dans
  le dépôt (le validateur refuse déjà les motifs de clés).
- Ce qui part : la cible, les poids actuels, le versement du mois et la
  répartition décidée par la règle, l'horizon et le plancher. Rien
  d'autre : ni libellés libres, ni immobilier détaillé, ni identité.
  Construit par une fonction pure, testée.
- Le texte est stocké avec une empreinte de ses entrées ; même entrées,
  même texte. Sans clé, sans réseau ou en erreur : un gabarit écrit à
  partir des mêmes chiffres s'affiche, marqué « texte de repli ».
- Chaque texte porte la mention « aide à la décision ».

### Le design

`public/style.css` réécrit depuis `docs/design/reglages.json` ; les deux
polices (Inter Tight, Instrument Sans) en fichiers `woff2` sous
`public/fonts/`, servies par le serveur local. Les pages du lot 0
(enveloppes, actifs, crédits, valorisations) restent accessibles sous
« Réglages → données détaillées », avec le même habillage ; elles ne sont
plus l'entrée.

### Précisé au développement

- Le point de départ porte **sept champs et deux cases** : la question 1 se
  dédouble en « de côté » et « dont matelas de précaution » ; deux cases
  disent si un PEA et une assurance-vie existent déjà. À la première
  réponse, l'outil **amorce** les lignes sans doublon : livret de réserve
  (valorisé à la réserve), PEE (ligne mixte, part actions saisie ou 50 %),
  PEA et assurance-vie cochés (lignes vides). Source : « point de départ ».
- **Destination** d'un versement : les actions vont à la ligne actions du
  PEA (sinon à une autre ligne actions, sinon « ouvrir un PEA ») ; le sans
  risque va au livret tant qu'il est sous le matelas, sinon au fonds euros
  de l'assurance-vie, sinon « ouvrir une assurance-vie ».
- L'appel à Claude est **asynchrone** : la page rend tout de suite le texte
  de repli et lance l'appel ; la rédaction s'affiche au chargement suivant,
  depuis le cache. Un appel en échec laisse le repli, dit la raison, et
  réessaie au chargement suivant.
- Les polices vivent dans `public/fonts/`, seul sous-dossier servi ; la
  politique de sécurité du contenu ajoute `font-src 'self'`.
- La saisie « classer une ligne » (page Lignes) couvre les actifs créés par
  les pages détaillées ; créer un nouvel actif passe encore par la page
  Actifs du lot 0 (un parcours guidé « ajouter une ligne » reste à faire —
  reliquat acté, lot 2).
- *Après revue* : la charge utile vers Claude est exactement la liste du
  cadrage, l'enveloppe visée (ou à ouvrir) comprise dans la répartition ;
  ni valeur de la poche ni part financière (avec les deux, on retrouverait
  l'immobilier). L'appel active le repli serveur d'Anthropic
  (`fallbacks: 'default'`) : en cas de refus par un classifieur, un autre
  modèle rédige plutôt que de rendre un refus. Après un échec, pas de nouvel
  essai avant dix minutes (pas de refacturation à chaque chargement). Le
  cache ne garde que la situation courante. Le rendement estimé de la
  trajectoire est une septième réponse du point de départ (5 % par défaut).
  L'avertissement du plancher s'affiche à l'enregistrement, avant de
  continuer. Une page « Allocation » dit la cible, l'enveloppe de chaque part
  et pourquoi, avec la mention complète. Poche vide : le premier versement
  part au prorata de la cible (lecture de L1-5, à confirmer).

## Seams testés (bloquants, jeux synthétiques)

| Seam | Comportement garanti |
|---|---|
| S-L1-1 règle d'allocation | Pure : cible 60/40, bandes 5/25, répartition d'un versement vers les lignes sous cible, prorata si tout est dans la bande, jamais de montant négatif, somme égale au versement au centime. |
| S-L1-2 point de départ | Les six réponses se lisent en français (montants, pourcentages, années), s'enregistrent, se relisent ; une réponse illisible est refusée avec le motif ; le plancher de perte ne peut pas dépasser ce que l'allocation implique sans avertissement. |
| S-L1-3 minimisation | Ce qui part vers Claude est exactement la liste ci-dessus ; un test vérifie qu'aucune autre clé n'entre dans la charge utile. |
| S-L1-4 repli | Sans clé, sans réseau ou avec une réponse en erreur, la page se rend avec le gabarit et la mention « texte de repli » ; l'appel n'est jamais sur le chemin du rendu des chiffres. |
| S-L1-5 cache | Mêmes entrées → même texte, aucun second appel ; entrées changées → nouvel appel. |
| S10 | Toujours : aucune écriture vers l'extérieur ; l'appel à Claude est une lecture de texte, sans outil, sans action. |

Plus les tests existants (71).

## Hors lot 1, explicitement

Cours automatiques et performance (lot 2) ; orientations d'actualité (V1) ;
iPhone, mot de passe, VPS (lot 3) ; toute vente ou arbitrage ; détail du
PEE par fonds ; tout écran immobilier au-delà du total saisi.

## Livraison

Branche `lot-1/ma-poche-financiere` depuis `main` ; `/revue` avant push ;
PR ouverte par Emmanuel. À la livraison : `CLAUDE.md` (clé d'API, carte),
`CONTEXT.md` (ligne, classe, point de départ, texte de repli), fiche
technico-fonctionnelle rafraîchie sur la même URL, épisode de clôture sans
montants.
