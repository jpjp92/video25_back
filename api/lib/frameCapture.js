// api/lib/frameCapture.js

const { execFile, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const sharp = require('sharp');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/**
 * 비디오에서 특정 프레임을 1920x1080 해상도로 캡처
 *
 * @param {Object} options - 캡처 옵션
 * @param {string} options.videoPath - 비디오 파일 경로
 * @param {number} options.frameNumber - 캡처할 프레임 번호
 * @param {number} options.fps - 비디오 FPS (기본값: 30)
 * @param {Array} options.bbox - 주인공 바운딩 박스 [{x, y}, {x, y}]
 * @param {string} options.outputPath - 출력 이미지 경로 (선택사항)
 * @param {boolean} options.drawOverlay - 바운딩 박스 표시 여부 (기본값: false)
 * @returns {Promise<string>} 캡처된 이미지 파일 경로
 */
async function captureFrame(options) {
  const {
    videoPath,
    frameNumber,
    fps = 30,
    bbox = null,
    outputPath = null,
    drawOverlay = false
  } = options;

  // 프레임 번호를 시간(초)으로 변환
  const timeSec = frameNumber / fps;

  // 출력 파일 경로 설정 - 프로젝트 내 tmp/uploads 디렉토리 사용
  const uploadsDir = path.join(__dirname, '../../tmp/uploads');
  const outputFile = outputPath || path.join(
    uploadsDir,
    `frame_${frameNumber}_${Date.now()}.png`
  );

  try {
    // 출력 디렉토리가 존재하는지 확인 (없으면 생성)
    if (!outputPath) {
      await fs.mkdir(uploadsDir, { recursive: true });
    }
    // ffmpeg 명령어로 프레임 캡처 (1920x1080으로 리사이징)
    const ffmpegArgs = [
      '-ss', timeSec.toFixed(3), // 시간 위치
      '-i', videoPath, // 입력 파일
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2', // 1920x1080으로 리사이징 (비율 유지)
      '-frames:v', '1', // 1프레임만 캡처
      '-y', // 덮어쓰기
      outputFile
    ];

    console.log('📸 프레임 캡처 시작');
    console.log('  프레임 번호:', frameNumber);
    console.log('  시간:', timeSec.toFixed(3), '초');
    console.log('  해상도: 1920x1080');

    await execFileAsync(ffmpegPath, ffmpegArgs);

    console.log('✅ 프레임 캡처 완료:', outputFile);

    // 오버레이 그리기 (요청된 경우)
    if (drawOverlay && bbox) {
      await drawBboxOverlay(outputFile, bbox, frameNumber, fps, timeSec);
    }

    return outputFile;

  } catch (error) {
    console.error('프레임 캡처 실패:', error);
    throw new Error(`프레임 캡처 실패: ${error.message}`);
  }
}

/**
 * 캡처된 이미지에 바운딩 박스 그리기
 * Sharp를 사용하여 SVG 오버레이 추가
 */
async function drawBboxOverlay(imagePath, bbox, frameNumber, fps, timeSec) {
  try {
    // bbox가 배열인지 확인 (2개의 좌표)
    if (!Array.isArray(bbox) || bbox.length !== 2) {
      console.warn('⚠️ bbox는 2개의 좌표 배열이어야 합니다.');
      return;
    }

    const [point1, point2] = bbox;
    const x1 = point1.x;
    const y1 = point1.y;
    const x2 = point2.x;
    const y2 = point2.y;

    const width = x2 - x1;
    const height = y2 - y1;

    // SVG로 바운딩 박스와 라벨 생성
    const svg = `
      <svg width="1920" height="1080">
        <!-- 빨간 바운딩 박스 (두껍게) -->
        <rect x="${x1}" y="${y1}" width="${width}" height="${height}"
              fill="none" stroke="red" stroke-width="4"/>

        <!-- 좌상단 포인트 마커 -->
        <circle cx="${x1}" cy="${y1}" r="8"
                fill="red" stroke="white" stroke-width="2"/>

        <!-- 우하단 포인트 마커 -->
        <circle cx="${x2}" cy="${y2}" r="8"
                fill="red" stroke="white" stroke-width="2"/>

        <!-- 정보 라벨 배경 -->
        <rect x="10" y="10" width="400" height="70"
              fill="rgba(0,0,0,0.7)" rx="5"/>

        <!-- 정보 텍스트 -->
        <text x="20" y="35"
              font-family="Arial, sans-serif"
              font-size="18"
              font-weight="bold"
              fill="white">
          BBox: (${x1}, ${y1}) → (${x2}, ${y2})
        </text>
        <text x="20" y="55"
              font-family="Arial, sans-serif"
              font-size="14"
              fill="white">
          Size: ${width}×${height}px
        </text>
        <text x="20" y="70"
              font-family="Arial, sans-serif"
              font-size="14"
              fill="white">
          t=${timeSec.toFixed(1)}s, f=${frameNumber} @${fps}fps
        </text>
      </svg>
    `;

    // Sharp를 사용하여 이미지에 SVG 오버레이 합성
    await sharp(imagePath)
      .composite([{
        input: Buffer.from(svg),
        top: 0,
        left: 0
      }])
      .toFile(imagePath + '.tmp');

    // 원본 파일을 새 파일로 교체
    await fs.rename(imagePath + '.tmp', imagePath);

    console.log('✅ 오버레이 그리기 완료');

  } catch (error) {
    console.warn('⚠️ 오버레이 그리기 실패:', error.message);
    // 오버레이 실패는 치명적이지 않으므로 무시
  }
}

/**
 * 비디오 정보 추출 (해상도, FPS 등)
 */
async function getVideoInfo(videoPath) {
  try {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of json "${videoPath}"`;
    const { stdout } = await execAsync(cmd);
    const info = JSON.parse(stdout);

    const stream = info.streams[0];
    const width = stream.width;
    const height = stream.height;

    // FPS 계산 (r_frame_rate는 "30000/1001" 같은 형식)
    const [num, den] = stream.r_frame_rate.split('/').map(Number);
    const fps = Math.round(num / den);

    return { width, height, fps };
  } catch (error) {
    console.error('비디오 정보 추출 실패:', error);
    return { width: 1920, height: 1080, fps: 30 }; // 기본값
  }
}

/**
 * 캡처된 이미지 삭제
 */
async function deleteCapturedFrame(imagePath) {
  try {
    await fs.unlink(imagePath);
    console.log('🗑️ 캡처 이미지 삭제:', imagePath);
  } catch (error) {
    console.warn('캡처 이미지 삭제 실패:', error.message);
  }
}

module.exports = {
  captureFrame,
  getVideoInfo,
  deleteCapturedFrame
};
