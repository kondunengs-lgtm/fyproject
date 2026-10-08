/**
 * Server-side validation (Table 3.8). The same rules run in the browser for
 * immediate feedback, but these are the authoritative checks, since anything
 * enforced only in the browser can be bypassed.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration({ full_name, email, password, confirm_password, role }) {
  const errors = [];
  if (!full_name || full_name.trim().length < 3) errors.push('Full name must be at least 3 characters.');
  if (!email || !EMAIL.test(email)) errors.push('Enter a valid email address.');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) errors.push('Password must contain both letters and numbers.');
  if (password !== confirm_password) errors.push('The two passwords do not match.');
  if (!['student', 'instructor'].includes(role)) errors.push('Choose an account type.');
  return errors;
}

function validateCourse({ title, description, category }) {
  const errors = [];
  if (!title || title.trim().length < 5 || title.trim().length > 150) errors.push('Course title must be between 5 and 150 characters.');
  if (!description || description.trim().length < 10) errors.push('Give the course a description of at least 10 characters.');
  if (!category || category.trim().length === 0) errors.push('Choose a category.');
  return errors;
}

function cleanSearch(term) {
  return String(term || '').trim().slice(0, 100);
}

module.exports = { validateRegistration, validateCourse, cleanSearch };
