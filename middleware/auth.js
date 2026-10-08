/**
 * Access control middleware (FR-04). Every protected route passes through one of
 * these functions before its controller runs, so no controller can be reached
 * through a route where the check was forgotten.
 */

function requireSignIn(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', message: 'Please sign in to continue.' };
    return res.redirect('/signin?next=' + encodeURIComponent(req.originalUrl));
  }
  return next();
}

function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect('/signin');
  if (req.session.user.role !== 'student') {
    return res.status(403).render('error', {
      title: 'Not allowed',
      message: 'This page is for student accounts.'
    });
  }
  return next();
}

function requireInstructor(req, res, next) {
  if (!req.session.user) return res.redirect('/signin');
  if (req.session.user.role !== 'instructor') {
    return res.status(403).render('error', {
      title: 'Not allowed',
      message: 'This page is for instructor accounts.'
    });
  }
  return next();
}

/** Makes the signed-in user and any flash message available to every view. */
function locals(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  return next();
}

module.exports = { requireSignIn, requireStudent, requireInstructor, locals };
