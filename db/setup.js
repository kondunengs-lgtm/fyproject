/**
 * Creates the schema and loads demonstration data.
 * Run with:  npm run setup        (MySQL, the documented driver)
 *            npm run setup:sqlite (no database server needed)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../config/db');

const SALT_ROUNDS = 10; // FR-03

const COURSES = [
  {
    title: 'Introduction to User Interface Design',
    category: 'Design',
    description:
      'A practical introduction to designing interfaces people can use without being taught. '
      + 'Covers visual hierarchy, spacing, colour and type, and the usability heuristics that '
      + 'separate an interface that works from one that only looks finished.',
    thumbnail: '/uploads/thumbnails/course1.jpg',
    modules: [
      {
        title: 'Foundations of Interface Design',
        lessons: [
          'What makes an interface usable',
          'Visual hierarchy and the eight-point spacing scale',
          'Colour, contrast and accessibility'
        ]
      },
      {
        title: 'Designing for the Small Screen',
        lessons: [
          'Why mobile-first ordering matters',
          'Breakpoints and layout reflow',
          'Touch targets and thumb reach'
        ]
      },
      {
        title: 'Testing Your Design',
        lessons: ['Running a five-user usability test', 'Reading and acting on the results']
      }
    ]
  },
  {
    title: 'Web Development with Node.js and Express',
    category: 'Programming',
    description:
      'Build a working server-rendered web application from an empty folder. Routing, '
      + 'middleware, templating, sessions and relational data access, with every concept '
      + 'introduced by way of a working page rather than a definition.',
    thumbnail: '/uploads/thumbnails/course2.jpg',
    modules: [
      {
        title: 'Getting Started',
        lessons: ['Setting up Node and your first server', 'Routing and request handling', 'Serving views with EJS']
      },
      {
        title: 'Working with Data',
        lessons: ['Connecting to MySQL', 'Parameterised queries and why they matter', 'Modelling a one-to-many relationship']
      },
      {
        title: 'Authentication and Sessions',
        lessons: ['Hashing passwords with bcrypt', 'Sessions, cookies and sign-out']
      }
    ]
  },
  {
    title: 'Database Design and Normalisation',
    category: 'Data',
    description:
      'How to design a relational database that stays correct as it grows. Entities, keys, '
      + 'relationships and the three normal forms, worked through on a real schema rather than '
      + 'on abstract examples.',
    thumbnail: '/uploads/thumbnails/course3.jpg',
    modules: [
      {
        title: 'Entities and Relationships',
        lessons: ['Finding the entities in a problem', 'Primary and foreign keys', 'Drawing an entity relationship diagram']
      },
      {
        title: 'Normalisation',
        lessons: ['First and second normal form', 'Third normal form in practice', 'When to store a value and when to compute it']
      }
    ]
  }
];

async function main() {
  await db.init();

  const schemaFile = db.DRIVER === 'mysql' ? 'schema.mysql.sql' : 'schema.sqlite.sql';
  const sql = fs.readFileSync(path.join(__dirname, schemaFile), 'utf8');
  await db.runScript(sql);
  console.log(`Schema created (${db.DRIVER}).`);

  // MySQL creates the database inside the script, so the pool must be rebuilt.
  if (db.DRIVER === 'mysql') await db.init();

  const instructorHash = await bcrypt.hash('instructor123', SALT_ROUNDS);
  const studentHash = await bcrypt.hash('student123', SALT_ROUNDS);

  const instructor = await db.execute(
    'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    ['Dr. Amina Yusuf', 'instructor@demo.test', instructorHash, 'instructor']
  );
  const student = await db.execute(
    'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    ['Chidi Okeke', 'student@demo.test', studentHash, 'student']
  );

  const lessonIds = [];
  let courseOne = null;

  for (const course of COURSES) {
    const c = await db.execute(
      `INSERT INTO courses (title, description, category, thumbnail_url, instructor_id, is_published)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [course.title, course.description, course.category, course.thumbnail, instructor.insertId]
    );
    if (courseOne === null) courseOne = c.insertId;

    let modulePosition = 1;
    for (const mod of course.modules) {
      const m = await db.execute(
        'INSERT INTO modules (course_id, title, position) VALUES (?, ?, ?)',
        [c.insertId, mod.title, modulePosition++]
      );
      let lessonPosition = 1;
      for (const title of mod.lessons) {
        const l = await db.execute(
          `INSERT INTO lessons (module_id, title, video_url, duration_seconds, position)
           VALUES (?, ?, ?, ?, ?)`,
          [m.insertId, title, '/uploads/videos/sample-lesson.mp4', 30, lessonPosition++]
        );
        if (c.insertId === courseOne) lessonIds.push(l.insertId);
      }
    }
  }

  // The demo student is enrolled in the first course with the first two lessons
  // finished, so the dashboard and progress indicators have something to show.
  await db.execute('INSERT INTO enrolments (user_id, course_id) VALUES (?, ?)', [student.insertId, courseOne]);
  for (const lessonId of lessonIds.slice(0, 2)) {
    await db.execute(
      `INSERT INTO lesson_progress (user_id, lesson_id, is_completed, last_position_seconds, completed_at)
       VALUES (?, ?, 1, 30, CURRENT_TIMESTAMP)`,
      [student.insertId, lessonId]
    );
  }

  console.log('Demonstration data loaded.');
  console.log('  Instructor:  instructor@demo.test / instructor123');
  console.log('  Student:     student@demo.test / student123');
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
