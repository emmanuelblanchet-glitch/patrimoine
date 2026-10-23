# Lot 3 — l'outil sur le VPS, joignable de l'iPhone

Cadrage court, 23/10/2026. Décision générale déjà actée au cadrage initial
(D1, 22/10) : hébergement sur le VPS OVH, conteneur dédié, joignable
uniquement par le réseau privé Tailscale depuis le Mac et l'iPhone ; lot 3 =
« accès iPhone par réseau privé, mot de passe, sauvegarde chiffrée ».

## Le problème, vu d'Emmanuel

Aujourd'hui l'outil tourne sur le Mac (agent launchd) : l'iPhone ne le voit
pas, la base n'est sauvegardée nulle part, et toute personne devant le Mac
peut lire et écrire. Après le lot 3 : il ouvre l'outil depuis le Mac ou
l'iPhone, partout, derrière le réseau privé et une phrase de passe ; la base
est sauvegardée chaque nuit, chiffrée ; le Mac peut être éteint.

## Décisions (Emmanuel, 23/10/2026)

- **L3-1 — Porte : phrase de passe + session de 30 jours**, et identité
  Tailscale vérifiée. La phrase n'existe qu'en empreinte (scrypt, sel) dans
  l'environnement du conteneur ; le cookie de session est signé (HMAC, secret
  d'environnement), `HttpOnly`, `Secure`, `SameSite=Strict`, 30 jours par
  appareil ; 5 essais ratés = 10 minutes d'attente. En plus, l'en-tête
  d'identité que `tailscale serve` ajoute (`Tailscale-User-Login`) doit être
  le compte d'Emmanuel (`PATRIMOINE_UTILISATEUR`) : un autre membre du tailnet
  reçoit 403 avant même la page de connexion. Sans cette variable, le serveur
  refuse de démarrer hors mode local.
- **L3-2 — Déploiement : copie depuis le Mac**, `scripts/deployer-vps.sh` :
  rsync du dépôt (fichiers suivis par git seulement — ni base, ni `.env`, ni
  `.mcp.json`) vers `/home/ubuntu/patrimoine/depot`, puis reconstruction et
  redémarrage du conteneur. Aucun jeton GitHub sur le VPS.
