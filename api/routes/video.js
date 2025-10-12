// api/routes/video.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { GeminiVideoAnalyzer } = require('../lib/gemini');
const { GeminiDescriptionAnalyzer } = require('../lib/geminiAnalyzer');
const { captureFrame, getVideoInfo } = require('../lib/frameCapture');

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

    console.log('📁 업로드된 파일:', Buffer.from(req.file.originalname, 'latin1').toString('utf8'));
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
    // 요청에서 API 키, class_type, subject_description 가져오기
    const apiKey = req.body.apiKey || req.headers['x-api-key'];
    const classType = req.body.class_type;
    const subjectDescription = req.body.subject_description;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API 키가 필요합니다.'
      });
    }

    if (!classType || !Array.isArray(classType)) {
      return res.status(400).json({
        success: false,
        error: 'class_type 배열이 필요합니다.'
      });
    }

    if (!subjectDescription || !Array.isArray(subjectDescription)) {
      return res.status(400).json({
        success: false,
        error: 'subject_description 배열이 필요합니다.'
      });
    }

    if (subjectDescription.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'subject_description는 5개의 항목이어야 합니다.'
      });
    }

    console.log('📝 설명문 개선 요청');
    console.log('📊 class_type 항목 수:', classType.length);
    console.log('📊 subject_description 항목 수:', subjectDescription.length);

    // Gemini 설명문 분석기 생성 및 개선 실행
    const analyzer = new GeminiDescriptionAnalyzer(apiKey);
    const result = await analyzer.improveDescriptions(classType, subjectDescription);

    console.log('✅ 설명문 개선 완료');

    // 결과 반환
    res.json({
      success: true,
      data: result  // { subject_description, combined_description }
    });

  } catch (error) {
    console.error('설명문 개선 에러:', error);

    res.status(500).json({
      success: false,
      error: error.message || '설명문 개선 중 오류가 발생했습니다.'
    });
  }
});

// POST /api/video/capture-frame - 프레임 캡처 엔드포인트
router.post('/capture-frame', upload.single('video'), async (req, res) => {
  let filePath = null;
  let capturedImagePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '비디오 파일이 필요합니다.'
      });
    }

    filePath = req.file.path;

    // 요청 파라미터 파싱
    const frameNumber = parseInt(req.body.frameNumber);
    const fps = parseInt(req.body.fps) || 30;
    const bbox1X = parseInt(req.body.bbox1X) || null;
    const bbox1Y = parseInt(req.body.bbox1Y) || null;
    const bbox2X = parseInt(req.body.bbox2X) || null;
    const bbox2Y = parseInt(req.body.bbox2Y) || null;
    const drawOverlay = req.body.drawOverlay === 'true';

    if (isNaN(frameNumber) || frameNumber < 0) {
      return res.status(400).json({
        success: false,
        error: 'frameNumber는 0 이상의 정수여야 합니다.'
      });
    }

    console.log('📸 프레임 캡처 요청');
    console.log('  비디오:', Buffer.from(req.file.originalname, 'latin1').toString('utf8'));
    console.log('  프레임 번호:', frameNumber);
    console.log('  FPS:', fps);
    if (bbox1X !== null && bbox1Y !== null && bbox2X !== null && bbox2Y !== null) {
      console.log('  바운딩 박스:', `[{x: ${bbox1X}, y: ${bbox1Y}}, {x: ${bbox2X}, y: ${bbox2Y}}]`);
    }

    // 프레임 캡처 - 2개의 포인트로 바운딩 박스 구성
    const bbox = (bbox1X !== null && bbox1Y !== null && bbox2X !== null && bbox2Y !== null)
      ? [{x: bbox1X, y: bbox1Y}, {x: bbox2X, y: bbox2Y}]
      : null;
    capturedImagePath = await captureFrame({
      videoPath: filePath,
      frameNumber,
      fps,
      bbox,
      drawOverlay
    });

    console.log('✅ 프레임 캡처 완료:', capturedImagePath);

    // 이미지 파일을 Base64로 인코딩하여 응답
    const imageBuffer = await fs.readFile(capturedImagePath);
    const imageBase64 = imageBuffer.toString('base64');

    console.log('📦 이미지 인코딩 완료 (크기:', (imageBase64.length / 1024).toFixed(2), 'KB)');

    // 비디오 임시 파일 삭제 (캡처된 이미지는 /tmp/uploads에 보관)
    await fs.unlink(filePath);
    console.log('💾 캡처 이미지 저장됨:', capturedImagePath);

    const responseData = {
      success: true,
      data: {
        frameNumber,
        fps,
        bbox,
        image: `data:image/png;base64,${imageBase64}`,
        resolution: '1920x1080'
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('프레임 캡처 에러:', error);

    // 임시 파일 삭제
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (e) {}
    }
    if (capturedImagePath) {
      try {
        await fs.unlink(capturedImagePath);
      } catch (e) {}
    }

    res.status(500).json({
      success: false,
      error: error.message || '프레임 캡처 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
