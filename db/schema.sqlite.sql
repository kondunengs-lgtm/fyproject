-- Online Learning Platform - SQLite schema (no-setup demonstration mode).
-- Same six tables and same constraints as the MySQL schema.

PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS lesson_progress;
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS users;
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','instructor')),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courses (
  course_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'General',
  thumbnail_url TEXT,
  instructor_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  is_published  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE modules (
  module_id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE lessons (
  lesson_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id        INTEGER NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  video_url        TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  position         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id    INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  enrolled_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, course_id)
);

CREATE TABLE lesson_progress (
  progress_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  lesson_id             INTEGER NOT NULL REFERENCES lessons(lesson_id) ON DELETE CASCADE,
  is_completed          INTEGER NOT NULL DEFAULT 0,
  last_position_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at          TEXT,
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX idx_course_instructor ON courses(instructor_id);
CREATE INDEX idx_module_course ON modules(course_id, position);
CREATE INDEX idx_lesson_module ON lessons(module_id, position);
