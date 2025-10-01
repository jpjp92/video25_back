const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정 - 모든 origin 허용 (Railway 테스트용)
app.use(cors());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${req.ip}`);
  next();
});

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
