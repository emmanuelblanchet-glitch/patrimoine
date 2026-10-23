#!/usr/bin/env node
// Point d'entrée : `npm run serveur` (ou `node serveur/demarrer.mjs`).
//
//   PATRIMOINE_DB    chemin de la base, HORS du dépôt (obligatoire)
//   PATRIMOINE_PORT  port local (facultatif, 8710 par défaut)
//   PATRIMOINE_HOTE_PUBLIC, PATRIMOINE_PHRASE_EMPREINTE, PATRIMOINE_SECRET_SESSION,
//   PATRIMOINE_UTILISATEUR : ensemble, le mode public du lot 3 (voir deploiement/).
//
// L'hôte d'écoute n'est pas réglable : 127.0.0.1, toujours.

import { lireConfiguration, HOTE } from './config.mjs';
import { demarrerServeur } from './application.mjs';
import { ouvrirBase } from '../lib/base.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';

const config = lireConfiguration(process.env);
if (!config.ok) {
  process.stderr.write(`Démarrage refusé : ${config.motif}\n`);
  process.exit(1);
}

const base = ouvrirBase(config.chemin, { modeTest: false });
const { avant, apres } = appliquerMigrations(base);
if (avant !== apres) process.stdout.write(`Base amenée de la version ${avant} à la version ${apres}.\n`);

const serveur = await demarrerServeur({ base, port: config.port, public: config.public });
process.stdout.write(`Patrimoine : http://${HOTE}:${serveur.address().port}/  (base : ${config.chemin}${config.public ? ` ; mode public derrière ${config.public.hote}` : ''})\n`);

const arreter = () => {
  serveur.close(() => {
    base.close();
    process.exit(0);
  });
};
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
