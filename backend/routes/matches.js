const express = require('express');
const db = require('../db');

const router = express.Router();

function sendSuccess(res, data) {
  return res.json({ success: true, data });
}

function sendError(res, status, message, details) {
  return res.status(status).json({
    success: false,
    error: { message, details }
  });
}

function normalizeMatchRow(row) {
  return {
    ...row,
    team1: {
      p1: { id: row.team1_player1_id, name: row.team1_player1_name },
      p2: { id: row.team1_player2_id, name: row.team1_player2_name }
    },
    team2: {
      p1: { id: row.team2_player1_id, name: row.team2_player1_name },
      p2: { id: row.team2_player2_id, name: row.team2_player2_name }
    }
  };
}

function isValidDateTime(value) {
  if (!value || typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function parsePlayerIds(body) {
  const team1 = body.team1 || {};
  const team2 = body.team2 || {};

  const ids = {
    team1_player1_id: Number(team1.p1),
    team1_player2_id: Number(team1.p2),
    team2_player1_id: Number(team2.p1),
    team2_player2_id: Number(team2.p2)
  };

  const allIds = Object.values(ids);
  if (allIds.some(id => !Number.isInteger(id))) {
    return { error: 'Chaque joueur doit être sélectionné.' };
  }

  const uniqueIds = new Set(allIds);
  if (uniqueIds.size !== 4) {
    return { error: 'Un joueur ne peut pas apparaître deux fois dans la même partie.' };
  }

  if (ids.team1_player1_id === ids.team1_player2_id) {
    return { error: 'Les joueurs de l’équipe 1 doivent être différents.' };
  }

  if (ids.team2_player1_id === ids.team2_player2_id) {
    return { error: 'Les joueurs de l’équipe 2 doivent être différents.' };
  }

  return { ids };
}

function validateMatchPayload(body) {
  const playedAt = (body.played_at || '').trim();
  const location = (body.location || '').trim();

  if (!playedAt || !isValidDateTime(playedAt)) {
    return { error: 'La date/heure est invalide.' };
  }

  if (!location) {
    return { error: 'Le lieu est obligatoire.' };
  }

  const { error, ids } = parsePlayerIds(body);
  if (error) return { error };

  return { playedAt, location, ids };
}

function validateRoundsPayload(body) {
  const rounds = Array.isArray(body.rounds) ? body.rounds : [];
  if (rounds.length < 1) {
    return { error: 'Veuillez saisir au moins une manche.' };
  }

  const indexes = rounds.map(r => Number(r.round_index));
  const scoresTeam1 = rounds.map(r => Number(r.team1_score));
  const scoresTeam2 = rounds.map(r => Number(r.team2_score));

  if (indexes.some(i => !Number.isInteger(i))) {
    return { error: 'Les indices de manche doivent être des entiers.' };
  }

  if (scoresTeam1.some(s => !Number.isInteger(s) || s < 0) || scoresTeam2.some(s => !Number.isInteger(s) || s < 0)) {
    return { error: 'Les scores doivent être des entiers positifs.' };
  }

  const maxIndex = Math.max(...indexes);
  for (let i = 1; i <= maxIndex; i += 1) {
    if (!indexes.includes(i)) {
      return { error: 'Les manches doivent être numérotées séquentiellement à partir de 1.' };
    }
  }

  if (indexes.length !== maxIndex) {
    return { error: 'Le nombre de manches ne correspond pas aux indices fournis.' };
  }

  const normalizedRounds = indexes
    .map((index, idx) => ({
      round_index: index,
      team1_score: scoresTeam1[idx],
      team2_score: scoresTeam2[idx]
    }))
    .sort((a, b) => a.round_index - b.round_index);

  return { rounds: normalizedRounds };
}

router.get('/', (req, res) => {
  const sql = `
    SELECT
      m.*, 
      p1.first_name || ' ' || p1.last_name AS team1_player1_name,
      p2.first_name || ' ' || p2.last_name AS team1_player2_name,
      p3.first_name || ' ' || p3.last_name AS team2_player1_name,
      p4.first_name || ' ' || p4.last_name AS team2_player2_name
    FROM matches m
    JOIN players p1 ON p1.id = m.team1_player1_id
    JOIN players p2 ON p2.id = m.team1_player2_id
    JOIN players p3 ON p3.id = m.team2_player1_id
    JOIN players p4 ON p4.id = m.team2_player2_id
    ORDER BY datetime(m.played_at) DESC, m.created_at DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la récupération des parties.', err.message);
    }
    return sendSuccess(res, rows.map(normalizeMatchRow));
  });
});

router.get('/played', (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 10;
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const playerId = req.query.player_id ? Number.parseInt(req.query.player_id, 10) : null;

  if (!Number.isInteger(limit) || limit <= 0) {
    return sendError(res, 400, 'Le paramètre limit doit être un entier positif.');
  }

  if (!Number.isInteger(offset) || offset < 0) {
    return sendError(res, 400, 'Le paramètre offset doit être un entier positif ou nul.');
  }

  if (req.query.player_id && !Number.isInteger(playerId)) {
    return sendError(res, 400, 'Le paramètre player_id doit être un entier.');
  }

  const filterClause = playerId
    ? ` AND (
        m.team1_player1_id = ? OR m.team1_player2_id = ?
        OR m.team2_player1_id = ? OR m.team2_player2_id = ?
      )`
    : '';
  const filterParams = playerId ? [playerId, playerId, playerId, playerId] : [];

  const countSql = `
    SELECT COUNT(*) AS total
    FROM matches m
    WHERE (m.status = 'played' OR m.rounds_played > 0)
    ${filterClause}
  `;

  const dataSql = `
    SELECT
      m.id,
      m.played_at,
      m.location,
      m.team1_player1_id,
      m.team1_player2_id,
      m.team2_player1_id,
      m.team2_player2_id,
      p1.first_name AS team1_player1_first_name,
      p1.last_name AS team1_player1_last_name,
      p2.first_name AS team1_player2_first_name,
      p2.last_name AS team1_player2_last_name,
      p3.first_name AS team2_player1_first_name,
      p3.last_name AS team2_player1_last_name,
      p4.first_name AS team2_player2_first_name,
      p4.last_name AS team2_player2_last_name,
      COALESCE(SUM(r.team1_score), 0) AS score_a,
      COALESCE(SUM(r.team2_score), 0) AS score_b,
      COALESCE(SUM(CASE WHEN r.team1_score > r.team2_score THEN 1 ELSE 0 END), 0) AS rounds_won_a,
      COALESCE(SUM(CASE WHEN r.team2_score > r.team1_score THEN 1 ELSE 0 END), 0) AS rounds_won_b,
      COALESCE(SUM(CASE WHEN r.team1_score = r.team2_score THEN 1 ELSE 0 END), 0) AS rounds_tied,
      COUNT(r.id) AS rounds_played
    FROM matches m
    JOIN players p1 ON p1.id = m.team1_player1_id
    JOIN players p2 ON p2.id = m.team1_player2_id
    JOIN players p3 ON p3.id = m.team2_player1_id
    JOIN players p4 ON p4.id = m.team2_player2_id
    LEFT JOIN match_rounds r ON r.match_id = m.id
    WHERE (m.status = 'played' OR m.rounds_played > 0)
    ${filterClause}
    GROUP BY m.id
    ORDER BY datetime(m.played_at) DESC, m.created_at DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countSql, filterParams, (countErr, countRow) => {
    if (countErr) {
      return sendError(res, 500, 'Erreur lors du comptage des parties jouées.', countErr.message);
    }

    const total = countRow ? countRow.total : 0;

    db.all(dataSql, [...filterParams, limit, offset], (err, rows) => {
      if (err) {
        return sendError(res, 500, 'Erreur lors de la récupération des parties jouées.', err.message);
      }

      const items = rows.map(row => {
        const teamA = {
          p1: {
            id: row.team1_player1_id,
            first_name: row.team1_player1_first_name,
            last_name: row.team1_player1_last_name
          },
          p2: {
            id: row.team1_player2_id,
            first_name: row.team1_player2_first_name,
            last_name: row.team1_player2_last_name
          }
        };
        const teamB = {
          p1: {
            id: row.team2_player1_id,
            first_name: row.team2_player1_first_name,
            last_name: row.team2_player1_last_name
          },
          p2: {
            id: row.team2_player2_id,
            first_name: row.team2_player2_first_name,
            last_name: row.team2_player2_last_name
          }
        };

        const roundsWonA = Number(row.rounds_won_a) || 0;
        const roundsWonB = Number(row.rounds_won_b) || 0;
        let winner = 'TIE';
        if (roundsWonA > roundsWonB) winner = 'A';
        if (roundsWonB > roundsWonA) winner = 'B';

        return {
          id: row.id,
          played_at: row.played_at,
          location: row.location,
          teamA,
          teamB,
          totals: {
            scoreA: Number(row.score_a) || 0,
            scoreB: Number(row.score_b) || 0
          },
          rounds: {
            played: Number(row.rounds_played) || 0,
            wonA: roundsWonA,
            wonB: roundsWonB,
            tied: Number(row.rounds_tied) || 0
          },
          winner
        };
      });

      return sendSuccess(res, {
        items,
        pagination: {
          limit,
          offset,
          total
        }
      });
    });
  });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  const sql = `
    SELECT
      m.*, 
      p1.first_name || ' ' || p1.last_name AS team1_player1_name,
      p2.first_name || ' ' || p2.last_name AS team1_player2_name,
      p3.first_name || ' ' || p3.last_name AS team2_player1_name,
      p4.first_name || ' ' || p4.last_name AS team2_player2_name
    FROM matches m
    JOIN players p1 ON p1.id = m.team1_player1_id
    JOIN players p2 ON p2.id = m.team1_player2_id
    JOIN players p3 ON p3.id = m.team2_player1_id
    JOIN players p4 ON p4.id = m.team2_player2_id
    WHERE m.id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la récupération de la partie.', err.message);
    }
    if (!row) {
      return sendError(res, 404, 'Partie introuvable.');
    }

    db.all('SELECT * FROM match_rounds WHERE match_id = ? ORDER BY round_index ASC', [id], (roundErr, rounds) => {
      if (roundErr) {
        return sendError(res, 500, 'Erreur lors de la récupération des manches.', roundErr.message);
      }

      return sendSuccess(res, {
        ...normalizeMatchRow(row),
        rounds
      });
    });
  });
});

router.post('/', (req, res) => {
  const { error, playedAt, location, ids } = validateMatchPayload(req.body);
  if (error) {
    return sendError(res, 400, error);
  }

  const sql = `
    INSERT INTO matches (
      played_at,
      location,
      team1_player1_id,
      team1_player2_id,
      team2_player1_id,
      team2_player2_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;
  const params = [
    playedAt,
    location,
    ids.team1_player1_id,
    ids.team1_player2_id,
    ids.team2_player1_id,
    ids.team2_player2_id
  ];

  db.run(sql, params, function onInsert(err) {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la création de la partie.', err.message);
    }

    db.get('SELECT * FROM matches WHERE id = ?', [this.lastID], (getErr, row) => {
      if (getErr) {
        return sendError(res, 500, 'Erreur lors de la récupération de la partie créée.', getErr.message);
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

  const { error, playedAt, location, ids } = validateMatchPayload(req.body);
  if (error) {
    return sendError(res, 400, error);
  }

  db.get('SELECT rounds_played, status FROM matches WHERE id = ?', [id], (err, matchRow) => {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la récupération de la partie.', err.message);
    }
    if (!matchRow) {
      return sendError(res, 404, 'Partie introuvable.');
    }

    const sql = `
      UPDATE matches
      SET played_at = ?,
          location = ?,
          team1_player1_id = ?,
          team1_player2_id = ?,
          team2_player1_id = ?,
          team2_player2_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const params = [
      playedAt,
      location,
      ids.team1_player1_id,
      ids.team1_player2_id,
      ids.team2_player1_id,
      ids.team2_player2_id,
      id
    ];

    db.run(sql, params, function onUpdate(updateErr) {
      if (updateErr) {
        return sendError(res, 500, 'Erreur lors de la mise à jour de la partie.', updateErr.message);
      }

      if (this.changes === 0) {
        return sendError(res, 404, 'Partie introuvable.');
      }

      db.get('SELECT * FROM matches WHERE id = ?', [id], (getErr, row) => {
        if (getErr) {
          return sendError(res, 500, 'Erreur lors de la récupération de la partie.', getErr.message);
        }
        return sendSuccess(res, row);
      });
    });
  });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  db.run('DELETE FROM matches WHERE id = ?', [id], function onDelete(err) {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la suppression de la partie.', err.message);
    }
    if (this.changes === 0) {
      return sendError(res, 404, 'Partie introuvable.');
    }
    return sendSuccess(res, { id });
  });
});

router.post('/:id/rounds', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  const { error, rounds } = validateRoundsPayload(req.body);
  if (error) {
    return sendError(res, 400, error);
  }

  db.get('SELECT id FROM matches WHERE id = ?', [id], (err, row) => {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la récupération de la partie.', err.message);
    }
    if (!row) {
      return sendError(res, 404, 'Partie introuvable.');
    }

    db.serialize(() => {
      db.run('DELETE FROM match_rounds WHERE match_id = ?', [id]);

      const insertSql = `
        INSERT INTO match_rounds (match_id, round_index, team1_score, team2_score)
        VALUES (?, ?, ?, ?)
      `;

      rounds.forEach(round => {
        db.run(insertSql, [id, round.round_index, round.team1_score, round.team2_score]);
      });

      db.run(
        `UPDATE matches
         SET rounds_played = ?, status = 'played', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [rounds.length, id],
        function onUpdate(updateErr) {
          if (updateErr) {
            return sendError(res, 500, 'Erreur lors de la mise à jour de la partie.', updateErr.message);
          }

          db.all('SELECT * FROM match_rounds WHERE match_id = ? ORDER BY round_index ASC', [id], (roundErr, rows) => {
            if (roundErr) {
              return sendError(res, 500, 'Erreur lors de la récupération des manches.', roundErr.message);
            }
            return sendSuccess(res, { match_id: id, rounds: rows });
          });
        }
      );
    });
  });
});

router.delete('/:id/rounds', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  db.get('SELECT id FROM matches WHERE id = ?', [id], (err, row) => {
    if (err) {
      return sendError(res, 500, 'Erreur lors de la récupération de la partie.', err.message);
    }
    if (!row) {
      return sendError(res, 404, 'Partie introuvable.');
    }

    db.serialize(() => {
      db.run('DELETE FROM match_rounds WHERE match_id = ?', [id]);
      db.run(
        `UPDATE matches
         SET rounds_played = 0, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id],
        function onUpdate(updateErr) {
          if (updateErr) {
            return sendError(res, 500, 'Erreur lors de la mise à jour de la partie.', updateErr.message);
          }
          return sendSuccess(res, { match_id: id, rounds: [] });
        }
      );
    });
  });
});

module.exports = router;
