const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정 - 1001vid25 포함된 도메인 허용
app.use(cors({
  origin: (origin, callback) => {
    const allowedPattern = process.env.ALLOWED_ORIGINS || '*';

    // 개발 환경이나 ALLOWED_ORIGINS가 *인 경우 모든 origin 허용
    if (allowedPattern === '*') {
      callback(null, true);
      return;
    }

    // origin이 없는 경우 (curl, Postman 등) 허용
    if (!origin) {
      callback(null, true);
      return;
    }

    // 1001vid25 포함된 vercel.app 도메인 체크
    if (origin.includes('1001vid25') && origin.includes('vercel.app')) {
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

// Health check - Railway가 루트 경로로 체크할 수 있도록
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Video25 API is running',
    version: '1.0.0',
    status: 'healthy'
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

// Railway 및 로컬 개발용 서버 시작
if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ Health check: http://0.0.0.0:${PORT}/api/health`);
  });

  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('📡 SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}
