/**
 * Model layer. Every SQL statement in the application lives here, and every one
 * of them is parameterised (NFR-04). Controllers call these functions and never
 * build SQL themselves, which is the separation required by NFR-06.
 */
const db = require('../config/db');

/* ----------------------------------------------------------------- users */

const Users = {
  findByEmail: (email) =>
    db.one('SELECT * FROM users WHERE email = ?', [email]),

  findById: (id) =>
    db.one('SELECT user_id, full_name, email, role FROM users WHERE user_id = ?', [id]),

  create: (fullName, email, passwordHash, role) =>
    db.execute(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [fullName, email, passwordHash, role]
    )
};

/* --------------------------------------------------------------- courses */

const Courses = {
  /** Catalogue with optional search and category filter (FR-05). */
  async list({ search = '', category = '' } = {}) {
    let sql = `
      SELECT c.course_id, c.title, c.description, c.category, c.thumbnail_url,
             u.full_name AS instructor_name,
             (SELECT COUNT(*) FROM lessons l
                JOIN modules m ON m.module_id = l.module_id
               WHERE m.course_id = c.course_id) AS lesson_count
        FROM courses c
        JOIN users u ON u.user_id = c.instructor_id
       WHERE c.is_published = 1`;
    const params = [];
    if (search) {
      sql += ' AND c.title LIKE ?';
      params.push(`%${search}%`);
    }
    if (category) {
      sql += ' AND c.category = ?';
      params.push(category);
    }
    sql += ' ORDER BY c.created_at DESC';
    return db.query(sql, params);
  },

  categories: () =>
    db.query('SELECT DISTINCT category FROM courses WHERE is_published = 1 ORDER BY category'),

  findById: (id) =>
    db.one(
      `SELECT c.*, u.full_name AS instructor_name
         FROM courses c JOIN users u ON u.user_id = c.instructor_id
        WHERE c.course_id = ?`,
      [id]
    ),

  listByInstructor: (instructorId) =>
    db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.course_id) AS module_count,
              (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.module_id = l.module_id
                WHERE m.course_id = c.course_id) AS lesson_count,
              (SELECT COUNT(*) FROM enrolments e WHERE e.course_id = c.course_id) AS student_count
         FROM courses c WHERE c.instructor_id = ? ORDER BY c.created_at DESC`,
      [instructorId]
    ),

  create: (title, description, category, thumbnail, instructorId) =>
    db.execute(
      `INSERT INTO courses (title, description, category, thumbnail_url, instructor_id)
       VALUES (?, ?, ?, ?, ?)`,
      [title, description, category, thumbnail, instructorId]
    ),

  update: (id, title, description, category) =>
    db.execute(
      'UPDATE courses SET title = ?, description = ?, category = ? WHERE course_id = ?',
      [title, description, category, id]
    ),

  remove: (id) => db.execute('DELETE FROM courses WHERE course_id = ?', [id])
};

/* ------------------------------------------------- modules and lessons */

const Modules = {
  listByCourse: (courseId) =>
    db.query('SELECT * FROM modules WHERE course_id = ? ORDER BY position, module_id', [courseId]),

  findById: (id) =>
    db.one(
      `SELECT m.*, c.instructor_id, c.title AS course_title
         FROM modules m JOIN courses c ON c.course_id = m.course_id
        WHERE m.module_id = ?`,
      [id]
    ),

  create: (courseId, title, position) =>
    db.execute('INSERT INTO modules (course_id, title, position) VALUES (?, ?, ?)',
      [courseId, title, position]),

  remove: (id) => db.execute('DELETE FROM modules WHERE module_id = ?', [id]),

  nextPosition: async (courseId) => {
    const row = await db.one('SELECT COALESCE(MAX(position), 0) AS p FROM modules WHERE course_id = ?', [courseId]);
    return Number(row.p) + 1;
  }
};

const Lessons = {
  listByModule: (moduleId) =>
    db.query('SELECT * FROM lessons WHERE module_id = ? ORDER BY position, lesson_id', [moduleId]),

  findById: (id) =>
    db.one(
      `SELECT l.*, m.title AS module_title, m.course_id, m.position AS module_position,
              c.title AS course_title, c.instructor_id
         FROM lessons l
         JOIN modules m ON m.module_id = l.module_id
         JOIN courses c ON c.course_id = m.course_id
        WHERE l.lesson_id = ?`,
      [id]
    ),

  /** Flat ordered list of every lesson in a course, used for next/previous links. */
  listByCourse: (courseId) =>
    db.query(
      `SELECT l.lesson_id, l.title, l.position, m.module_id, m.position AS module_position
         FROM lessons l JOIN modules m ON m.module_id = l.module_id
        WHERE m.course_id = ?
        ORDER BY m.position, m.module_id, l.position, l.lesson_id`,
      [courseId]
    ),

  create: (moduleId, title, videoUrl, duration, position) =>
    db.execute(
      `INSERT INTO lessons (module_id, title, video_url, duration_seconds, position)
       VALUES (?, ?, ?, ?, ?)`,
      [moduleId, title, videoUrl, duration, position]
    ),

  remove: (id) => db.execute('DELETE FROM lessons WHERE lesson_id = ?', [id]),

  nextPosition: async (moduleId) => {
    const row = await db.one('SELECT COALESCE(MAX(position), 0) AS p FROM lessons WHERE module_id = ?', [moduleId]);
    return Number(row.p) + 1;
  }
};

/* ------------------------------------------------------------ enrolments */

const Enrolments = {
  exists: async (userId, courseId) => {
    const row = await db.one(
      'SELECT enrolment_id FROM enrolments WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );
    return Boolean(row);
  },

  create: (userId, courseId) =>
    db.execute('INSERT INTO enrolments (user_id, course_id) VALUES (?, ?)', [userId, courseId]),

  /**
   * Dashboard rows (FR-07). Completion percentage is computed here at read time
   * rather than stored, so it cannot fall out of step with the lesson records.
   */
  dashboard: (userId) =>
    db.query(
      `SELECT c.course_id, c.title, c.thumbnail_url, c.category,
              u.full_name AS instructor_name,
              (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.module_id = l.module_id
                WHERE m.course_id = c.course_id) AS total_lessons,
              (SELECT COUNT(*) FROM lesson_progress p
                 JOIN lessons l ON l.lesson_id = p.lesson_id
                 JOIN modules m ON m.module_id = l.module_id
                WHERE m.course_id = c.course_id AND p.user_id = ? AND p.is_completed = 1)
                AS completed_lessons
         FROM enrolments e
         JOIN courses c ON c.course_id = e.course_id
         JOIN users u ON u.user_id = c.instructor_id
        WHERE e.user_id = ?
        ORDER BY e.enrolled_at DESC`,
      [userId, userId]
    )
};

/* -------------------------------------------------------------- progress */

const Progress = {
  forLesson: (userId, lessonId) =>
    db.one('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', [userId, lessonId]),

  /** Completed lesson ids for one course, used to tick the sidebar. */
  completedInCourse: async (userId, courseId) => {
    const rows = await db.query(
      `SELECT p.lesson_id FROM lesson_progress p
         JOIN lessons l ON l.lesson_id = p.lesson_id
         JOIN modules m ON m.module_id = l.module_id
        WHERE m.course_id = ? AND p.user_id = ? AND p.is_completed = 1`,
      [courseId, userId]
    );
    return new Set(rows.map((r) => r.lesson_id));
  },

  /**
   * Records playback position and completion (FR-10, FR-11). Written as a read
   * followed by an insert or update so that the same code runs on both drivers.
   */
  async save(userId, lessonId, positionSeconds, isCompleted) {
    const existing = await Progress.forLesson(userId, lessonId);
    if (!existing) {
      await db.execute(
        `INSERT INTO lesson_progress (user_id, lesson_id, is_completed, last_position_seconds, completed_at)
         VALUES (?, ?, ?, ?, ${isCompleted ? 'CURRENT_TIMESTAMP' : 'NULL'})`,
        [userId, lessonId, isCompleted ? 1 : 0, positionSeconds]
      );
      return;
    }
    const nowCompleted = isCompleted || Number(existing.is_completed) === 1;
    await db.execute(
      `UPDATE lesson_progress
          SET last_position_seconds = ?, is_completed = ?, updated_at = CURRENT_TIMESTAMP,
              completed_at = CASE WHEN ? = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE user_id = ? AND lesson_id = ?`,
      [positionSeconds, nowCompleted ? 1 : 0, nowCompleted ? 1 : 0, userId, lessonId]
    );
  },

  /** The lesson a student should be taken back to when they resume a course. */
  lastVisited: (userId, courseId) =>
    db.one(
      `SELECT p.lesson_id FROM lesson_progress p
         JOIN lessons l ON l.lesson_id = p.lesson_id
         JOIN modules m ON m.module_id = l.module_id
        WHERE m.course_id = ? AND p.user_id = ?
        ORDER BY p.updated_at DESC
        LIMIT 1`,
      [courseId, userId]
    )
};

module.exports = { Users, Courses, Modules, Lessons, Enrolments, Progress };
