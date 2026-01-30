const express = require('express');
const db = require('../db');

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function sendSuccess(res, data) {
  return res.json({ success: true, data });
}

function sendError(res, status, message, details) {
  return res.status(status).json({
    success: false,
    error: { message, details }
  });
}

function validatePayload(body) {
  const firstName = (body.first_name || '').trim();
  const lastName = (body.last_name || '').trim();
  const email = body.email ? body.email.trim() : '';
  const phone = body.phone ? body.phone.trim() : '';

  if (!firstName || !lastName) {
    return { error: 'Le prénom et le nom sont obligatoires.' };
  }

  if (email && !emailRegex.test(email)) {
    return { error: "L'email n'est pas valide." };
  }

  return { firstName, lastName, email, phone };
}

router.get('/', (req, res) => {
  db.all('SELECT * FROM players ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la récupération des joueurs.', err.message);
    }
    return sendSuccess(res, rows);
  });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  db.get('SELECT * FROM players WHERE id = ?', [id], (err, row) => {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la récupération du joueur.', err.message);
    }
    if (!row) {
      return sendError(res, 404, 'Joueur introuvable.');
    }
    return sendSuccess(res, row);
  });
});

router.post('/', (req, res) => {
  const { error, firstName, lastName, email, phone } = validatePayload(req.body);
  if (error) {
    return sendError(res, 400, error);
  }

  const sql = 'INSERT INTO players (first_name, last_name, email, phone) VALUES (?, ?, ?, ?)';
  const params = [firstName, lastName, email || null, phone || null];

  db.run(sql, params, function onInsert(err) {
    if (err) {
      return sendError(res, 500, "Erreur lors de la création du joueur.", err.message);
    }

    db.get('SELECT * FROM players WHERE id = ?', [this.lastID], (getErr, row) => {
      if (getErr) {
        return sendError(res, 500, "Erreur lors de la récupération du joueur créé.", getErr.message);
      }
      return sendSuccess(res, row);
    });
  });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  const { error, firstName, lastName, email, phone } = validatePayload(req.body);
  if (error) {
    return sendError(res, 400, error);
  }

  const sql = `UPDATE players
               SET first_name = ?, last_name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  const params = [firstName, lastName, email || null, phone || null, id];

  db.run(sql, params, function onUpdate(err) {
    if (err) {
      return sendError(res, 500, "Erreur lors de la mise à jour du joueur.", err.message);
    }
    if (this.changes === 0) {
      return sendError(res, 404, 'Joueur introuvable.');
    }

    db.get('SELECT * FROM players WHERE id = ?', [id], (getErr, row) => {
      if (getErr) {
        return sendError(res, 500, "Erreur lors de la récupération du joueur mis à jour.", getErr.message);
      }
      return sendSuccess(res, row);
    });
  });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  db.run('DELETE FROM players WHERE id = ?', [id], function onDelete(err) {
    if (err) {
      return sendError(res, 500, "Erreur lors de la suppression du joueur.", err.message);
    }
    if (this.changes === 0) {
      return sendError(res, 404, 'Joueur introuvable.');
    }
    return sendSuccess(res, { id });
  });
});

module.exports = router;
