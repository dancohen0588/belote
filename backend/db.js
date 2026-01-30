const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'belote.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(
    `CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  db.run(
    `CREATE TRIGGER IF NOT EXISTS players_updated_at
     AFTER UPDATE ON players
     FOR EACH ROW
     BEGIN
       UPDATE players SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
     END;`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      played_at DATETIME NOT NULL,
      location TEXT NOT NULL,
      team1_player1_id INTEGER NOT NULL,
      team1_player2_id INTEGER NOT NULL,
      team2_player1_id INTEGER NOT NULL,
      team2_player2_id INTEGER NOT NULL,
      rounds_played INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team1_player1_id) REFERENCES players(id),
      FOREIGN KEY (team1_player2_id) REFERENCES players(id),
      FOREIGN KEY (team2_player1_id) REFERENCES players(id),
      FOREIGN KEY (team2_player2_id) REFERENCES players(id),
      CHECK (status IN ('scheduled', 'played'))
    )`
  );

  db.run(
    `CREATE TRIGGER IF NOT EXISTS matches_updated_at
     AFTER UPDATE ON matches
     FOR EACH ROW
     BEGIN
       UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
     END;`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS match_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      round_index INTEGER NOT NULL,
      team1_score INTEGER NOT NULL,
      team2_score INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE (match_id, round_index)
    )`
  );
});

module.exports = db;
