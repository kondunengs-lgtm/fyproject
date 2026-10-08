/** Instructor course, module and lesson management (FR-13, FR-14). */
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Courses, Modules, Lessons } = require('../models');
const { requireInstructor } = require('../middleware/auth');
const { validateCourse } = require('../middleware/validate');

const router = express.Router();
router.use(requireInstructor);

const UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'uploads');

/** Stored under a generated name, never the name the browser supplied. */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === 'video' ? 'videos' : 'thumbnails';
    const full = path.join(UPLOAD_ROOT, dir);
    fs.mkdirSync(full, { recursive: true });
    cb(null, full);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB, Table 3.8
  fileFilter: (req, file, cb) => {
    const allowed = file.fieldname === 'video'
      ? ['video/mp4']
      : ['image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error(file.fieldname === 'video'
        ? 'Lesson video must be an MP4 file.'
        : 'Thumbnail must be a JPG or PNG image.'));
    }
    return cb(null, true);
  }
});

/** Ownership check: an instructor may only touch their own course. */
async function ownCourse(req, res, courseId) {
  const course = await Courses.findById(courseId);
  if (!course || course.instructor_id !== req.session.user.user_id) {
    res.status(403).render('error', { title: 'Not allowed', message: 'That course is not yours to edit.' });
    return null;
  }
  return course;
}

router.get('/courses', async (req, res, next) => {
  try {
    const courses = await Courses.listByInstructor(req.session.user.user_id);
    res.render('instructor/courses', { title: 'My courses', courses });
  } catch (err) { next(err); }
});

router.get('/courses/new', (req, res) => {
  res.render('instructor/course-form', { title: 'New course', errors: [], values: {}, course: null });
});

router.post('/courses', upload.single('thumbnail'), async (req, res, next) => {
  try {
    const values = {
      title: (req.body.title || '').trim(),
      description: (req.body.description || '').trim(),
      category: (req.body.category || '').trim()
    };
    const errors = validateCourse(values);
    if (errors.length) {
      return res.status(400).render('instructor/course-form', { title: 'New course', errors, values, course: null });
    }
    const thumbnail = req.file ? '/uploads/thumbnails/' + req.file.filename : null;
    const result = await Courses.create(values.title, values.description, values.category, thumbnail, req.session.user.user_id);
    req.session.flash = { type: 'success', message: 'Course created. Add your first module.' };
    return res.redirect('/instructor/courses/' + result.insertId);
  } catch (err) { return next(err); }
});

/** Course builder: modules and lessons for one course. */
router.get('/courses/:id', async (req, res, next) => {
  try {
    const course = await ownCourse(req, res, Number(req.params.id));
    if (!course) return undefined;
    const modules = await Modules.listByCourse(course.course_id);
    for (const mod of modules) mod.lessons = await Lessons.listByModule(mod.module_id);
    return res.render('instructor/course-builder', { title: course.title, course, modules });
  } catch (err) { return next(err); }
});

router.post('/courses/:id/edit', async (req, res, next) => {
  try {
    const course = await ownCourse(req, res, Number(req.params.id));
    if (!course) return undefined;
    const values = {
      title: (req.body.title || '').trim(),
      description: (req.body.description || '').trim(),
      category: (req.body.category || '').trim()
    };
    const errors = validateCourse(values);
    if (errors.length) {
      return res.status(400).render('instructor/course-form', { title: 'Edit course', errors, values, course });
    }
    await Courses.update(course.course_id, values.title, values.description, values.category);
    req.session.flash = { type: 'success', message: 'Course updated.' };
    return res.redirect('/instructor/courses/' + course.course_id);
  } catch (err) { return next(err); }
});

router.get('/courses/:id/edit', async (req, res, next) => {
  try {
    const course = await ownCourse(req, res, Number(req.params.id));
    if (!course) return undefined;
    return res.render('instructor/course-form', { title: 'Edit course', errors: [], values: course, course });
  } catch (err) { return next(err); }
});

router.post('/courses/:id/delete', async (req, res, next) => {
  try {
    const course = await ownCourse(req, res, Number(req.params.id));
    if (!course) return undefined;
    await Courses.remove(course.course_id);
    req.session.flash = { type: 'success', message: 'Course deleted.' };
    return res.redirect('/instructor/courses');
  } catch (err) { return next(err); }
});

router.post('/courses/:id/modules', async (req, res, next) => {
  try {
    const course = await ownCourse(req, res, Number(req.params.id));
    if (!course) return undefined;
    const title = (req.body.title || '').trim();
    if (title.length < 3) {
      req.session.flash = { type: 'error', message: 'Module title must be at least 3 characters.' };
      return res.redirect('/instructor/courses/' + course.course_id);
    }
    const position = await Modules.nextPosition(course.course_id);
    await Modules.create(course.course_id, title, position);
    req.session.flash = { type: 'success', message: 'Module added.' };
    return res.redirect('/instructor/courses/' + course.course_id);
  } catch (err) { return next(err); }
});

router.post('/modules/:id/delete', async (req, res, next) => {
  try {
    const mod = await Modules.findById(Number(req.params.id));
    if (!mod || mod.instructor_id !== req.session.user.user_id) {
      return res.status(403).render('error', { title: 'Not allowed', message: 'That module is not yours to edit.' });
    }
    await Modules.remove(mod.module_id);
    req.session.flash = { type: 'success', message: 'Module deleted.' };
    return res.redirect('/instructor/courses/' + mod.course_id);
  } catch (err) { return next(err); }
});

/** Lesson creation with validated video upload (FR-14). */
router.post('/modules/:id/lessons', upload.single('video'), async (req, res, next) => {
  try {
    const mod = await Modules.findById(Number(req.params.id));
    if (!mod || mod.instructor_id !== req.session.user.user_id) {
      return res.status(403).render('error', { title: 'Not allowed', message: 'That module is not yours to edit.' });
    }
    const title = (req.body.title || '').trim();
    if (title.length < 3) {
      req.session.flash = { type: 'error', message: 'Lesson title must be at least 3 characters.' };
      return res.redirect('/instructor/courses/' + mod.course_id);
    }
    const duration = Math.max(0, Math.floor(Number(req.body.duration_seconds) || 0));
    const videoUrl = req.file ? '/uploads/videos/' + req.file.filename : '/uploads/videos/sample-lesson.mp4';
    const position = await Lessons.nextPosition(mod.module_id);
    await Lessons.create(mod.module_id, title, videoUrl, duration, position);
    req.session.flash = { type: 'success', message: 'Lesson added.' };
    return res.redirect('/instructor/courses/' + mod.course_id);
  } catch (err) { return next(err); }
});

router.post('/lessons/:id/delete', async (req, res, next) => {
  try {
    const lesson = await Lessons.findById(Number(req.params.id));
    if (!lesson || lesson.instructor_id !== req.session.user.user_id) {
      return res.status(403).render('error', { title: 'Not allowed', message: 'That lesson is not yours to edit.' });
    }
    await Lessons.remove(lesson.lesson_id);
    req.session.flash = { type: 'success', message: 'Lesson deleted.' };
    return res.redirect('/instructor/courses/' + lesson.course_id);
  } catch (err) { return next(err); }
});

module.exports = router;
