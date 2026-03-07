require('dotenv').config();
const express    = require('express');
const https      = require('https');
const fs         = require('fs');
const path       = require('path');
const helmet     = require('helmet');
const session    = require('express-session');
const PgSession  = require('connect-pg-simple')(session);
const pool       = require('./db');
const requireAuth = require('./middleware/requireAuth');

const app  = express();
const PORT = process.env.PORT || 3000;

const sslOptions = {
  key:  fs.readFileSync(path.join(__dirname, 'cert/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert/cert.pem'))
};

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", 'cdn.jsdelivr.net']
    }
  }
}));

app.use(express.json());

// Session store backed by PostgreSQL
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,               // HTTPS only
    httpOnly: true,             // not readable by JS
    sameSite: 'lax',            // CSRF protection
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
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

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`ProDash running at https://rick:${PORT}`);
});
