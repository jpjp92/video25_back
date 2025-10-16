// api/lib/faceLandmarks.js

const tf = require('@tensorflow/tfjs-node');
const blazeface = require('@tensorflow-models/blazeface');

// 얼굴 탐지 클래스 (BlazeFace 사용)
class FaceLandmarksDetector {
  constructor() {
    this.model = null;
  }

  // 모델 로드
  async loadModel() {
    if (this.model) return;

    console.log('🔄 BlazeFace 모델 로딩 중...');

    this.model = await blazeface.load();

    console.log('✅ BlazeFace 모델 로드 완료');
  }

  /**
   * 이미지에서 얼굴 탐지
   * @param {string} imagePath - 이미지 파일 경로
   * @returns {Promise<Array>} 탐지된 얼굴들의 정보
   */
  async detectFaces(imagePath) {
    if (!this.model) {
      await this.loadModel();
    }

    console.log('🔍 얼굴 탐지 시작:', imagePath);

    // Node.js에서 이미지 파일을 Buffer로 읽기
    const fs = require('fs').promises;
    const imageBuffer = await fs.readFile(imagePath);

    // TensorFlow 텐서로 변환 (Node.js용)
    const tensor = tf.node.decodeImage(imageBuffer, 3); // 3 = RGB

    // 얼굴 탐지 (returnTensors: false로 일반 배열 반환)
    const predictions = await this.model.estimateFaces(tensor, false);

    // 텐서 정리
    tensor.dispose();

    console.log(`✅ ${predictions.length}개의 얼굴 탐지됨`);

    return predictions;
  }

  /**
   * 얼굴 크기 계산 (화면에서 차지하는 비율)
   * @param {Object} face - 탐지된 얼굴 객체
   * @returns {number} 얼굴 크기 (픽셀 면적)
   */
  getFaceSize(face) {
    // BlazeFace는 topLeft, bottomRight 좌표로 반환
    const width = face.bottomRight[0] - face.topLeft[0];
    const height = face.bottomRight[1] - face.topLeft[1];
    return width * height;
  }

  /**
   * 가장 큰 얼굴 찾기 (주인공)
   * @param {Array} faces - 탐지된 얼굴들
   * @returns {Object|null} 가장 큰 얼굴 객체
   */
  getLargestFace(faces) {
    if (!faces || faces.length === 0) return null;

    return faces.reduce((largest, current) => {
      const largestSize = this.getFaceSize(largest);
      const currentSize = this.getFaceSize(current);
      return currentSize > largestSize ? current : largest;
    });
  }

  /**
   * 코 중심점 좌표 추출
   * BlazeFace는 6개의 랜드마크를 제공:
   * - 0, 1: 오른쪽 눈
   * - 2, 3: 왼쪽 눈
   * - 4: 코
   * - 5: 입
   * @param {Object} face - 탐지된 얼굴 객체
   * @returns {Object} {x, y} 코 중심 좌표
   */
  getNoseCenter(face) {
    // BlazeFace의 landmarks 배열
    const landmarks = face.landmarks;

    if (landmarks && landmarks.length >= 5) {
      // 인덱스 4가 코
      const nose = landmarks[4];
      return {
        x: Math.round(nose[0]),
        y: Math.round(nose[1])
      };
    }

    // 폴백: 얼굴 박스 중심 사용
    console.warn('⚠️ 코 랜드마크를 찾을 수 없습니다. 얼굴 중심을 사용합니다.');
    const centerX = (face.topLeft[0] + face.bottomRight[0]) / 2;
    const centerY = (face.topLeft[1] + face.bottomRight[1]) / 2;

    return {
      x: Math.round(centerX),
      y: Math.round(centerY)
    };
  }

  /**
   * 이미지에서 주인공의 코 중심 좌표 추출
   * @param {string} imagePath - 이미지 파일 경로
   * @returns {Promise<Object>} {x, y, faceCount} 코 중심 좌표 및 탐지된 얼굴 수
   */
  async extractNosePosition(imagePath) {
    try {
      // 얼굴 탐지
      const faces = await this.detectFaces(imagePath);

      if (faces.length === 0) {
        throw new Error('이미지에서 얼굴을 찾을 수 없습니다.');
      }

      // 가장 큰 얼굴 (주인공) 선택
      const mainFace = this.getLargestFace(faces);
      console.log('👤 주인공 얼굴 선택됨 (크기:', this.getFaceSize(mainFace), '픽셀²)');

      // 코 중심 좌표 추출
      const nosePosition = this.getNoseCenter(mainFace);
      console.log('👃 코 중심 좌표:', nosePosition);

      return {
        x: nosePosition.x,
        y: nosePosition.y,
        faceCount: faces.length,
        faceBox: {
          topLeft: mainFace.topLeft,
          bottomRight: mainFace.bottomRight
        } // 디버깅용
      };

    } catch (error) {
      console.error('❌ 코 위치 추출 실패:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스
let detectorInstance = null;

/**
 * FaceLandmarksDetector 싱글톤 인스턴스 가져오기
 * @returns {FaceLandmarksDetector}
 */
function getDetector() {
  if (!detectorInstance) {
    detectorInstance = new FaceLandmarksDetector();
  }
  return detectorInstance;
}

module.exports = {
  FaceLandmarksDetector,
  getDetector
};
