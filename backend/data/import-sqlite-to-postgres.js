const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'belote.db');
const POSTGRES_URL = process.env.DATABASE_URL;

if (!POSTGRES_URL) {
  console.error('DATABASE_URL est requis pour importer vers Postgres.');
  process.exit(1);
}

const sqliteDb = new sqlite3.Database(SQLITE_PATH);
const pool = new Pool({ connectionString: POSTGRES_URL });

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function run() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const players = await allAsync('SELECT * FROM players ORDER BY id ASC');
    for (const player of players) {
      await client.query(
        `INSERT INTO players (id, first_name, last_name, email, phone, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
        [
          player.id,
          player.first_name,
          player.last_name,
          player.email,
          player.phone,
          player.created_at,
          player.updated_at
        ]
      );
    }

    const matches = await allAsync('SELECT * FROM matches ORDER BY id ASC');
    for (const match of matches) {
      await client.query(
        `INSERT INTO matches (
            id,
            played_at,
            location,
            team1_player1_id,
            team1_player2_id,
            team2_player1_id,
            team2_player2_id,
            rounds_played,
            status,
            created_at,
            updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           played_at = EXCLUDED.played_at,
           location = EXCLUDED.location,
           team1_player1_id = EXCLUDED.team1_player1_id,
           team1_player2_id = EXCLUDED.team1_player2_id,
           team2_player1_id = EXCLUDED.team2_player1_id,
           team2_player2_id = EXCLUDED.team2_player2_id,
           rounds_played = EXCLUDED.rounds_played,
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
        [
          match.id,
          match.played_at,
          match.location,
          match.team1_player1_id,
          match.team1_player2_id,
          match.team2_player1_id,
          match.team2_player2_id,
          match.rounds_played,
          match.status,
          match.created_at,
          match.updated_at
        ]
      );
    }

    const rounds = await allAsync('SELECT * FROM match_rounds ORDER BY id ASC');
    for (const round of rounds) {
      await client.query(
        `INSERT INTO match_rounds (id, match_id, round_index, team1_score, team2_score)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           match_id = EXCLUDED.match_id,
           round_index = EXCLUDED.round_index,
           team1_score = EXCLUDED.team1_score,
           team2_score = EXCLUDED.team2_score`,
        [
          round.id,
          round.match_id,
          round.round_index,
          round.team1_score,
          round.team2_score
        ]
      );
    }

    await client.query("SELECT setval(pg_get_serial_sequence('players', 'id'), (SELECT COALESCE(MAX(id), 1) FROM players))");
    await client.query("SELECT setval(pg_get_serial_sequence('matches', 'id'), (SELECT COALESCE(MAX(id), 1) FROM matches))");
    await client.query("SELECT setval(pg_get_serial_sequence('match_rounds', 'id'), (SELECT COALESCE(MAX(id), 1) FROM match_rounds))");

    await client.query('COMMIT');
    console.log(`Import terminé. joueurs=${players.length} parties=${matches.length} manches=${rounds.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur pendant l\'import:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    sqliteDb.close();
    await pool.end();
  }
}

run();
