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

### Exemple de payload (POST/PUT)

```json
{
  "first_name": "Jean",
  "last_name": "Dupont",
  "email": "jean.dupont@example.com",
  "phone": "0601020304"
}
```

## Base de données

SQLite locale : `backend/belote.db`.
La table `players` est auto-créée au démarrage si elle n'existe pas.
