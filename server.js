require('dotenv').config();
const express  = require('express');
const path     = require('path');
const session  = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const pool     = require('./db');

const requireAuth  = require('./middleware/requireAuth');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Session store backed by PostgreSQL
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// Auth routes — no authentication required
app.use('/auth', require('./routes/auth'));

// All other routes require a valid session
app.use(requireAuth);

// Serve static files after auth check
app.use(express.static(path.join(__dirname, 'public')));

// Current user endpoint
app.get('/api/me', (req, res) => res.json(req.session.user));

// API routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/admin',    require('./routes/admin'));

app.listen(PORT, () => {
  console.log(`ProDash running at http://localhost:${PORT}`);
});
