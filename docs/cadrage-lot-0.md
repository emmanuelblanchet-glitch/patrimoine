# Cadrage PATRIMOINE-01 — résumé committé, sans chiffres

Le cadrage complet (`Dev/cadrage-patrimoine-01.html`, local, hors dépôt)
a été validé par Emmanuel le 22/10/2026. Ce résumé en garde la substance ;
il ne contient aucun montant ni aucune donnée personnelle (ADR-0002).

## Le problème

Savoir chaque semaine, en cinq minutes sur l'iPhone, ce que je possède net
de dettes, ce que chaque bien rapporte ou coûte, ce qui arrive à échéance et
ce que je dois décider ; et pour l'argent nouveau, investir selon des règles
écrites, éclairées par l'actualité, sans que l'outil décide à ma place.

Le patrimoine réel est presque entièrement immobilier et à crédit — deux
résidences principales en indivision, un bien en résidence étudiante
(LMNP Censi-Bouvard, bail commercial), un bien sous Pinel — plus une
réserve de liquidités et un PEE abondé. Aucun titre coté. La roadmap est
donc inversée par rapport au brief initial : bilan immobilier d'abord.

## Décisions actées

| Clé | Décision |
|---|---|
| A0 | Usage exclusivement personnel ; aucun sujet CIF/AMF tant que c'est vrai. |
| A1 | Rien n'existe : on construit. |
| A2 | Les vrais chiffres peuvent être transmis au modèle (Claude) pour l'analyse. *Contre recommandation.* |
| A3 | La V2 produit des orientations sourcées tirées de l'actualité, pas une méthode gagnante. *Contre recommandation.* |
| A4 | Activité nouvelle et cloisonnée : `Dev/patrimoine/`. |
| A5 | L'objectif de rendement porte sur la poche financière à venir, jamais sur l'immobilier ; l'outil affiche la cible à côté du réalisé et de la bande réaliste, sans pousser au levier. |
| A6 | Les parts de société : une ligne valorisée à la main, sans lien avec l'activité. |
| A7 | Consultation Mac et iPhone, hebdomadaire ; saisie trois heures par mois. |
| D1 | VPS OVH, conteneur dédié, joignable uniquement par Tailscale. |
| D2 | Cerveau Graphiti `patrimoine` activé (cinquième cerveau). *Contre recommandation.* Épisodes sans montants. |
| D3 | Plancher de perte global sur la poche financière : −30 %. |
| D4 | Node + SQLite + HTML/modules ES, zéro dépendance (ADR-0001). |
| D5 | Clé `PATRIMOINE-01`, socle instancié par `/nouveau-projet`. |

## Roadmap (recadrée le 22/10/2026)

L'objet de l'outil est la **poche financière à construire**, pour ne plus
dépendre de l'immobilier. L'immobilier n'est qu'un total saisi à la main,
qui sert à afficher la part financier / immobilier. La saisie est un
parcours guidé en français, pas des formulaires qui exposent le modèle.

- **MVP — ma poche financière** : lot 0 (livré) base, serveur local,
  garde-fous ; lot 1 point de départ en six questions, allocation cible
  simple et argumentée, page « quoi faire ce mois-ci », total immobilier ;
  lot 2 saisie guidée des achats, cours automatiques, performance, écart à
  la cible, règles d'enveloppe ; lot 3 iPhone, mot de passe, sauvegarde.
- **V1 — guidage par l'actualité et risque** : veille sourcée et
  orientations croisées avec les lignes détenues, indicateurs de risque au
  seuil de données, projection à l'horizon retraite, détail du PEE.
- **V2 — l'immobilier en détail, si utile** : échéanciers, calendrier des
  engagements, cash-flow, fiscalité et simulateur de sortie.

## Seams

S1 échéancier à l'euro près · S2 quote-part actif et passif ensemble ·
S3 paramètres datés, échec bruyant · S4 plus-value immobilière (exemples
BOFiP) · S5 import PEE idempotent · S6 valeur sans source refusée ·
S7 performance (exemples GIPS) · S8 règles d'enveloppe bloquantes ·
S9 orientation sourcée · S10 aucune écriture externe.

## Hors périmètre

Multi-utilisateur, partage, conseil à des tiers ; passage d'ordres ;
déclaration fiscale automatique ; agrégation bancaire avant la V2 ;
optimisation moyenne-variance comme moteur ; trading court terme ; écrans
crypto et private equity.
