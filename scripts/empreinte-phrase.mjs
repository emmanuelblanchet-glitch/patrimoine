#!/usr/bin/env node
// Imprime l'empreinte d'une phrase de passe lue sur l'entrée standard (sans
// écho), à coller dans PATRIMOINE_PHRASE_EMPREINTE ; puis un secret de
// session neuf pour PATRIMOINE_SECRET_SESSION. La phrase n'est écrite nulle part.
//   printf '%s' 'ma phrase' | node scripts/empreinte-phrase.mjs

import { randomBytes } from 'node:crypto';
import { empreintePhrase } from '../serveur/session.mjs';

let phrase = '';
process.stdin.setEncoding('utf8');
for await (const morceau of process.stdin) phrase += morceau;
phrase = phrase.replace(/\r?\n$/, '');
if (phrase.length < 12) {
  process.stderr.write('Phrase trop courte : 12 caractères au moins.\n');
  process.exit(1);
}
process.stdout.write(`PATRIMOINE_PHRASE_EMPREINTE=${empreintePhrase(phrase)}\nPATRIMOINE_SECRET_SESSION=${randomBytes(32).toString('hex')}\n`);