- **L3-3 — Sauvegarde : quotidienne, chiffrée, 30 jours.** Copie cohérente
  (`sqlite3 .backup` via Node, jamais `cp` d'une base ouverte), chiffrée
  AES-256 (`openssl enc -pbkdf2`) avec une phrase stockée sur le VPS hors
  dépôt (`/home/ubuntu/patrimoine/sauvegarde.env`, 600) **et** dans le
  gestionnaire de mots de passe d'Emmanuel ; déposée dans
  `/home/ubuntu/backups/patrimoine/` (dossier déjà rapatrié sur le Mac
  chaque matin) ; rotation 30 jours ; **restauration testée une fois** dans
  le lot, sur une copie.

## Précisé par l'exploration (faits)

- VPS : Docker 29, Tailscale 1.98, 1,1 Go disponibles, 15 Go de disque ;
  ports 8000-8005 pris par les cerveaux → **8006** pour Patrimoine
  (`tailscale serve` : `http://vps-memoire.tailde497c.ts.net:8006`, tailnet
  seulement, comme les cerveaux). Un conteneur Node 24 (`node:24-alpine`),
  base dans un volume, ~80 Mo de RSS attendus.
- Le serveur reste lié à `127.0.0.1` dans le conteneur (règle du lot 0 :
  l'hôte n'est pas réglable) ; Docker publie `127.0.0.1:8006` sur l'hôte,
  `tailscale serve` le relaie. La garde `Host` accepte le nom tailnet déclaré
  (`PATRIMOINE_HOTE_PUBLIC`), en plus du local.
- Le cookie `Secure` exige HTTPS : `tailscale serve --https=8006` (certificat
  tailnet) — à mesurer sur le VPS ; si seul HTTP est servi, le cookie se met
  en `Secure` seulement derrière `X-Forwarded-Proto: https`.
- Migration de la base : une copie unique du Mac vers le volume du VPS
  (`scripts/migrer-base-vps.sh`, sqlite `.backup` puis `scp`), puis l'agent
  launchd du Mac est **retiré** (`launchctl bootout`, plist supprimé) : une
  seule base vivante.
- La clé Anthropic et l'identifiant d'espace de travail passent dans
  `/home/ubuntu/patrimoine/patrimoine.env` (600), jamais dans l'image.

## Aussi dans le lot (décidé seul, sans arbitrage)

- Passe iPhone : les pages à 390 px (tableaux qui défilent, formulaires sur
  une colonne, zones tactiles), vérifiée sur aperçu ; et la retouche parquée
  du 2b : les attributs `style=""` refusés par la CSP passent en classes
  (barres d'allocation, jauge, marges).
- Limite sur la recherche de lignes (`GET /lignes?q`) : 10 par minute, puis
  429 avec le délai — chaque recherche part vers Yahoo.
- Journal du serveur sans donnée : les échecs de connexion notent l'heure et
  l'adresse source Tailscale, jamais la phrase tapée.
- Exclusion de Théo : **mesuré le 23/10, le PC de Théo est enregistré sur le
  compte Tailscale d'Emmanuel** (même identifiant utilisateur que le Mac) —
  l'identité Tailscale ne le distingue donc pas ; c'est la **phrase de passe**
  qui tient la porte, et l'ACL Tailscale par appareil (console admin, à la
  main) reste la ceinture. L'identité Tailscale garde tout de même sa
  valeur : elle ferme la porte à tout autre compte invité un jour.

## Précisé au développement

- Les barres d'allocation et la jauge financier/immobilier sont des
  éléments `<progress>` : la CSP refuse les largeurs en attribut `style`
  (retouche parquée du 2b, faite ici) ; plus aucun attribut `style` dans
  les pages de la poche.
- Le compteur d'essais et la limite de recherche se comptent **par source**
  (adresse transmise par le relais) ; une autre source n'est pas touchée.
- Le mode public refuse toute requête dont l'en-tête Host n'est pas l'hôte
  déclaré, même locale : seul le relais y mène.
- La sauvegarde dérive sa clé par scrypt (N = 2¹⁵, 32 Mo) et refuse de
  restaurer par-dessus une base existante ; la base d'origine reste ouverte
  et intacte pendant la copie (`VACUUM INTO` sur une connexion en lecture).
- `scripts/deployer-vps.sh` envoie par `tar` sur `ssh` (pas de dépendance
  à rsync, dont la version du Mac est atypique) et **refuse** un dépôt qui
  suivrait une base, un `.env` ou le câblage MCP.

## Précisé après la revue

- **Correction de fait sur la publication** : un serveur lié à `127.0.0.1`
  *dans* un conteneur n'est pas joignable par un port publié par Docker. Le
  conteneur tourne donc sur le **réseau de l'hôte** (`network_mode: host`) :
  le serveur reste lié à `127.0.0.1` (règle du lot 0 intacte, l'adresse
  d'écoute n'est toujours pas réglable), celui de l'hôte, et
  `tailscale serve --https=8006` le relaie. Seuls les processus de l'hôte
  lui-même atteignent ce port, pas les autres conteneurs.
- **Mode public déclaré** : `PATRIMOINE_MODE=public` est posé par
  `compose.yml`, pas par le fichier d'environnement ; un réglage manquant, ou
  des réglages publics sans la déclaration = refus de démarrer. Sur le VPS,
  le mode local ne peut pas revenir par oubli.
- **Plafond global d'échecs** : 20 en dix minutes, toutes sources confondues,
  suspendent les essais pour tout le monde — la source vient d'un en-tête
  qu'un processus local pourrait forger.
- **Connexion et déconnexion vérifient l'origine** (`https://<hôte public>`) :
  une page tierce ouverte dans le navigateur ne peut ni épuiser les essais ni
  déconnecter.
- **Sessions révocables** : la signature combine le secret et l'empreinte ;
  changer la phrase déconnecte tous les appareils.
- **Phrase saisie sans écho** : `scripts/empreinte-phrase.mjs` la demande au
  clavier, deux fois, et refuse un tube — elle n'entre jamais dans
  l'historique du shell.
- **Sauvegarde hors du conteneur du serveur** : un conteneur éphémère, sans
  réseau, lancé chaque nuit par le cron d'`ubuntu`
  (`deploiement/sauvegarde-quotidienne.sh`), seul à lire `sauvegarde.env` ;
  dépôt dans `~/backups/patrimoine/base/` (le dossier `patrimoine/` contient
  déjà les sauvegardes du cerveau Graphiti) ; AES-256-GCM plutôt
  qu'`openssl enc` (authentifié : une sauvegarde altérée est refusée),
  restauration par le même script.
- **Restauration réelle** : étape 6 du pas-à-pas (`deploiement/LISEZMOI.md`),
  en plus du test automatique.
- **Déploiement** : `git archive` du commit de `main` (jamais l'arbre de
  travail), refus d'une autre branche ou de modifications non commitées,
  liste de refus élargie (`*.env`, `*.sqlite`, `*-wal`), bascule seulement
  d'une extraction complète. Le transfert de la base s'appelle « transfert »
  (« migration » reste réservé au schéma) et se fait avant le premier
  déploiement.
- Conteneur durci : système de fichiers en lecture seule, aucune capacité,
  `no-new-privileges` ; `.dockerignore` pour une construction locale.
- Les barres d'allocation sont en SVG (repère de cible conservé), la jauge
  financier/immobilier en `<progress>`.

## Seams testés (bloquants, jeux synthétiques)

| Seam | Comportement garanti |
|---|---|
| S-L3-1 | Sans session : toute page répond 303 vers `/connexion` sauf la page de connexion et les statiques ; mauvaise phrase = 401, 5 échecs = 429 pendant 10 min ; bonne phrase = cookie signé, HttpOnly, SameSite=Strict, 30 jours ; cookie altéré = refus |
| S-L3-2 | Identité Tailscale : en-tête absent ou autre compte = 403 avant la page de connexion ; le mode local (sans `PATRIMOINE_UTILISATEUR`) n'exige rien de plus |
| S-L3-3 | La configuration refuse de démarrer en mode public sans empreinte de phrase, sans secret de session ou sans utilisateur ; l'empreinte scrypt se vérifie et ne se renverse pas |
| S-L3-4 | Sauvegarde : le fichier produit se déchiffre avec la phrase et s'ouvre en SQLite avec les mêmes tables et le même nombre de lignes ; une mauvaise phrase échoue bruyamment |
| S-L3-5 | Limite de recherche : la 11e recherche dans la minute répond 429 sans appel sortant |
| S-L3-6 | Le script de déploiement n'envoie que des fichiers suivis par git : jamais `.env`, `.mcp.json`, `*.db` (test sur un dépôt jetable) |

## Préalables à la main (Emmanuel, console Tailscale et iPhone)

- Mesuré le 23/10 : le tailnet n'a **pas de certificats HTTPS** activés
  (`CertDomains: None`) et **l'iPhone n'y est pas encore** (pairs : le Mac,
  le PC de Théo, M5_Ultra). Avant la mise en service : activer « HTTPS
  Certificates » dans la console Tailscale (une case, DNS → HTTPS), installer
  Tailscale sur l'iPhone avec le même compte. Sans HTTPS, le cookie ne peut
  pas être `Secure` : l'outil refusera de démarrer en mode public tant que
  le relais ne dit pas `X-Forwarded-Proto: https`.

## Hors lot 3, explicitement

- Plusieurs utilisateurs, rôles, partage : jamais (usage personnel).
- Exposition hors tailnet (DNS public, reverse proxy Internet).
- Application iPhone native ; une page web suffit (ajout à l'écran d'accueil).
- Sauvegarde hors du VPS et du Mac (cloud tiers) : le rapatriement existant
  suffit.

## Livraison

- Fichiers : `serveur/session.mjs` (empreinte, cookie, essais), route
  `/connexion` + `/deconnexion`, `serveur/config.mjs` (mode public),
  `scripts/deployer-vps.sh`, `scripts/transferer-base-vps.sh`,
  `scripts/sauvegarder.mjs` (copie cohérente + chiffrement),
  `deploiement/Dockerfile` + `compose.yml` + `patrimoine.env.exemple`
  (modèle sans valeur), passe CSS, CONTEXT.md, fiche v6.
- Pas-à-pas pour Emmanuel : créer les deux fichiers d'environnement sur le
  VPS (phrase, secret, utilisateur, clé Anthropic), lancer le déploiement,
  migrer la base, retirer l'agent du Mac, noter la phrase de sauvegarde dans
  son gestionnaire, ajouter la page à l'écran d'accueil de l'iPhone.
