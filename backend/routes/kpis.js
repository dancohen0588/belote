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

function normalizeMonthLabel(value) {
  if (!value) return null;
  const [year, month] = value.split('-');
  if (!year || !month) return value;
  return `${month}/${year}`;
}

router.get('/', (req, res) => {
  const totalPlayersSql = 'SELECT COUNT(*) AS total_players FROM players';
  const totalMatchesSql = "SELECT COUNT(*) AS total_matches FROM matches WHERE status = 'played' OR rounds_played > 0";
  const totalPointsSql = 'SELECT COALESCE(SUM(team1_score + team2_score), 0) AS total_points FROM match_rounds';
  const matchesByMonthSql = `
    SELECT
      strftime('%Y-%m', played_at) AS month,
      COUNT(*) AS total_matches
    FROM matches
    WHERE status = 'played' OR rounds_played > 0
    GROUP BY strftime('%Y-%m', played_at)
    ORDER BY strftime('%Y-%m', played_at) ASC
  `;
  const winnersSql = `
    WITH match_winners AS (
      SELECT
        m.id AS match_id,
        CASE
          WHEN SUM(CASE WHEN r.team1_score > r.team2_score THEN 1 ELSE 0 END)
             > SUM(CASE WHEN r.team2_score > r.team1_score THEN 1 ELSE 0 END) THEN 'A'
          WHEN SUM(CASE WHEN r.team2_score > r.team1_score THEN 1 ELSE 0 END)
             > SUM(CASE WHEN r.team1_score > r.team2_score THEN 1 ELSE 0 END) THEN 'B'
          ELSE 'T'
        END AS winner_team,
        m.team1_player1_id,
        m.team1_player2_id,
        m.team2_player1_id,
        m.team2_player2_id
      FROM matches m
      LEFT JOIN match_rounds r ON r.match_id = m.id
      WHERE m.status = 'played' OR m.rounds_played > 0
      GROUP BY m.id
    )
    SELECT
      p.id AS player_id,
      p.first_name,
      p.last_name,
      COUNT(*) AS wins
    FROM match_winners mw
    JOIN players p ON (
      (mw.winner_team = 'A' AND (p.id = mw.team1_player1_id OR p.id = mw.team1_player2_id))
      OR (mw.winner_team = 'B' AND (p.id = mw.team2_player1_id OR p.id = mw.team2_player2_id))
    )
    WHERE mw.winner_team IN ('A', 'B')
    GROUP BY p.id
    ORDER BY wins DESC, p.last_name ASC, p.first_name ASC
    LIMIT 3
  `;
  const topScorerSql = `
    WITH match_scores AS (
      SELECT
        m.id AS match_id,
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
      p.id AS player_id,
      p.first_name,
      p.last_name,
      COALESCE(SUM(ps.points), 0) AS points
    FROM player_scores ps
    JOIN players p ON p.id = ps.player_id
    GROUP BY p.id
    ORDER BY points DESC, p.last_name ASC, p.first_name ASC
    LIMIT 1
  `;

  db.get(totalPlayersSql, [], (playersErr, playersRow) => {
    if (playersErr) {
      return sendError(res, 500, 'Erreur lors du chargement des joueurs.', playersErr.message);
    }

    db.get(totalMatchesSql, [], (matchesErr, matchesRow) => {
      if (matchesErr) {
        return sendError(res, 500, 'Erreur lors du comptage des parties.', matchesErr.message);
      }

      db.get(totalPointsSql, [], (pointsErr, pointsRow) => {
        if (pointsErr) {
          return sendError(res, 500, 'Erreur lors du calcul des points.', pointsErr.message);
        }

        db.all(matchesByMonthSql, [], (monthsErr, monthsRows) => {
          if (monthsErr) {
            return sendError(res, 500, 'Erreur lors du chargement des parties mensuelles.', monthsErr.message);
          }

          db.all(winnersSql, [], (winnersErr, winnersRows) => {
            if (winnersErr) {
              return sendError(res, 500, 'Erreur lors du calcul des victoires.', winnersErr.message);
            }

            db.get(topScorerSql, [], (scorerErr, scorerRow) => {
              if (scorerErr) {
                return sendError(res, 500, 'Erreur lors du calcul du meilleur score.', scorerErr.message);
              }

              const matchesByMonth = (monthsRows || []).map(row => ({
                month: normalizeMonthLabel(row.month),
                total_matches: Number(row.total_matches) || 0
              }));

              const topWinners = (winnersRows || []).map(row => ({
                player: {
                  id: row.player_id,
                  first_name: row.first_name,
                  last_name: row.last_name
                },
                wins: Number(row.wins) || 0
              }));

              const topScorer = scorerRow
                ? {
                    player: {
                      id: scorerRow.player_id,
                      first_name: scorerRow.first_name,
                      last_name: scorerRow.last_name
                    },
                    points: Number(scorerRow.points) || 0
                  }
                : null;

              return sendSuccess(res, {
                totals: {
                  players: Number(playersRow?.total_players) || 0,
                  matches: Number(matchesRow?.total_matches) || 0,
                  points: Number(pointsRow?.total_points) || 0
                },
                matchesByMonth,
                topWinners,
                topScorer
              });
            });
          });
        });
      });
    });
  });
});

module.exports = router;
