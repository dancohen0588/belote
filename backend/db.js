const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'belote.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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
});

module.exports = db;
