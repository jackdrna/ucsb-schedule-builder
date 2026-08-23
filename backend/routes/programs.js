const express = require('express');
const Program = require('../models/Program');
const router = express.Router();

// GET all degree programs with their requirement definitions
router.get('/', async (req, res) => {
  try {
    res.json(await Program.getAll());
  } catch (error) {
    console.error('GET /api/programs failed:', error);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// GET one program -- 'EE' or 'CE'
router.get('/:code', async (req, res) => {
  try {
    const program = await Program.getByCode(req.params.code);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json(program);
  } catch (error) {
    console.error('GET /api/programs/:code failed:', error);
    res.status(500).json({ error: 'Failed to fetch program' });
  }
});

module.exports = router;
