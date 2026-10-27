# Application de gestion de restaurant — Backend

API multi-restaurant pour piloter un établissement au quotidien : menu, stock,
caisse, ventes (y compris à crédit), dépenses et personnel. Devise : franc
guinéen (GNF).

Réalisation du [cahier des charges](Cahier_des_charges_App_Restaurant.md), dans
l'ordre prévu au §12 : base de données, puis backend, puis conteneur Docker.
Le design de l'application mobile Expo viendra ensuite, une fois le backend
stabilisé.

**État : backend complet et fonctionnel.** 257 vérifications de bout en bout
passent sur les conteneurs Docker (`npm run smoke`).

---

## Organisation du dépôt

```
app restaurant/
├── Cahier_des_charges_App_Restaurant.md
├── Dockerfile                    # image de production (contexte = racine)
├── docker-compose.yml            # PostgreSQL + API en local
├── render.yaml                   # déploiement Render
├── .env.example                  # variables de docker-compose
├── API.md                        # référence des routes
│
├── database/
│   ├── README.md                 # schéma et garanties de la base
│   └── migrations/               # 22 migrations SQL versionnées
│
└── backend/
    ├── scripts/smoke-test.ts     # test de bout en bout
    └── src/
        ├── index.ts              # démarrage, migrations, arrêt propre
        ├── app.ts                # middlewares Express
        ├── config/               # env, logger
        ├── core/                 # erreurs, validation, pagination, SQL
        ├── db/                   # pool, transactions, migrations, seed
        ├── middlewares/          # auth, erreurs, limitation de débit
        ├── routes/               # assemblage des modules
        └── modules/              # un dossier par module du cahier des charges
            ├── auth/         superadmin/   restaurant/  users/
            ├── staff/        menu/         stock/       cash/
            ├── sales/        customers/    credits/     expenses/
            └── dashboard/    media/
```

Chaque module suit le même découpage : `*.schemas.ts` (validation des entrées),
`*.service.ts` (logique métier et SQL), `*.controller.ts` (HTTP), `*.routes.ts`.

---

## Démarrage en local

```bash
cp .env.example .env          # ajustez JWT_SECRET et le mot de passe Super Admin
docker compose up -d --build
```

L'API écoute sur `http://localhost:4000`, PostgreSQL sur `localhost:5436`.
Les migrations s'appliquent automatiquement au démarrage du conteneur.

Créez ensuite le compte Super Admin (valeurs lues dans `.env`) :

```bash
docker compose exec api node dist/db/seed.js
```

Vérifiez que tout fonctionne :

```bash
curl http://localhost:4000/health
cd backend && npm install && npm run smoke
```

### Commandes utiles

```bash
docker compose logs -f api                        # journaux
docker compose exec db psql -U restaurant -d restaurant   # console SQL
docker compose down                               # arrêter
docker compose down -v                            # arrêter et effacer les données
```

### Développer le backend hors Docker

