// api/lib/frame_div.js

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

const execFileAsync = promisify(execFile);

/**
 * 비디오의 총 프레임 수 및 메타데이터 계산
 *
 * @param {string} videoPath - 비디오 파일 경로
 * @returns {Promise<Object>} 비디오 메타데이터
 * {
 *   totalFrames: number,    // 총 프레임 수
 *   fps: number,            // FPS
 *   duration: number,       // 총 재생시간(초)
 *   width: number,          // 가로 해상도
 *   height: number          // 세로 해상도
 * }
 */
async function calculateTotalFrames(videoPath) {
  try {
    // ffprobe로 비디오 정보 추출
    const ffprobeArgs = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_frames',
      '-show_entries', 'stream=nb_read_frames,r_frame_rate,duration,width,height',
      '-of', 'json',
      videoPath
    ];

    const { stdout } = await execFileAsync(ffprobePath, ffprobeArgs);
    const info = JSON.parse(stdout);
    const stream = info.streams[0];

    // FPS 계산 (r_frame_rate는 "30000/1001" 같은 형식)
    const [num, den] = stream.r_frame_rate.split('/').map(Number);
    const fps = num / den;

    // 총 프레임 수 계산
    const totalFrames = parseInt(stream.nb_read_frames) ||
                        Math.floor(parseFloat(stream.duration) * fps);

    const metadata = {
      totalFrames,
      fps: Math.round(fps * 100) / 100, // 소수점 2자리까지
      duration: parseFloat(stream.duration),
      width: stream.width,
      height: stream.height
    };

    console.log('📊 비디오 메타데이터:');
    console.log(`  총 프레임 수: ${metadata.totalFrames}`);
    console.log(`  FPS: ${metadata.fps}`);
    console.log(`  재생시간: ${metadata.duration.toFixed(2)}초`);
    console.log(`  해상도: ${metadata.width}x${metadata.height}`);

    return metadata;

  } catch (error) {
    console.error('비디오 메타데이터 추출 실패:', error);
    throw new Error(`비디오 메타데이터 추출 실패: ${error.message}`);
  }
}

/**
 * 비디오에서 모든 프레임을 이미지로 추출
 *
 * @param {Object} options - 추출 옵션
 * @param {string} options.videoPath - 비디오 파일 경로
 * @param {string} options.outputDir - 출력 디렉토리 (선택사항, 기본: tmp/frame_images)
 * @param {string} options.format - 이미지 포맷 (선택사항, 기본: 'png')
 * @param {number} options.scale - 스케일 비율 (선택사항, 기본: 1.0 - 원본 크기)
 * @param {number} options.quality - 이미지 품질 (1-31, 낮을수록 좋음, jpg만 해당)
 * @param {boolean} options.resize - 1920x1080으로 리사이즈 여부 (선택사항, 기본: false)
 * @returns {Promise<Object>} 추출 결과
 * {
 *   outputDir: string,        // 출력 디렉토리
 *   totalFrames: number,      // 추출된 프레임 수
 *   metadata: Object,         // 비디오 메타데이터
 *   frameFiles: Array<string> // 프레임 파일 경로 목록
 * }
 */
async function extractAllFrames(options) {
  const {
    videoPath,
    outputDir = null,
    format = 'png',
    scale = 1.0,
    quality = 2,
    resize = false
  } = options;

  try {
    // 비디오 메타데이터 먼저 계산
    console.log('📹 비디오 메타데이터 추출 중...');
    const metadata = await calculateTotalFrames(videoPath);

    // 출력 디렉토리 설정
    const baseDir = outputDir || path.join(__dirname, '../../tmp/frame_images');
    const timestamp = Date.now();
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const finalOutputDir = path.join(baseDir, `${videoName}_${timestamp}`);

    // 출력 디렉토리 생성
    await fs.mkdir(finalOutputDir, { recursive: true });
    console.log(`📁 출력 디렉토리 생성: ${finalOutputDir}`);

    // ffmpeg 필터 설정
    let videoFilter = '';
    if (resize) {
      // 1920x1080으로 리사이징 (비율 유지, 패딩)
      videoFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
    } else if (scale !== 1.0) {
      // 스케일 적용
      videoFilter = `scale=iw*${scale}:ih*${scale}`;
    }

    // 출력 파일 패턴
    const outputPattern = path.join(finalOutputDir, `frame_%06d.${format}`);

    // ffmpeg 명령어 구성
    const ffmpegArgs = [
      '-i', videoPath,
      '-vsync', '0', // 모든 프레임 추출 (프레임 드롭 방지)
    ];

    // 비디오 필터 추가
    if (videoFilter) {
      ffmpegArgs.push('-vf', videoFilter);
    }

    // 이미지 포맷별 품질 설정
    if (format === 'jpg' || format === 'jpeg') {
      ffmpegArgs.push('-q:v', quality.toString());
    } else if (format === 'png') {
      ffmpegArgs.push('-compression_level', '6'); // PNG 압축 레벨
    }

    ffmpegArgs.push(outputPattern);

    console.log('🎬 프레임 추출 시작...');
    console.log(`  비디오: ${path.basename(videoPath)}`);
    console.log(`  예상 프레임 수: ${metadata.totalFrames}`);
    console.log(`  포맷: ${format}`);
    console.log(`  스케일: ${scale}`);
    if (resize) console.log('  리사이즈: 1920x1080');

    // 프레임 추출 실행
    const startTime = Date.now();
    await execFileAsync(ffmpegPath, ffmpegArgs);
    const endTime = Date.now();
    const elapsedSec = (endTime - startTime) / 1000;

    // 추출된 프레임 파일 목록 확인
    const files = await fs.readdir(finalOutputDir);
    const frameFiles = files
      .filter(file => file.startsWith('frame_') && file.endsWith(`.${format}`))
      .sort()
      .map(file => path.join(finalOutputDir, file));

    console.log(`✅ 프레임 추출 완료!`);
    console.log(`  추출된 프레임 수: ${frameFiles.length}`);
    console.log(`  소요 시간: ${elapsedSec.toFixed(2)}초`);
    console.log(`  평균 속도: ${(frameFiles.length / elapsedSec).toFixed(2)} 프레임/초`);

    return {
      outputDir: finalOutputDir,
      totalFrames: frameFiles.length,
      metadata,
      frameFiles
    };

  } catch (error) {
    console.error('프레임 추출 실패:', error);
    throw new Error(`프레임 추출 실패: ${error.message}`);
  }
}

