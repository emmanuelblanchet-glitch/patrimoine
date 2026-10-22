# ADR-0003 — Tout est stocké à 100 %, la quote-part s'applique au calcul

**Date** : 22/10/2026 · **Statut** : accepté (cadrage § 04)

## Contexte

Deux biens sont détenus en indivision à 50 %, dont un avec un crédit en
cours. Deux façons de les modéliser : stocker « ma moitié » de chaque
grandeur, ou stocker le bien entier et sa dette entière, puis appliquer la
quote-part au moment du calcul.

## Décision

**Chaque actif et chaque passif sont stockés à 100 %** — valeur entière,
crédit entier, loyers entiers. L'enveloppe porte la **quote-part**, et le
bilan, le cash-flow et la plus-value l'appliquent au calcul, toujours à
l'actif et au passif ensemble (seam S2).

## Alternatives écartées

- Stocker la part détenue : plus simple à lire, mais la dette entière, les
  loyers entiers et le tableau d'amortissement de la banque ne se divisent
  pas proprement, et un jour l'actif est divisé sans le passif.

## Conséquences

- Une quote-part qui change (rachat de soulte, vente) est une modification
  d'enveloppe datée, pas une réécriture de valeurs.
- Les documents de référence (acte, tableau d'amortissement) se saisissent
  tels quels, sans calcul à la main.
