// test_frame_div.js - frame_div.js 테스트 스크립트

const frameDivider = require('./api/lib/frame_div');
const path = require('path');
const fs = require('fs');

async function testFrameDivider() {
  // 명령줄 인자에서 비디오 파일명 가져오기
  const videoFileName = process.argv[2];

  if (!videoFileName) {
    console.error('❌ 사용법: node test_frame_div.js <비디오파일명>');
    console.error('예시: node test_frame_div.js "나는 솔로_12분 16초.mp4"');
    process.exit(1);
  }

  // 테스트할 비디오 경로
  const videoPath = path.join(__dirname, videoFileName);

  // 파일 존재 여부 확인
  if (!fs.existsSync(videoPath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${videoPath}`);
    process.exit(1);
  }

  console.log('========================================');
  console.log('🧪 frame_div.js 테스트 시작');
  console.log(`📹 비디오 파일: ${videoFileName}`);
  console.log('========================================\n');

  try {
    // 1. 비디오 메타데이터 계산 테스트
    console.log('1️⃣ 비디오 메타데이터 계산 테스트');
    console.log('----------------------------------------');
    const metadata = await frameDivider.calculateTotalFrames(videoPath);
    console.log('\n');

    // 2. 프레임 샘플링 테스트 (30프레임마다 1개 추출)
    console.log('2️⃣ 프레임 샘플링 테스트 (30프레임마다 1개)');
    console.log('----------------------------------------');
    const sampledResult = await frameDivider.sampleFrames({
      videoPath: videoPath,
      interval: 30,
      format: 'jpg',
      resize: true
    });
    console.log(`\n📂 샘플링 결과 디렉토리: ${sampledResult.outputDir}`);
    console.log(`📊 분할된 프레임 수: ${sampledResult.totalFrames}\n`);

    // 선택사항: 모든 프레임 추출 (시간이 오래 걸릴 수 있음)
    console.log('3️⃣ 모든 프레임 추출 테스트');
    console.log('----------------------------------------');
    const allFramesResult = await frameDivider.extractAllFrames({
      videoPath: videoPath,
      format: 'jpg',
      resize: true
    });
    console.log(`\n📂 전체 프레임 디렉토리: ${allFramesResult.outputDir}`);
    console.log(`📊 분할된 프레임 수: ${allFramesResult.totalFrames}\n`);

    console.log('========================================');
    console.log('✅ 프레임 분할 완료!');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error.message);
    console.error(error);
  }
}

// 테스트 실행
testFrameDivider();