/**
 * 비디오에서 특정 간격으로 프레임 샘플링하여 추출
 *
 * @param {Object} options - 샘플링 옵션
 * @param {string} options.videoPath - 비디오 파일 경로
 * @param {number} options.interval - 프레임 추출 간격 (예: 30이면 30프레임마다 1개 추출)
 * @param {string} options.outputDir - 출력 디렉토리 (선택사항)
 * @param {string} options.format - 이미지 포맷 (선택사항, 기본: 'png')
 * @param {boolean} options.resize - 1920x1080으로 리사이즈 여부 (선택사항, 기본: false)
 * @returns {Promise<Object>} 샘플링 결과
 */
async function sampleFrames(options) {
  const {
    videoPath,
    interval,
    outputDir = null,
    format = 'png',
    resize = false
  } = options;

  try {
    // 비디오 메타데이터 추출
    console.log('📹 비디오 메타데이터 추출 중...');
    const metadata = await calculateTotalFrames(videoPath);

    // 출력 디렉토리 설정
    const baseDir = outputDir || path.join(__dirname, '../../tmp/frame_images');
    const timestamp = Date.now();
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const finalOutputDir = path.join(baseDir, `${videoName}_sampled_${timestamp}`);

    // 출력 디렉토리 생성
    await fs.mkdir(finalOutputDir, { recursive: true });
    console.log(`📁 출력 디렉토리 생성: ${finalOutputDir}`);

    // 샘플링할 프레임 수 계산
    const sampledCount = Math.ceil(metadata.totalFrames / interval);
    console.log(`🎯 샘플링 정보:`);
    console.log(`  총 프레임: ${metadata.totalFrames}`);
    console.log(`  샘플링 간격: ${interval} 프레임`);
    console.log(`  추출 예정: 약 ${sampledCount} 프레임`);

    // ffmpeg 필터 설정
    let videoFilter = `select='not(mod(n\\,${interval}))'`;
    if (resize) {
      videoFilter += ',scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
    }

    // 출력 파일 패턴
    const outputPattern = path.join(finalOutputDir, `frame_%06d.${format}`);

    // ffmpeg 명령어 구성
    const ffmpegArgs = [
      '-i', videoPath,
      '-vf', videoFilter,
      '-vsync', '0'
    ];

    if (format === 'jpg' || format === 'jpeg') {
      ffmpegArgs.push('-q:v', '2');
    }

    ffmpegArgs.push(outputPattern);

    console.log('🎬 프레임 샘플링 시작...');
    const startTime = Date.now();
    await execFileAsync(ffmpegPath, ffmpegArgs);
    const endTime = Date.now();
    const elapsedSec = (endTime - startTime) / 1000;

    // 추출된 프레임 파일 목록 확인
    const files = await fs.readdir(finalOutputDir);
    const frameFiles = files
      .filter(file => file.startsWith('frame_') && file.endsWith(`.${format}`))
      .sort()
      .map(file => path.join(finalOutputDir, file));

    console.log(`✅ 프레임 샘플링 완료!`);
    console.log(`  추출된 프레임 수: ${frameFiles.length}`);
    console.log(`  소요 시간: ${elapsedSec.toFixed(2)}초`);

    return {
      outputDir: finalOutputDir,
      totalFrames: frameFiles.length,
      interval,
      metadata,
      frameFiles
    };

  } catch (error) {
    console.error('프레임 샘플링 실패:', error);
    throw new Error(`프레임 샘플링 실패: ${error.message}`);
  }
}

/**
 * 추출된 프레임 디렉토리 삭제
 *
 * @param {string} outputDir - 삭제할 디렉토리 경로
 */
async function deleteFrameDirectory(outputDir) {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`🗑️ 프레임 디렉토리 삭제: ${outputDir}`);
  } catch (error) {
    console.warn('프레임 디렉토리 삭제 실패:', error.message);
  }
}

module.exports = {
  calculateTotalFrames,
  extractAllFrames,
  sampleFrames,
  deleteFrameDirectory
};
