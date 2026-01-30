# Belote Suresnes — Gestion des joueurs

Projet local **Node.js / Express / SQLite** avec un front **HTML/CSS/JS vanilla**.

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
      "players": 12,
      "matches": 24,
      "points": 18940
    },
    "matchesByMonth": [
      { "month": "01/2025", "total_matches": 4 },
      { "month": "02/2025", "total_matches": 6 }
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
```

## Base de données

SQLite locale : `backend/belote.db`.
Les tables `players`, `matches` et `match_rounds` sont auto-créées au démarrage si elles n'existent pas.
