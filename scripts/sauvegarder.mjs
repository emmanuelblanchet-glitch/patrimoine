#!/usr/bin/env node
// Sauvegarde chiffrée de la base (lot 3, L3-3) — Node seul, zéro dépendance.
//
//   node scripts/sauvegarder.mjs sauvegarder <base> <dossier>   PATRIMOINE_SAUVEGARDE_PHRASE dans l'environnement
//   node scripts/sauvegarder.mjs restaurer <fichier> <base de sortie>
//
// Copie cohérente par `VACUUM INTO` (jamais un cp d'une base ouverte), puis
// AES-256-GCM avec une clé dérivée de la phrase par scrypt. Format du
// fichier : en-tête « PATRIMOINE1 », sel (16), nonce (12), étiquette (16),
// chiffré. Rotation : les sauvegardes de plus de 30 jours sont supprimées.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const EN_TETE = Buffer.from('PATRIMOINE1');
// N = 2^15 demande 32 Mo de mémoire : au-dessus de la limite par défaut de Node, d'où maxmem.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const RETENTION_JOURS = 30;
const ENTETE_LONGUEUR = 11 + 16 + 12 + 16; // en-tête, sel, nonce, étiquette
const PREFIXE = 'patrimoine-';
const SUFFIXE = '.sqlite.chiffre';

const cle = (phrase, sel) => scryptSync(phrase.normalize('NFC'), sel, 32, SCRYPT);

export function chiffrer(clair, phrase) {
  if (typeof phrase !== 'string' || phrase.length < 12) throw new Error('phrase de sauvegarde trop courte (12 caractères au moins)');
  const sel = randomBytes(16);
  const nonce = randomBytes(12);
  const chiffreur = createCipheriv('aes-256-gcm', cle(phrase, sel), nonce);
  const corps = Buffer.concat([chiffreur.update(clair), chiffreur.final()]);
  return Buffer.concat([EN_TETE, sel, nonce, chiffreur.getAuthTag(), corps]);
}

/** Lève si la phrase est mauvaise ou le fichier altéré (étiquette GCM). */
export function dechiffrer(fichier, phrase) {
  if (fichier.length < ENTETE_LONGUEUR || !fichier.subarray(0, EN_TETE.length).equals(EN_TETE)) throw new Error('ce fichier n\'est pas une sauvegarde Patrimoine');
  let i = EN_TETE.length;
  const sel = fichier.subarray(i, i += 16);
  const nonce = fichier.subarray(i, i += 12);
  const etiquette = fichier.subarray(i, i += 16);
  const dechiffreur = createDecipheriv('aes-256-gcm', cle(phrase, sel), nonce, { authTagLength: 16 });
  dechiffreur.setAuthTag(etiquette);
  try {
    return Buffer.concat([dechiffreur.update(fichier.subarray(i)), dechiffreur.final()]);
  } catch {
    throw new Error('déchiffrement refusé : mauvaise phrase ou fichier altéré');
  }
}

/** Copie cohérente de la base ouverte, dans un fichier temporaire, rendue en mémoire. */
function copieCoherente(cheminBase) {
  const dossier = mkdtempSync(join(tmpdir(), 'patrimoine-sauvegarde-'));
  const copie = join(dossier, 'copie.db');
  const base = new DatabaseSync(cheminBase, { readOnly: true });
  try {
    base.exec(`VACUUM INTO '${copie.replaceAll("'", "''")}'`);
  } finally {
    base.close();
  }
  try {
    return readFileSync(copie);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/** Les sauvegardes de plus de RETENTION_JOURS sont supprimées ; les autres fichiers du dossier ne sont pas touchés. */
export function sauvegarder(cheminBase, dossier, phrase) {
  const clair = copieCoherente(cheminBase);
  const maintenant = new Date();
  const horodatage = maintenant.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  mkdirSync(dossier, { recursive: true });
  const sortie = join(dossier, `${PREFIXE}${horodatage}${SUFFIXE}`);
  writeFileSync(sortie, chiffrer(clair, phrase), { mode: 0o600 });
  const limite = maintenant.getTime() - RETENTION_JOURS * 24 * 60 * 60 * 1000;
  for (const nom of readdirSync(dossier)) {
    if (!nom.startsWith(PREFIXE) || !nom.endsWith(SUFFIXE)) continue;
    if (statSync(join(dossier, nom)).mtimeMs < limite) unlinkSync(join(dossier, nom));
  }
  return sortie;
}

/** Déchiffre vers un fichier de base ; refuse d'écraser une base existante. */
export function restaurer(fichier, cheminSortie, phrase) {
  const clair = dechiffrer(readFileSync(fichier), phrase);
  writeFileSync(cheminSortie, clair, { flag: 'wx', mode: 0o600 });
  const base = new DatabaseSync(cheminSortie, { readOnly: true });
  try {
    const { n } = base.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get();
    return { tables: n };
  } finally {
    base.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [commande, a, b] = process.argv.slice(2);
  const phrase = process.env.PATRIMOINE_SAUVEGARDE_PHRASE;
  try {
    if (commande === 'sauvegarder' && a && b) {
      process.stdout.write(`Sauvegarde écrite : ${sauvegarder(a, b, phrase)}\n`);
    } else if (commande === 'restaurer' && a && b) {
      const r = restaurer(a, b, phrase);
      process.stdout.write(`Base restaurée : ${b} (${r.tables} tables)\n`);
    } else {
      process.stderr.write('Usage : sauvegarder <base> <dossier> | restaurer <fichier> <base de sortie>\n');
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`Échec : ${e.message}\n`);
    process.exit(1);
  }
}
