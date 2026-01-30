# Belote Suresnes — Gestion des joueurs

Projet **Node.js / Express / Postgres** avec un front **HTML/CSS/JS vanilla**.

## Arborescence

```
./backend
  ├─ package.json
  ├─ server.js
  ├─ db.js
  └─ routes/players.js
./frontend
  └─ index.html
```

## Prérequis

- Node.js >= 18

## Installation & lancement

### 1) Backend

```bash
cd backend
npm install
npm start
```

L'API démarre sur `http://localhost:3000`.

### 2) Frontend

Ouvrir directement `frontend/index.html` dans votre navigateur.

> Optionnel : pour un serveur statique local
> ```bash
> cd frontend
> npx serve .
> ```

## API REST

Format de réponse :

```json
{
  "success": true,
  "data": {}
}
```

En cas d'erreur :

```json
{
  "success": false,
  "error": { "message": "...", "details": "..." }
}
```

### Endpoints

- `GET /api/players`
- `GET /api/players/:id`
- `GET /api/players/stats?q=marie`
- `POST /api/players`
- `PUT /api/players/:id`
- `DELETE /api/players/:id`

#### KPI

- `GET /api/kpis`

#### Parties (matches)

- `GET /api/matches`
- `GET /api/matches/played?limit=10&offset=0&player_id=2`
- `GET /api/matches/:id`
- `POST /api/matches`
- `PUT /api/matches/:id`
- `DELETE /api/matches/:id`
- `POST /api/matches/:id/rounds`
- `DELETE /api/matches/:id/rounds`

#### Joueurs (statistiques)

- `GET /api/players/stats`

Paramètres :

- `q` : recherche (prénom, nom, email)

### Exemple de payload (POST/PUT)

```json
{
  "first_name": "Jean",
  "last_name": "Dupont",
  "email": "jean.dupont@example.com",
  "phone": "0601020304"
}
```

### Exemple de réponse (GET /api/kpis)

```json
{
  "success": true,
  "data": {
    "totals": {
      "matches": 24,
      "rounds": 72
    },
    "matchesByMonth": [
      { "month": "2025-01", "total_matches": 4 },
      { "month": "2025-02", "total_matches": 6 }
    ],
    "topWinners": [
      {
        "player": { "id": 3, "first_name": "Alice", "last_name": "Martin" },
        "wins": 7
      }
    ],
    "topScorer": {
      "player": { "id": 5, "first_name": "Jean", "last_name": "Dupont" },
      "points": 3420
    }
  }
}

### Exemple de réponse (GET /api/players/stats)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 5,
        "first_name": "Jean",
        "last_name": "Dupont",
        "email": "jean.dupont@example.com",
        "phone": "0601020304",
        "stats": {
          "playedMatches": 12,
          "wins": 7,
          "winRate": 58,
          "avgRoundPoints": 86.5,
          "recentForm": ["W", "L", "W"]
        }
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 50,
      "offset": 0
    }
  }
}
```
```

## Base de données (Supabase Postgres + Render)

### 1) Création du schéma (Supabase)

Dans Supabase > SQL Editor, exécuter le script :

```sql
-- fichier: backend/data/schema.postgres.sql
```

### 2) Importer les données SQLite vers Postgres (optionnel)

```bash
cd backend
DATABASE_URL="postgresql://..." SQLITE_PATH="./data/belote.db" node ./data/import-sqlite-to-postgres.js
```

### 3) Variables d'environnement backend

- `DATABASE_URL` : URL Postgres Supabase
- `PORT` : port d'écoute (Render fournit `PORT` automatiquement)

### 4) Déploiement Render (backend)

1. Créer un **Web Service** Render.
2. Root Directory : `backend`.
3. Build Command : `npm install`.
4. Start Command : `npm start`.
5. Ajouter la variable `DATABASE_URL` (Supabase).
6. Déployer.

### 5) Frontend

Mettre à jour les URLs API dans `frontend/index.html` si besoin (API Render).
