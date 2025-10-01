const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정 - 1001vid25 포함된 도메인 허용
app.use(cors({
  origin: (origin, callback) => {
    const allowedPattern = process.env.ALLOWED_ORIGINS || '*';

    if (allowedPattern === '*') {
      callback(null, true);
      return;
    }

    // 1001vid25 포함된 vercel.app 도메인 체크
    if (!origin || origin.includes('1001vid25') && origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Video25 API is running',
    version: '1.0.0',
    status: 'ok'
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Video API Routes
const videoRoutes = require('./routes/video');
app.use('/api/video', videoRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Vercel용 export (serverless function)
module.exports = app;

// 로컬 개발용
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
