// api/lib/videoMetadata.js

const { execSync } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

/**
 * ffprobe를 사용하여 비디오 메타데이터 추출
 * @param {string} videoPath - 비디오 파일 경로
 * @returns {Object} - { duration, fps, totalFrames, width, height }
 */
function extractVideoMetadata(videoPath) {
  try {
    // ffmpeg 경로
    const ffmpegFullPath = ffmpegPath;

    // ffmpeg를 사용하여 비디오 정보 추출
    // -i 입력 파일만 지정하면 에러 메시지에 메타데이터가 포함됨
    let output;
    try {
      execSync(`"${ffmpegFullPath}" -i "${videoPath}"`, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (error) {
      // ffmpeg는 -i만 사용하면 에러를 반환하지만, stderr에 정보가 있음
      output = error.stderr || error.stdout || '';
    }

    if (!output) {
      throw new Error('ffmpeg 출력을 읽을 수 없습니다.');
    }

    // 출력에서 Duration, fps, 해상도 파싱
    const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
    const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*fps/);
    const resolutionMatch = output.match(/,\s*(\d+)x(\d+)(?:\s*\[|,)/);  // ", 1920x1080 [" 또는 ", 1920x1080," 형식
    const streamMatch = output.match(/Stream.*Video.*/);

    let duration = 0;
    let fps = 30;
    let width = 1920;
    let height = 1080;

    // Duration 파싱 (HH:MM:SS.ms)
    if (durationMatch) {
      const hours = parseInt(durationMatch[1]);
      const minutes = parseInt(durationMatch[2]);
      const seconds = parseFloat(durationMatch[3]);
      duration = hours * 3600 + minutes * 60 + seconds;
    }

    // FPS 파싱
    if (fpsMatch) {
      fps = Math.round(parseFloat(fpsMatch[1]));
    }

    // 해상도 파싱
    if (resolutionMatch) {
      width = parseInt(resolutionMatch[1]);
      height = parseInt(resolutionMatch[2]);
    }

    // 전체 프레임 수 계산
    const totalFrames = Math.round(duration * fps);

    console.log('📹 비디오 메타데이터 추출 완료:');
    console.log(`  - 해상도: ${width}x${height}`);
    console.log(`  - FPS: ${fps}`);
    console.log(`  - Duration: ${duration.toFixed(2)}초`);
    console.log(`  - Total Frames: ${totalFrames}`);

    return {
      duration: parseFloat(duration.toFixed(2)),
      fps,
      totalFrames,
      width,
      height
    };

  } catch (error) {
    console.error('❌ 비디오 메타데이터 추출 실패:', error.message);
    
    // 실패 시 기본값 반환
    return {
      duration: 25.0,
      fps: 30,
      totalFrames: 750,
      width: 1920,
      height: 1080
    };
  }
}

module.exports = {
  extractVideoMetadata
};
