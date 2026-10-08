-- Online Learning Platform - MySQL 8 schema
-- Six tables, third normal form, as documented in Chapter Three, Figure 3.2.

CREATE DATABASE IF NOT EXISTS online_learning
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE online_learning;

DROP TABLE IF EXISTS lesson_progress;
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('student','instructor') NOT NULL DEFAULT 'student',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE courses (
  course_id      INT AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(150) NOT NULL,
  description    TEXT,
  category       VARCHAR(60) NOT NULL DEFAULT 'General',
  thumbnail_url  VARCHAR(255),
  instructor_id  INT NOT NULL,
  is_published   TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_instructor FOREIGN KEY (instructor_id)
    REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_course_instructor (instructor_id),
  INDEX idx_course_category (category)
) ENGINE=InnoDB;

CREATE TABLE modules (
  module_id  INT AUTO_INCREMENT PRIMARY KEY,
  course_id  INT NOT NULL,
  title      VARCHAR(150) NOT NULL,
  position   INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_module_course FOREIGN KEY (course_id)
    REFERENCES courses(course_id) ON DELETE CASCADE,
  INDEX idx_module_course (course_id, position)
) ENGINE=InnoDB;

CREATE TABLE lessons (
  lesson_id        INT AUTO_INCREMENT PRIMARY KEY,
  module_id        INT NOT NULL,
  title            VARCHAR(150) NOT NULL,
  video_url        VARCHAR(255),
  duration_seconds INT NOT NULL DEFAULT 0,
  position         INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_lesson_module FOREIGN KEY (module_id)
    REFERENCES modules(module_id) ON DELETE CASCADE,
  INDEX idx_lesson_module (module_id, position)
) ENGINE=InnoDB;

CREATE TABLE enrolments (
  enrolment_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  course_id    INT NOT NULL,
  enrolled_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_enrol_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_enrol_course FOREIGN KEY (course_id)
    REFERENCES courses(course_id) ON DELETE CASCADE,
  CONSTRAINT uq_enrolment UNIQUE (user_id, course_id)
) ENGINE=InnoDB;

CREATE TABLE lesson_progress (
  progress_id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT NOT NULL,
  lesson_id             INT NOT NULL,
  is_completed          TINYINT(1) NOT NULL DEFAULT 0,
  last_position_seconds INT NOT NULL DEFAULT 0,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at          DATETIME NULL,
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_progress_lesson FOREIGN KEY (lesson_id)
    REFERENCES lessons(lesson_id) ON DELETE CASCADE,
  CONSTRAINT uq_progress UNIQUE (user_id, lesson_id)
) ENGINE=InnoDB;
