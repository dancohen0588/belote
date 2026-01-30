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

router.get('/', async (req, res) => {
  const totalsSql = `
    SELECT
      COUNT(*) AS matches,
      COALESCE(SUM(rounds_played), 0) AS rounds
    FROM matches
    WHERE status = 'played' OR rounds_played > 0
  `;

  const matchesByMonthSql = `
    SELECT
      TO_CHAR(played_at, 'YYYY-MM') AS month,
      COUNT(*) AS total_matches
    FROM matches
    WHERE status = 'played' OR rounds_played > 0
    GROUP BY TO_CHAR(played_at, 'YYYY-MM')
    ORDER BY month ASC
  `;

  const topWinnersSql = `
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
      WHERE m.status = 'played' OR m.rounds_played > 0
      GROUP BY m.id
    ),
    winners AS (
      SELECT
        id AS match_id,
        CASE
          WHEN rounds_won_a > rounds_won_b THEN 'A'
          WHEN rounds_won_b > rounds_won_a THEN 'B'
          ELSE 'T'
        END AS winner,
        team1_player1_id,
        team1_player2_id,
        team2_player1_id,
        team2_player2_id
      FROM match_scores
    ),
    winner_players AS (
      SELECT team1_player1_id AS player_id FROM winners WHERE winner = 'A'
      UNION ALL
      SELECT team1_player2_id AS player_id FROM winners WHERE winner = 'A'
      UNION ALL
      SELECT team2_player1_id AS player_id FROM winners WHERE winner = 'B'
      UNION ALL
      SELECT team2_player2_id AS player_id FROM winners WHERE winner = 'B'
    )
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      COUNT(*) AS wins
    FROM winner_players wp
    JOIN players p ON p.id = wp.player_id
    GROUP BY p.id
    ORDER BY wins DESC, p.last_name ASC
    LIMIT 3
  `;

  const topScorerSql = `
    WITH match_scores AS (
      SELECT
        m.id,
        m.team1_player1_id,
        m.team1_player2_id,
        m.team2_player1_id,
        m.team2_player2_id,
        COALESCE(SUM(r.team1_score), 0) AS score_team1,
        COALESCE(SUM(r.team2_score), 0) AS score_team2
      FROM matches m
      LEFT JOIN match_rounds r ON r.match_id = m.id
      WHERE m.status = 'played' OR m.rounds_played > 0
      GROUP BY m.id
    ),
    player_scores AS (
      SELECT team1_player1_id AS player_id, score_team1 AS points FROM match_scores
      UNION ALL
      SELECT team1_player2_id AS player_id, score_team1 AS points FROM match_scores
      UNION ALL
      SELECT team2_player1_id AS player_id, score_team2 AS points FROM match_scores
      UNION ALL
      SELECT team2_player2_id AS player_id, score_team2 AS points FROM match_scores
    )
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      SUM(ps.points) AS total_points
    FROM player_scores ps
    JOIN players p ON p.id = ps.player_id
    GROUP BY p.id
    ORDER BY total_points DESC, p.last_name ASC
    LIMIT 1
  `;

  try {
    const [totalsResult, matchesByMonthResult, topWinnersResult, topScorerResult] = await Promise.all([
      db.query(totalsSql),
      db.query(matchesByMonthSql),
      db.query(topWinnersSql),
      db.query(topScorerSql)
    ]);

    const totalsRow = totalsResult.rows?.[0] || {};
    const totals = {
      matches: Number(totalsRow.matches) || 0,
      rounds: Number(totalsRow.rounds) || 0
    };

    const matchesByMonth = (matchesByMonthResult.rows || []).map(row => ({
      month: row.month,
      total_matches: Number(row.total_matches) || 0
    }));

    const topWinners = (topWinnersResult.rows || []).map(row => ({
      player: {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name
      },
      wins: Number(row.wins) || 0
    }));

    const scorerRow = topScorerResult.rows?.[0];
    const topScorer = scorerRow
      ? {
          player: {
            id: scorerRow.id,
            first_name: scorerRow.first_name,
            last_name: scorerRow.last_name
          },
          points: Number(scorerRow.total_points) || 0
        }
      : null;

    return sendSuccess(res, {
      totals,
      matchesByMonth,
      topWinners,
      topScorer
    });
  } catch (error) {
    return sendError(res, 500, 'Erreur lors du chargement des KPIs.', error.message);
  }
});

module.exports = router;
