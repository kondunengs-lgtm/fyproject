/**
 * Catalogue, enrolment, course pages, lesson delivery and progress
 * (FR-05 to FR-12).
 */
const express = require('express');
const { Courses, Modules, Lessons, Enrolments, Progress } = require('../models');
const { requireSignIn, requireStudent } = require('../middleware/auth');
const { cleanSearch } = require('../middleware/validate');

const router = express.Router();

/** Landing page. */
router.get('/', async (req, res, next) => {
  try {
    const courses = await Courses.list();
    res.render('home', { title: 'Learn without the clutter', courses: courses.slice(0, 3) });
  } catch (err) { next(err); }
});

/** Course catalogue with search and category filter (FR-05). */
router.get('/courses', async (req, res, next) => {
  try {
    const search = cleanSearch(req.query.q);
    const category = cleanSearch(req.query.category);
    const [courses, categories] = await Promise.all([
      Courses.list({ search, category }),
      Courses.categories()
    ]);
    let enrolled = new Set();
    if (req.session.user && req.session.user.role === 'student') {
      const rows = await Enrolments.dashboard(req.session.user.user_id);
      enrolled = new Set(rows.map((r) => r.course_id));
    }
    res.render('courses', { title: 'Courses', courses, categories, search, category, enrolled });
  } catch (err) { next(err); }
});

/** Student dashboard with computed completion figures (FR-07). */
router.get('/dashboard', requireStudent, async (req, res, next) => {
  try {
    const rows = await Enrolments.dashboard(req.session.user.user_id);
    const courses = [];
    for (const row of rows) {
      const total = Number(row.total_lessons) || 0;
      const done = Number(row.completed_lessons) || 0;
      const last = await Progress.lastVisited(req.session.user.user_id, row.course_id);
      courses.push({
        ...row,
        total_lessons: total,
        completed_lessons: done,
        percent: total ? Math.round((done / total) * 100) : 0,
        resume_lesson_id: last ? last.lesson_id : null
      });
    }
    res.render('dashboard', { title: 'My learning', courses });
  } catch (err) { next(err); }
});

/** Enrolment, refusing a duplicate (FR-06). */
router.post('/courses/:id/enrol', requireStudent, async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    const course = await Courses.findById(courseId);
    if (!course || Number(course.is_published) !== 1) {
      return res.status(404).render('error', { title: 'Not found', message: 'That course does not exist.' });
    }
    if (await Enrolments.exists(req.session.user.user_id, courseId)) {
      req.session.flash = { type: 'info', message: 'You are already enrolled in that course.' };
      return res.redirect('/courses/' + courseId);
    }
    await Enrolments.create(req.session.user.user_id, courseId);
    req.session.flash = { type: 'success', message: 'You are enrolled. Start with the first lesson.' };
    return res.redirect('/courses/' + courseId);
  } catch (err) { return next(err); }
});

/** Course page: three-level structure with persistent sidebar (FR-08). */
router.get('/courses/:id', async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    const course = await Courses.findById(courseId);
    if (!course) {
      return res.status(404).render('error', { title: 'Not found', message: 'That course does not exist.' });
    }

    const modules = await Modules.listByCourse(courseId);
    const user = req.session.user;
    const completed = user ? await Progress.completedInCourse(user.user_id, courseId) : new Set();

    let totalLessons = 0;
    let completedLessons = 0;
    for (const mod of modules) {
      mod.lessons = await Lessons.listByModule(mod.module_id);
      mod.lessons.forEach((l) => { l.completed = completed.has(l.lesson_id); });
      mod.completed_count = mod.lessons.filter((l) => l.completed).length;
      totalLessons += mod.lessons.length;
      completedLessons += mod.completed_count;
    }

    const isEnrolled = user && user.role === 'student'
      ? await Enrolments.exists(user.user_id, courseId)
      : false;
    const last = user ? await Progress.lastVisited(user.user_id, courseId) : null;

    res.render('course', {
      title: course.title,
      course,
      modules,
      isEnrolled,
      totalLessons,
      completedLessons,
      percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
      resumeLessonId: last ? last.lesson_id : null
    });
  } catch (err) { next(err); }
});

/** Lesson page with the custom player (FR-09, FR-10). */
router.get('/lessons/:id', requireSignIn, async (req, res, next) => {
  try {
    const lesson = await Lessons.findById(Number(req.params.id));
    if (!lesson) {
      return res.status(404).render('error', { title: 'Not found', message: 'That lesson does not exist.' });
    }

    const user = req.session.user;
    const isOwner = user.role === 'instructor' && lesson.instructor_id === user.user_id;
    if (!isOwner && !(await Enrolments.exists(user.user_id, lesson.course_id))) {
      req.session.flash = { type: 'error', message: 'Enrol in the course to open its lessons.' };
      return res.redirect('/courses/' + lesson.course_id);
    }

    const modules = await Modules.listByCourse(lesson.course_id);
    const completed = await Progress.completedInCourse(user.user_id, lesson.course_id);
    let totalLessons = 0;
    for (const mod of modules) {
      mod.lessons = await Lessons.listByModule(mod.module_id);
      mod.lessons.forEach((l) => { l.completed = completed.has(l.lesson_id); });
      mod.completed_count = mod.lessons.filter((l) => l.completed).length;
      totalLessons += mod.lessons.length;
    }

    const flat = await Lessons.listByCourse(lesson.course_id);
    const index = flat.findIndex((l) => l.lesson_id === lesson.lesson_id);
    const progress = await Progress.forLesson(user.user_id, lesson.lesson_id);

    const currentModule = modules.find((m) => m.module_id === lesson.module_id);

    res.render('lesson', {
      title: lesson.title,
      lesson,
      modules,
      course: { course_id: lesson.course_id, title: lesson.course_title },
      previous: index > 0 ? flat[index - 1] : null,
      next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null,
      resumeAt: progress ? Number(progress.last_position_seconds) : 0,
      isCompleted: progress ? Number(progress.is_completed) === 1 : false,
      moduleCompleted: currentModule ? currentModule.completed_count : 0,
      moduleTotal: currentModule ? currentModule.lessons.length : 0,
      coursePercent: totalLessons ? Math.round((completed.size / totalLessons) * 100) : 0
    });
  } catch (err) { next(err); }
});

/**
 * Progress endpoint called by the player (FR-10, FR-11). The student must be
 * enrolled, and a reported position beyond the lesson duration is rejected.
 */
router.post('/lessons/:id/progress', requireSignIn, async (req, res, next) => {
  try {
    const lesson = await Lessons.findById(Number(req.params.id));
    if (!lesson) return res.status(404).json({ ok: false });

    const user = req.session.user;
    if (!(await Enrolments.exists(user.user_id, lesson.course_id))) {
      return res.status(403).json({ ok: false });
    }

    let position = Number(req.body.position_seconds);
    if (!Number.isFinite(position) || position < 0) position = 0;
    const duration = Number(lesson.duration_seconds) || 0;
    if (duration > 0 && position > duration) position = duration;

    const completed = req.body.completed === true || req.body.completed === 'true';
    await Progress.save(user.user_id, lesson.lesson_id, Math.floor(position), completed);

    const done = await Progress.completedInCourse(user.user_id, lesson.course_id);
    const all = await Lessons.listByCourse(lesson.course_id);
    return res.json({
      ok: true,
      completed,
      course_percent: all.length ? Math.round((done.size / all.length) * 100) : 0
    });
  } catch (err) { return next(err); }
});

module.exports = router;
