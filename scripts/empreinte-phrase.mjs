#!/usr/bin/env node
// Demande la phrase de passe au clavier, deux fois, sans l'afficher ; imprime
// sur la sortie standard les deux lignes d'environnement du mode public :
// l'empreinte de la phrase et un secret de session neuf. La phrase n'est
// écrite nulle part — ni à l'écran, ni dans l'historique du shell.
//
//   node scripts/empreinte-phrase.mjs | ssh vps-memoire 'umask 077; cat >> /home/ubuntu/patrimoine/patrimoine.env'

import { randomBytes } from 'node:crypto';
import { empreintePhrase } from '../serveur/session.mjs';

function lireSansEcho(invite) {
  process.stderr.write(invite);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  return new Promise((resoudre) => {
    let phrase = '';
    const surTouche = (texte) => {
      for (const c of texte) {
        if (c === '\u0003') { process.stdin.setRawMode(false); process.stderr.write('\n'); process.exit(130); }
        if (c === '\r' || c === '\n') {
          process.stdin.off('data', surTouche);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stderr.write('\n');
          return resoudre(phrase);
        }
        phrase = c === '\u007f' || c === '\b' ? phrase.slice(0, -1) : phrase + c;
      }
    };
    process.stdin.on('data', surTouche);
  });
}

if (!process.stdin.isTTY) {
  process.stderr.write('À lancer dans un terminal : la phrase se tape au clavier, jamais en argument ni par un tube.\n');
  process.exit(1);
}
const phrase = await lireSansEcho('Phrase de passe (rien ne s\'affiche) : ');
if (phrase.length < 12) {
  process.stderr.write('Phrase trop courte : 12 caractères au moins.\n');
  process.exit(1);
}
if ((await lireSansEcho('La même, encore une fois : ')) !== phrase) {
  process.stderr.write('Les deux saisies diffèrent : rien n\'est écrit.\n');
  process.exit(1);
}
process.stdout.write(`PATRIMOINE_PHRASE_EMPREINTE=${empreintePhrase(phrase)}\nPATRIMOINE_SECRET_SESSION=${randomBytes(32).toString('hex')}\n`);
process.stderr.write('Empreinte et secret écrits.\n');
