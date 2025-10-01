const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { GeminiVideoAnalyzer } = require('../lib/gemini');
const { GeminiDescriptionAnalyzer } = require('../lib/geminiAnalyzer');

const router = express.Router();

// Multer 설정 - 메모리에 임시 저장
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = '/tmp/uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB 제한
  },
  fileFilter: (req, file, cb) => {
    // 비디오 파일 확장자 확인
    const ext = file.originalname.toLowerCase().split('.').pop();
    const allowedExts = ['mp4', 'mpeg', 'mov', 'avi', 'mkv', 'webm'];

    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('비디오 파일만 업로드 가능합니다. 허용된 확장자: ' + allowedExts.join(', ')));
    }
  }
});

// POST /api/video/analyze - 비디오 분석 엔드포인트
router.post('/analyze', upload.single('video'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '비디오 파일이 필요합니다.'
      });
    }

    // 요청에서 API 키 가져오기 (body 또는 헤더)
    const apiKey = req.body.apiKey || req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API 키가 필요합니다.'
      });
    }

    filePath = req.file.path;

    // 확장자 기반으로 MIME 타입 결정
    const ext = req.file.originalname.toLowerCase().split('.').pop();
    const mimeTypeMap = {
      'mp4': 'video/mp4',
      'mpeg': 'video/mpeg',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      'webm': 'video/webm'
    };
    const mimeType = mimeTypeMap[ext] || req.file.mimetype;

    console.log('📁 업로드된 파일:', req.file.originalname);
    console.log('📏 파일 크기:', (req.file.size / 1024 / 1024).toFixed(2) + 'MB');
    console.log('🎬 MIME 타입:', mimeType);

    // Gemini 분석기 생성 및 분석 실행
    const analyzer = new GeminiVideoAnalyzer(apiKey);
    const result = await analyzer.analyzeVideo(filePath, mimeType);

    console.log('✅ 분석 완료');

    // 임시 파일 삭제
    await fs.unlink(filePath);

    // 결과 반환
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('비디오 분석 에러:', error);

    // 임시 파일 삭제 (에러 발생 시에도)
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        console.error('임시 파일 삭제 실패:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      error: error.message || '비디오 분석 중 오류가 발생했습니다.'
    });
  }
});

// POST /api/video/analyzer-desc - 설명문 개선 엔드포인트
router.post('/analyzer-desc', async (req, res) => {
  try {
    // 요청에서 API 키와 descriptions 가져오기
    const apiKey = req.body.apiKey || req.headers['x-api-key'];
    const descriptions = req.body.descriptions;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API 키가 필요합니다.'
      });
    }

    if (!descriptions || !Array.isArray(descriptions)) {
      return res.status(400).json({
        success: false,
        error: 'descriptions 배열이 필요합니다.'
      });
    }

    if (descriptions.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'descriptions는 5개의 항목이어야 합니다.'
      });
    }

    console.log('📝 설명문 개선 요청');
    console.log('📊 설명문 개수:', descriptions.length);

    // Gemini 설명문 분석기 생성 및 개선 실행
    const analyzer = new GeminiDescriptionAnalyzer(apiKey);
    const result = await analyzer.improveDescriptions(descriptions);

    console.log('✅ 설명문 개선 완료');

    // 결과 반환
    res.json({
      success: true,
      data: result  // { descriptions: [...], full_description: "..." }
    });

  } catch (error) {
    console.error('설명문 개선 에러:', error);

    res.status(500).json({
      success: false,
      error: error.message || '설명문 개선 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
