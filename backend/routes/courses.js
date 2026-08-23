const express = require('express');
const Course = require('../models/Course');
const router = express.Router();

// GET all courses, with prerequisite trees and quarter offerings
router.get('/', async (req, res) => {
  try {
    res.json(await Course.getAllCourses());
  } catch (error) {
    console.error('GET /api/courses failed:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// GET the data sources behind the course data
router.get('/sources', async (req, res) => {
  try {
    res.json(await Course.getSources());
  } catch (error) {
    console.error('GET /api/courses/sources failed:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

// GET a course by code -- 'ECE 130A' or 'ECE130A'
router.get('/code/:code', async (req, res) => {
  try {
    const course = await Course.getCourseByCode(req.params.code);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json(course);
  } catch (error) {
    console.error('GET /api/courses/code failed:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// GET every course in a course's prerequisite chain
router.get('/:id/all-prerequisites', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid course id' });
    res.json(await Course.getAllPrerequisites(id));
  } catch (error) {
    console.error('GET /api/courses/:id/all-prerequisites failed:', error);
    res.status(500).json({ error: 'Failed to fetch prerequisites' });
  }
});

// GET a single course by id -- last, so it does not shadow /sources or /code/:code
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid course id' });
    const course = await Course.getCourseById(id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json(course);
  } catch (error) {
    console.error('GET /api/courses/:id failed:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

module.exports = router;
