/**
 * Online Learning Platform with a Modern User Interface
 * Application tier entry point (Chapter Three, Figure 3.1).
 *
 * Request lifecycle: routing -> session and access control middleware ->
 * controller -> model -> data tier. Security checks sit ahead of the
 * controllers rather than inside them (NFR-04).
 */
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./config/db');
const { locals } = require('./middleware/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '100kb' }));

app.use(session({
  name: 'olp.sid',
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,               // NFR-04: not readable from client script
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(locals);

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/courses'));
app.use('/instructor', require('./routes/instructor'));

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    message: 'That page does not exist. Use the menu above to get back.'
  });
});

// NFR-05: nothing reaches the user as a stack trace, and the server stays up.
app.use((err, req, res, _next) => {
  console.error(err);
  const message = err.message && err.message.length < 200
    ? err.message
    : 'Something went wrong on our side. Please try again.';
  res.status(err.status || 500).render('error', { title: 'Something went wrong', message });
});

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Online Learning Platform running on http://localhost:${PORT}  (driver: ${db.DRIVER})`);
    });
  })
  .catch((err) => {
    console.error('Could not reach the database:', err.message);
    console.error('Check your .env settings, or run with DB_DRIVER=sqlite to start without a database server.');
    process.exit(1);
  });
