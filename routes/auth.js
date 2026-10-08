/** Registration, sign-in and sign-out (FR-01, FR-02, FR-03, FR-15). */
const express = require('express');
const bcrypt = require('bcrypt');
const { Users } = require('../models');
const { validateRegistration } = require('../middleware/validate');

const router = express.Router();
const SALT_ROUNDS = 10; // FR-03

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register', { title: 'Create an account', errors: [], values: {} });
});

router.post('/register', async (req, res, next) => {
  try {
    const values = {
      full_name: (req.body.full_name || '').trim(),
      email: (req.body.email || '').trim().toLowerCase(),
      role: req.body.role || 'student'
    };
    const errors = validateRegistration({ ...values, password: req.body.password, confirm_password: req.body.confirm_password });

    if (errors.length === 0 && await Users.findByEmail(values.email)) {
      errors.push('An account already exists for that email address.');
    }
    if (errors.length) {
      return res.status(400).render('register', { title: 'Create an account', errors, values });
    }

    const hash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const result = await Users.create(values.full_name, values.email, hash, values.role);

    req.session.user = {
      user_id: result.insertId,
      full_name: values.full_name,
      email: values.email,
      role: values.role
    };
    req.session.flash = { type: 'success', message: 'Your account is ready. Welcome.' };
    return res.redirect(values.role === 'instructor' ? '/instructor/courses' : '/dashboard');
  } catch (err) {
    return next(err);
  }
});

router.get('/signin', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('signin', { title: 'Sign in', errors: [], values: {}, next: req.query.next || '' });
});

router.post('/signin', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const nextUrl = req.body.next || '';

    const user = await Users.findByEmail(email);
    // One generic message either way, so the form does not reveal which
    // addresses hold accounts (Table 3.8).
    const fail = () => res.status(401).render('signin', {
      title: 'Sign in',
      errors: ['Email or password is not correct.'],
      values: { email },
      next: nextUrl
    });

    if (!user) return fail();
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return fail();

    req.session.user = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    };
    if (nextUrl && nextUrl.startsWith('/')) return res.redirect(nextUrl);
    return res.redirect(user.role === 'instructor' ? '/instructor/courses' : '/dashboard');
  } catch (err) {
    return next(err);
  }
});

router.post('/signout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('olp.sid');
    res.redirect('/');
  });
});

module.exports = router;
