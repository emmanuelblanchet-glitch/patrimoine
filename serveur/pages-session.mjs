// Page de connexion du mode public (lot 3) : une phrase, rien d'autre.

import { gabarit, blocErreurs, echapper } from './gabarit.mjs';

export function pageConnexion({ motifs = [], attenteMinutes = 0 } = {}) {
  return gabarit('Connexion', '', `
<h1>Patrimoine</h1>
<p class="sous-titre">Ta phrase de passe, puis trente jours de tranquillité sur cet appareil.</p>
${blocErreurs(motifs)}
${attenteMinutes ? `<p class="vide">Trop d'essais : réessaie dans ${attenteMinutes} minute${attenteMinutes > 1 ? 's' : ''}.</p>` : `<form method="post" action="/connexion" class="saisie">
  <label>Phrase de passe<input type="password" name="phrase" id="phrase" autocomplete="current-password" required autofocus></label>
  <button>Entrer</button>
</form>`}
<p class="aide">${echapper('Accessible seulement depuis ton réseau privé. Rien n\'est stocké sur l\'appareil, sauf le cookie de session.')}</p>`, { nu: true });
}
