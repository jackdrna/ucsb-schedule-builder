const express = require('express');
const cors = require('cors');
require('dotenv').config();

const coursesRouter = require('./routes/courses');
const programsRouter = require('./routes/programs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/courses', coursesRouter);
app.use('/api/programs', programsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('API endpoints:');
  console.log('  GET  /api/courses                        - all courses');
  console.log('  GET  /api/courses/sources                - UCSB data sources');
  console.log('  GET  /api/courses/code/:code             - course by code');
  console.log('  GET  /api/courses/:id                    - course by id');
  console.log('  GET  /api/courses/:id/all-prerequisites  - full prerequisite chain');
  console.log('  GET  /api/programs                       - EE / CE requirements');
  console.log('  GET  /api/programs/:code                 - one program');
  console.log('  GET  /api/health');
});

module.exports = app;