```bash
docker compose up -d db          # la base seule dans Docker
cd backend
cp .env.example .env
npm install
npm run dev                      # rechargement à chaud
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Compilation TypeScript |
| `npm run migrate` | Appliquer les migrations |
| `npm run seed` | Créer / mettre à jour le Super Admin |
| `npm run typecheck` | Vérification des types |
| `npm run smoke` | Test de bout en bout |

---

## Parcours d'un restaurant

1. Le gérant crée son espace — `POST /api/auth/register`. Le restaurant est en
   statut `pending` et **ne peut pas se connecter**.
2. L'éditeur voit la demande — `GET /api/super-admin/restaurants?status=pending`
   — et l'active après paiement ou vérification.
3. Le gérant se connecte, règle ses paramètres, saisit son menu, son stock et
   son personnel.
4. Il crée les comptes de ses collègues avec un rôle : gérant, caissier ou
   magasinier. Les actions sensibles sont inscrites au journal d'activité.
5. À tout moment, l'éditeur peut suspendre le compte : les sessions ouvertes
   sont coupées immédiatement.

La référence complète des routes est dans [API.md](API.md).

---

## Choix techniques

**Node 24, TypeScript strict, Express 5, PostgreSQL 17 en SQL natif.** Pas
d'ORM : les requêtes restent lisibles et les contraintes d'intégrité vivent
dans la base plutôt que dans le code.

**La caisse est un grand livre.** Toute entrée et toute sortie d'argent est une
ligne de `cash_movements` ; le solde est maintenu par un trigger PostgreSQL.
Une vente, une dépense ou un remboursement et son mouvement de caisse sont
écrits dans la même transaction : il est impossible qu'une vente soit
enregistrée sans que la caisse bouge, ou l'inverse.

**Rien n'est effacé.** Une annulation écrit un mouvement inverse. Un plat déjà
vendu est archivé, pas supprimé. Les lignes de vente figent le nom et le prix
du plat pour que les tickets passés restent exacts.

**L'isolation multi-restaurant est garantie par la base.** Le `restaurant_id`
vient toujours du jeton vérifié, jamais du corps de la requête ; et les clés
étrangères composites `(id, restaurant_id)` empêchent au niveau PostgreSQL
qu'une donnée d'un restaurant soit rattachée à un autre. Détails dans
[database/README.md](database/README.md).

**Les images sont stockées en base.** Le disque de Render est éphémère ; les
photos sont donc conservées dans la table `media` et servies par
`/api/media/:id`, sans dépendance à un stockage objet externe. Le type réel est
vérifié à partir de la signature binaire du fichier.

**Sécurité.** Mots de passe hachés avec bcrypt (12 tours), jetons d'accès
courts + refresh tokens à usage unique dont seul le hash est stocké,
limitation de débit sur les routes d'authentification, en-têtes Helmet,
validation systématique des entrées avec Zod, et messages de connexion
identiques que l'e-mail existe ou non.

---

## Déploiement sur Render

Le dépôt contient un Blueprint prêt à l'emploi. La base PostgreSQL est
hébergée chez **Neon** : la base gratuite de Render est supprimée au bout de
30 jours, celle de Neon n'expire pas.

1. Sur Neon : créer un projet (Postgres 17, région **AWS Europe Central 1 —
   Frankfurt**, la même que l'API) et copier l'adresse de connexion
   **directe** — celle qui ne contient pas `-pooler`.
2. Sur Render : **New → Blueprint**, sélectionner le dépôt. `render.yaml` crée
   le service API et la version web, et génère `JWT_SECRET` automatiquement.
3. Renseigner `DATABASE_URL` (l'adresse Neon), `SEED_SUPERADMIN_EMAIL` et
   `SEED_SUPERADMIN_PASSWORD` dans les variables d'environnement du service,
   puis **Apply**.
4. Une fois l'application mobile publiée, remplacer `CORS_ORIGINS=*` par les
   origines réelles.

Aucune commande manuelle n'est nécessaire. Au démarrage, le conteneur :

- applique les migrations en attente (`AUTO_MIGRATE=true`) — il embarque ses
  propres fichiers SQL ;
- crée le compte Super Admin, ou met à jour son mot de passe si les variables
  ont changé.

Ce choix est volontaire : le plan gratuit de Render n'offre pas d'accès shell,
il serait donc impossible d'initialiser le compte autrement.

Vérifier ensuite que le service répond :

```bash
curl https://<votre-service>.onrender.com/health
```

> Le plan gratuit met le service en veille après inactivité : la première
> requête après une pause peut prendre une trentaine de secondes. Neon met
> aussi sa base en veille : la toute première requête peut prendre une
> seconde de plus.

---

## Suite

Le backend étant complet et stabilisé, l'étape suivante est l'application
mobile **Expo SDK 54** : écrans de prise de commande et d'encaissement pensés
pour un usage rapide au quotidien, puis le travail de design (§11).
