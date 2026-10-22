// Schéma de la base — migrations numérotées, appliquées dans l'ordre.
//
// Règle : une migration publiée ne se modifie JAMAIS ; un changement de
// schéma est une nouvelle migration. Le SQL est donc écrit en littéral,
// sans interpoler de constantes du code qui pourraient bouger plus tard.

export const MIGRATIONS = [
  {
    version: 1,
    nom: 'schéma initial du lot 0',
    sql: `
      CREATE TABLE profil (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        date_naissance TEXT,
        situation TEXT,
        parts_fiscales_centiemes INTEGER,
        tmi_pb INTEGER,
        horizon TEXT,
        matelas_cible_centimes INTEGER
      );

      CREATE TABLE enveloppe (
        id INTEGER PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('immobilier_direct', 'pee', 'per', 'pea', 'cto', 'av', 'livret', 'compte_courant', 'societe')),
        libelle TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
        etablissement TEXT,
        date_ouverture TEXT,
        quote_part_num INTEGER NOT NULL CHECK (quote_part_num > 0),
        quote_part_den INTEGER NOT NULL CHECK (quote_part_den > 0 AND quote_part_num <= quote_part_den),
        regime_fiscal TEXT
      );

      CREATE TABLE actif (
        id INTEGER PRIMARY KEY,
        enveloppe_id INTEGER NOT NULL REFERENCES enveloppe (id),
        nature TEXT NOT NULL CHECK (nature IN ('bien', 'fcpe', 'etf', 'action', 'parts', 'liquidites')),
        libelle TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
        identifiant TEXT,
        classe TEXT,
        zone TEXT,
        secteur TEXT,
        devise TEXT NOT NULL DEFAULT 'EUR',
        liquidite TEXT,
        date_acquisition TEXT,
        prix_acquisition_centimes INTEGER,
        frais_acquisition_centimes INTEGER,
        date_cloture TEXT
      );

      CREATE TABLE passif (
        id INTEGER PRIMARY KEY,
        actif_id INTEGER NOT NULL REFERENCES actif (id),
        libelle TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
        etablissement TEXT,
        capital_initial_centimes INTEGER,
        taux_pb INTEGER,
        duree_mois INTEGER,
        mensualite_centimes INTEGER,
        assurance_mensuelle_centimes INTEGER,
        date_premiere_echeance TEXT,
        type TEXT NOT NULL DEFAULT 'amortissable' CHECK (type IN ('amortissable', 'in_fine'))
      );

      -- Une valeur à une date, pour un actif OU un passif (pour un passif :
      -- le capital restant dû). Source et statut obligatoires (seam S6).
      CREATE TABLE valorisation (
        id INTEGER PRIMARY KEY,
        actif_id INTEGER REFERENCES actif (id),
        passif_id INTEGER REFERENCES passif (id),
        date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
        valeur_centimes INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (length(trim(source)) > 0),
        statut TEXT NOT NULL CHECK (statut IN ('fait', 'estimation')),
        note TEXT,
        CHECK ((actif_id IS NULL) <> (passif_id IS NULL)),
        CHECK (passif_id IS NULL OR valeur_centimes >= 0)
      );
      CREATE INDEX valorisation_actif ON valorisation (actif_id, date);
      CREATE INDEX valorisation_passif ON valorisation (passif_id, date);

      -- « transaction » est un mot réservé SQL : la table porte le pluriel.
      -- Présente dès le schéma v1, sans écran avant le lot 1.
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        actif_id INTEGER NOT NULL REFERENCES actif (id),
        type TEXT NOT NULL CHECK (type IN ('achat', 'vente', 'versement', 'retrait', 'abondement', 'loyer', 'charge', 'taxe', 'interet', 'dividende', 'impot')),
        montant_centimes INTEGER NOT NULL,
        quantite_millioniemes INTEGER,
        frais_centimes INTEGER NOT NULL DEFAULT 0,
        contre_ecriture_de INTEGER REFERENCES transactions (id),
        note TEXT
      );
    `,
  },
];

export const VERSION_CONNUE = MIGRATIONS.at(-1).version;

export function versionDeLaBase(base) {
  const table = base
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration'")
    .get();
  if (!table) return 0;
  return base.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM migration').get().v;
}

/**
 * Amène la base à la dernière version connue. Rejouable sans effet.
 * Refuse une base plus récente que le code : l'ouvrir risquerait de la
 * corrompre avec un code qui ne connaît pas son schéma.
 */
export function appliquerMigrations(base, { migrations = MIGRATIONS, maintenant = () => new Date().toISOString() } = {}) {
  const connue = migrations.at(-1)?.version ?? 0;
  const actuelle = versionDeLaBase(base);
  if (actuelle > connue) {
    throw new Error(
      `base en version ${actuelle}, ce code ne connaît que la version ${connue} : ouverture refusée`,
    );
  }

  base.exec(
    'CREATE TABLE IF NOT EXISTS migration (version INTEGER PRIMARY KEY, nom TEXT NOT NULL, appliquee_le TEXT NOT NULL)',
  );

  const appliquees = [];
  for (const m of migrations) {
    if (m.version <= actuelle) continue;
    base.exec('BEGIN');
    try {
      base.exec(m.sql);
      base
        .prepare('INSERT INTO migration (version, nom, appliquee_le) VALUES (?, ?, ?)')
        .run(m.version, m.nom, maintenant());
      base.exec('COMMIT');
    } catch (erreur) {
      base.exec('ROLLBACK');
      throw erreur;
    }
    appliquees.push(m.version);
  }
  return { avant: actuelle, apres: Math.max(actuelle, connue), appliquees };
}
