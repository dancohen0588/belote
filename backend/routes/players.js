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

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM players ORDER BY created_at DESC');
    return sendSuccess(res, result.rows);
  } catch (error) {
    return sendError(res, 500, 'Erreur lors de la récupération des joueurs.', error.message);
  }
});

router.get('/stats', async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10);
  const offset = Number.parseInt(req.query.offset, 10);
  const query = (req.query.q || '').trim();
  const sort = (req.query.sort || 'lastName').trim();
  const order = req.query.order === 'asc' ? 'asc' : 'desc';

  const whereParams = [];
  let whereClause = '';

  if (query) {
    whereClause = 'WHERE first_name ILIKE $1 OR last_name ILIKE $2 OR email ILIKE $3';
    const like = `%${query}%`;
    whereParams.push(like, like, like);
  }

  const countSql = `SELECT COUNT(*) AS total FROM players ${whereClause}`;
  const playersSql = `
    SELECT *
    FROM players
    ${whereClause}
    ORDER BY last_name ASC, first_name ASC
  `;

  try {
    const countResult = await db.query(countSql, whereParams);
    const totalCount = Number(countResult.rows?.[0]?.total || 0);

    const playersResult = await db.query(playersSql, whereParams);
    const playersRows = playersResult.rows || [];

    if (!playersRows.length) {
      return sendSuccess(res, {
        items: [],
        pagination: {
          limit: Number.isInteger(limit) && limit > 0 ? limit : 0,
          offset: Number.isInteger(offset) && offset >= 0 ? offset : 0,
          total: totalCount
        }
      });
    }

    const playerIds = playersRows.map(row => row.id);

    const statsSql = `
      WITH match_scores AS (
        SELECT
          m.id,
          m.played_at,
          m.team1_player1_id,
          m.team1_player2_id,
          m.team2_player1_id,
          m.team2_player2_id,
          COALESCE(SUM(r.team1_score), 0) AS score_team1,
          COALESCE(SUM(r.team2_score), 0) AS score_team2,
          COALESCE(SUM(CASE WHEN r.team1_score > r.team2_score THEN 1 ELSE 0 END), 0) AS rounds_won_a,
          COALESCE(SUM(CASE WHEN r.team2_score > r.team1_score THEN 1 ELSE 0 END), 0) AS rounds_won_b,
          COUNT(r.id) AS rounds_played
        FROM matches m
        LEFT JOIN match_rounds r ON r.match_id = m.id
        WHERE (m.status = 'played' OR m.rounds_played > 0)
        GROUP BY m.id
      ),
      player_match AS (
        SELECT id AS match_id, played_at, team1_player1_id AS player_id, 'A' AS team,
               score_team1, score_team2, rounds_won_a, rounds_won_b, rounds_played
        FROM match_scores
        UNION ALL
        SELECT id AS match_id, played_at, team1_player2_id AS player_id, 'A' AS team,
               score_team1, score_team2, rounds_won_a, rounds_won_b, rounds_played
        FROM match_scores
        UNION ALL
        SELECT id AS match_id, played_at, team2_player1_id AS player_id, 'B' AS team,
               score_team1, score_team2, rounds_won_a, rounds_won_b, rounds_played
        FROM match_scores
        UNION ALL
        SELECT id AS match_id, played_at, team2_player2_id AS player_id, 'B' AS team,
               score_team1, score_team2, rounds_won_a, rounds_won_b, rounds_played
        FROM match_scores
      ),
      player_stats AS (
        SELECT
          player_id,
          COUNT(*) AS played_matches,
          SUM(
            CASE
              WHEN team = 'A' AND rounds_won_a > rounds_won_b THEN 1
              WHEN team = 'B' AND rounds_won_b > rounds_won_a THEN 1
              ELSE 0
            END
          ) AS wins,
          SUM(CASE WHEN team = 'A' THEN score_team1 ELSE score_team2 END) AS total_points,
          SUM(rounds_played) AS total_rounds
        FROM player_match
        GROUP BY player_id
      )
      SELECT *
      FROM player_stats
      WHERE player_id = ANY($1)
    `;

    const recentFormSql = `
      WITH match_scores AS (
        SELECT
          m.id,
          m.played_at,
          m.team1_player1_id,
          m.team1_player2_id,
          m.team2_player1_id,
          m.team2_player2_id,
          COALESCE(SUM(CASE WHEN r.team1_score > r.team2_score THEN 1 ELSE 0 END), 0) AS rounds_won_a,
          COALESCE(SUM(CASE WHEN r.team2_score > r.team1_score THEN 1 ELSE 0 END), 0) AS rounds_won_b
        FROM matches m
        LEFT JOIN match_rounds r ON r.match_id = m.id
        WHERE (m.status = 'played' OR m.rounds_played > 0)
        GROUP BY m.id
      ),
      player_match AS (
        SELECT id AS match_id, played_at, team1_player1_id AS player_id, 'A' AS team,
               rounds_won_a, rounds_won_b
        FROM match_scores
        UNION ALL
        SELECT id AS match_id, played_at, team1_player2_id AS player_id, 'A' AS team,
               rounds_won_a, rounds_won_b
        FROM match_scores
        UNION ALL
        SELECT id AS match_id, played_at, team2_player1_id AS player_id, 'B' AS team,
               rounds_won_a, rounds_won_b
        FROM match_scores
        UNION ALL
        SELECT id AS match_id, played_at, team2_player2_id AS player_id, 'B' AS team,
               rounds_won_a, rounds_won_b
        FROM match_scores
      ),
      player_results AS (
        SELECT
          player_id,
          match_id,
          played_at,
          CASE
            WHEN team = 'A' AND rounds_won_a > rounds_won_b THEN 'W'
            WHEN team = 'B' AND rounds_won_b > rounds_won_a THEN 'W'
            WHEN team = 'A' AND rounds_won_a < rounds_won_b THEN 'L'
            WHEN team = 'B' AND rounds_won_b < rounds_won_a THEN 'L'
            ELSE 'T'
          END AS result
        FROM player_match
      ),
      ranked AS (
        SELECT
          player_id,
          result,
          played_at,
          ROW_NUMBER() OVER (
            PARTITION BY player_id
            ORDER BY played_at DESC, match_id DESC
          ) AS rn
        FROM player_results
      )
      SELECT player_id, result
      FROM ranked
      WHERE rn <= 5 AND player_id = ANY($1)
      ORDER BY player_id ASC, rn ASC
    `;

    const statsResult = await db.query(statsSql, [playerIds]);
    const formResult = await db.query(recentFormSql, [playerIds]);

    const statsRows = statsResult.rows || [];
    const formRows = formResult.rows || [];

    const statsMap = new Map((statsRows || []).map(row => [row.player_id, row]));
    const formMap = new Map();

    (formRows || []).forEach(row => {
      if (row.result === 'T') return;
      if (!formMap.has(row.player_id)) {
        formMap.set(row.player_id, []);
      }
      formMap.get(row.player_id).push(row.result);
    });

    const items = playersRows.map(player => {
      const stats = statsMap.get(player.id) || {};
      const playedMatches = Number(stats.played_matches) || 0;
      const wins = Number(stats.wins) || 0;
      const totalPoints = Number(stats.total_points) || 0;
      const totalRounds = Number(stats.total_rounds) || 0;
      const winRate = playedMatches > 0 ? Math.round((wins / playedMatches) * 100) : 0;
      const avgRoundPoints = totalRounds > 0 ? Number((totalPoints / totalRounds).toFixed(1)) : null;

      return {
        ...player,
        stats: {
          playedMatches,
          wins,
          winRate,
          avgRoundPoints,
          recentForm: formMap.get(player.id) || []
        }
      };
    });

    const getSortValue = (item) => {
      switch (sort) {
        case 'parties':
          return item.stats.playedMatches;
        case 'wins':
          return item.stats.wins;
        case 'winRate':
          return item.stats.winRate;
        case 'avgRoundPoints':
          return item.stats.avgRoundPoints;
        case 'lastName':
        default:
          return `${item.last_name || ''}`.toLowerCase();
      }
    };

    const normalizeNumber = (value) => {
      if (value === null || value === undefined) {
        return order === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      }
      return value;
    };

    items.sort((a, b) => {
      const valA = getSortValue(a);
      const valB = getSortValue(b);

      if (typeof valA === 'string' || typeof valB === 'string') {
        const strA = String(valA || '').toLowerCase();
        const strB = String(valB || '').toLowerCase();
        if (strA === strB) return 0;
        return order === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }

      const numA = normalizeNumber(valA);
      const numB = normalizeNumber(valB);
      if (numA === numB) return 0;
      return order === 'asc' ? numA - numB : numB - numA;
    });

    const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : items.length;
    const pagedItems = items.slice(safeOffset, safeOffset + safeLimit);

    return sendSuccess(res, {
      items: pagedItems,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        total: totalCount
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Erreur lors du chargement des statistiques joueurs.', error.message);
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  try {
    const result = await db.query('SELECT * FROM players WHERE id = $1', [id]);
    const row = result.rows?.[0];
    if (!row) {
      return sendError(res, 404, 'Joueur introuvable.');
    }
    return sendSuccess(res, row);
  } catch (error) {
    return sendError(res, 500, 'Erreur lors de la récupération du joueur.', error.message);
  }
});

router.post('/', async (req, res) => {
  const { error, firstName, lastName, email, phone } = validatePayload(req.body);
  if (error) {
    return sendError(res, 400, error);
  }

  const sql = `
    INSERT INTO players (first_name, last_name, email, phone)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const params = [firstName, lastName, email || null, phone || null];

  try {
    const result = await db.query(sql, params);
    return sendSuccess(res, result.rows?.[0]);
  } catch (error) {
    return sendError(res, 500, 'Erreur lors de la création du joueur.', error.message);
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  const { error, firstName, lastName, email, phone } = validatePayload(req.body);
  if (error) {
    return sendError(res, 400, error);
  }

  const sql = `
    UPDATE players
    SET first_name = $1, last_name = $2, email = $3, phone = $4, updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `;
  const params = [firstName, lastName, email || null, phone || null, id];

  try {
    const result = await db.query(sql, params);
    const row = result.rows?.[0];
    if (!row) {
      return sendError(res, 404, 'Joueur introuvable.');
    }
    return sendSuccess(res, row);
  } catch (error) {
    return sendError(res, 500, 'Erreur lors de la mise à jour du joueur.', error.message);
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, "L'id doit être un entier.");
  }

  try {
    const result = await db.query('DELETE FROM players WHERE id = $1 RETURNING id', [id]);
    const row = result.rows?.[0];
    if (!row) {
      return sendError(res, 404, 'Joueur introuvable.');
    }
    return sendSuccess(res, { id: row.id });
  } catch (error) {
    return sendError(res, 500, 'Erreur lors de la suppression du joueur.', error.message);
  }
});

module.exports = router;
