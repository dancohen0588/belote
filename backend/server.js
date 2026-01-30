const express = require('express');
const cors = require('cors');

const playersRouter = require('./routes/players');
const matchesRouter = require('./routes/matches');
const kpisRouter = require('./routes/kpis');

const app = express();
const PORT = 3000;

app.use(cors({ origin: '*'}));
app.use(express.json());

app.use('/api/players', playersRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/kpis', kpisRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'Route introuvable.' }
  });
});

app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    error: { message: 'Erreur serveur.', details: err.message }
  });
});

app.listen(PORT, () => {
  console.log(`API Belote démarrée sur http://localhost:${PORT}`);
});
