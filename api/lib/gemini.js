const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;

// Gemini 비디오 분석 클래스
class GeminiVideoAnalyzer {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });
  }

  // 파일을 Base64로 변환
  async fileToBase64(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    return fileBuffer.toString('base64');
  }

  // 기본 프롬프트
  static getDefaultPrompt() {
    return `
영상을 분석하여 주인공 1명을 식별하고 다음 정보를 JSON으로 제공하세요:

## 분석 단계

### 1단계: 주인공 탐지 및 메타 정보 생성
- 영상에서 주인공 1명을 식별
- 주인공의 첫 등장 시간과 간단한 설명 작성
- 영상 전체 길이 정보 기록
- 주인공의 감정이 가장 강렬하게 드러나는 핵심 시점 탐지

### 2단계: 프레임 기반 정밀 분석
** 프레임 분석 방법:**
- **1단계**: 영상을 프레임별로 순차 분석하여 주인공의 감정 변화 추적
- **2단계**: 얼굴에서 감정이 **가장 강렬하고 명확하게** 나타나는 **정확한 타임스탬프(MM:SS.XX 형식)**와 **프레임 번호**를 peak_moment로 설정
- **3단계**: start_time = peak_moment, end_time = peak_moment + 1초로 설정 (1초 구간 표기)
- **4단계**: 해당 시점의 프레임 번호를 frame_number로 기록 (전체 프레임 중 몇 번째인지)

** 감정파악 최우선 분석 순서:**
** 핵심 목적: 주인공의 감정 상태를 가장 명확히 파악할 수 있는 시점 찾기**
1. **감정 표출**: 감정이 얼굴 표정이나 몸짓으로 가장 명확하고 강렬하게 드러나는 순간
2. **표정 변화**: 무표정 → 특정 감정(놀람/기쁨/화남/슬픔 등)으로 변하는 시작 순간
3. **감정적 행동**: 감정에 의해 유발된 행동(울음, 웃음, 한숨, 소리지름 등)이 시작되는 순간
4. **감정적 반응**: 외부 자극에 대한 감정적 반응(놀라서 뒤로 물러나기, 기뻐서 박수치기 등)

** 감정 변화 감지 세부 기준:**
- **눈의 변화**: 눈동자 움직임, 눈 크기 변화, 눈썹 위치 변화
- **입의 변화**: 입꼬리 상승/하강, 입 모양 변화, 입술 떨림
- **이마와 미간**: 주름 생성, 미간 찌푸림, 이마 긴장
- **전체적 표정**: 여러 얼굴 근육의 동시 변화로 만들어지는 감정 표현

** 타임스탬프 정확도 규칙:**
- MM:SS.XX 형식으로 0.1초 단위까지 정확히 측정
- 예시: "02:15.3" (2분 15.3초), "00:03.7" (3.7초)
- 영상 길이 내에서 경계값 체크 필수

** 1초 구간 및 프레임 표기 예시:**
- 영상 20초, 30fps 기준, peak_moment가 03:02(91번째 프레임) → start_time: "00 03.02", end_time: "00 04.02", frame_number: 91, total_frames: 600, fps_used: 30
- 영상 25초, 30fps 기준, peak_moment가 12:15(368번째 프레임) → start_time: "00 12.15", end_time: "00 13.15", frame_number: 368, total_frames: 750, fps_used: 30
- **프레임 계산 방법**:
  * 영상의 실제 프레임레이트(fps)를 먼저 확인
  * 프레임 번호 = 시간(초) × fps
  * 전체 프레임 수 = video_duration(초) × fps
  * 일반적인 값: 24fps(영화), 30fps(TV/웹), 60fps(고화질)
  * 확실하지 않으면 30fps를 기본값으로 사용
- **중요**: end_time = start_time + 1.00초로 설정하여 웹에서 명확히 표시되는 1초 구간 생성
- **경계 체크**: end_time이 video_duration을 초과하면 video_duration으로 조정

### 3단계: VA(Valence-Arousal) 값 라벨링
영상 내 주인공의 특징이 가장 잘 드러난 특정 프레임(subject_time의 peak_moment)을 기준으로 감정의 V, A 값을 라벨링:

- **Valence(V)**: 감정의 긍정/부정 척도
  * 스케일: -3 에서 +3까지 (모두 정수)
  * 음수: 부정적인 감정
  * 양수: 긍정적인 감정
  * 0: 중립

- **Arousal(A)**: 감정의 강도 척도
  * 스케일: -3 에서 +3까지 (모두 정수)
  * 음수: 정도가 약한, 조용한 감정
  * 양수: 격정적이고 강한 감정
  * 0: 중간 강도

예시:
- 화난 표정 (강렬): V=-3, A=+3
- 기쁜 표정 (강렬): V=+3, A=+3
- 편안한 표정: V=+2, A=-1
- 우울한 표정: V=-2, A=-2

### 4단계: 감정 프롬프트 작성 (5문장 구성)
peak_moment 시점의 프레임을 기준으로 다음 5가지 설명문을 작성:

1. **상황 설명**: 배경/분위기와는 별개로 주인공이 처한 상황 설명
2. **배경/분위기**: 배경 분위기, 객체, 색감을 포함
3. **주인공 얼굴 묘사**: 헤어와 얼굴형, 시선, 입매, 고개의 구도, 연령 포함
4. **주인공 의상 묘사**: 의상 스타일, 색감, 패턴을 포함
5. **주인공 행동 묘사**: 손발 등 신체 동작을 포함

** 작성 원칙:**
- 현재 프레임에서 **실제로 관찰되는 내용**만 기술
- 추론이나 추측이 아닌 **시각적으로 확인 가능한 상황**만 포함
- "~하고 있다", "~을 하는" 등 현재 진행형/관형형 사용 권장
- 각 문장은 구체적이고 자세하게 작성
- **영상 내 자막이나 대사에 포함된 말은 설명문에 절대 포함하지 말 것** (예: "야", "잠깐만요", "안녕하세요" 등 실제 대사는 제외)

## 출력 형식

{
  "meta": {
    "main_character": {
      "description": "주인공의 간단한 설명 (어떤 사람인지, 무엇을 하고 있는지)",
      "first_appearance_time": "MM SS.ss"
    },
    "video_duration": "MM SS.ss",
    "subject_time": [
      {
        "start_time": "MM SS.ss",
        "end_time": "MM SS.ss",
        "frame_number": 정수값,
        "total_frames": 정수값,
        "fps_used": 정수값
      }
    ]
  },
  "VA": {
    "valence": 정수값 (-3 ~ +3),
    "arousal": 정수값 (-3 ~ +3)
  },
  "descriptions": [
    {
      "class": "상황 설명",
      "description": "주인공이 처한 상황에 대한 구체적인 설명"
    },
    {
      "class": "배경/분위기",
      "description": "배경, 분위기, 객체, 색감에 대한 설명"
    },
    {
      "class": "주인공 얼굴 묘사",
      "description": "헤어, 얼굴형, 시선, 입매, 고개 구도, 연령 포함"
    },
    {
      "class": "주인공 의상 묘사",
      "description": "의상 스타일, 색감, 패턴에 대한 설명"
    },
    {
      "class": "주인공 행동 묘사",
      "description": "손발 등 신체 동작에 대한 설명"
    }
  ]
}
`;
  }

  // 비디오 분석 요청
  async analyzeVideo(filePath, mimeType) {
    try {
      console.log('비디오 분석 시작:', filePath);

      // 파일을 Base64로 변환
      const base64Data = await this.fileToBase64(filePath);

      // Gemini API 요청
      const prompt = GeminiVideoAnalyzer.getDefaultPrompt();

      console.log('📤 Gemini API 요청 시작');
      console.log('⏰ 요청 시간:', new Date().toLocaleTimeString());

      const requestStartTime = Date.now();
      const result = await this.model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        { text: prompt }
      ]);

      const response = await result.response;
      const text = response.text();
      const requestDuration = Date.now() - requestStartTime;

      console.log('📥 Gemini API 응답 완료');
      console.log('⏱️ 응답 시간:', (requestDuration / 1000).toFixed(2) + '초');
      console.log('🔍 응답 길이:', text.length + '자');

      // JSON 파싱
      const analysisResult = this.parseGeminiResponse(text);
      return analysisResult;

    } catch (error) {
      console.error('비디오 분석 실패:', error);
      throw new Error('비디오 분석에 실패했습니다: ' + error.message);
    }
  }

  // Gemini 응답 파싱
  parseGeminiResponse(responseText) {
    try {
      // 코드블록 제거 (```json ... ``` 형식)
      let cleanedText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // JSON 추출
      const startIndex = cleanedText.indexOf('{');
      const endIndex = cleanedText.lastIndexOf('}');

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('JSON을 찾을 수 없습니다.');
      }

      let jsonString = cleanedText.substring(startIndex, endIndex + 1);

      // 양수 앞 + 기호 제거 (JSON에서 +2는 허용 안됨, 2로 변환)
      jsonString = jsonString.replace(/:\s*\+(\d+)/g, ': $1');

      const analysisResult = JSON.parse(jsonString);

      // descriptions 배열 정규화 (잘못된 형식 수정)
      if (analysisResult.descriptions && Array.isArray(analysisResult.descriptions)) {
        analysisResult.descriptions = analysisResult.descriptions.map(item => {
          // 이미 올바른 형식이면 그대로 반환
          if (item.class && item.description && typeof item.description === 'string') {
            return item;
          }

          // 잘못된 형식 수정: "class명": { "description": "..." } 형태
          // 또는 문자열 키로 된 경우
          if (typeof item === 'object' && !item.class) {
            const keys = Object.keys(item);
            if (keys.length > 0) {
              const className = keys[0];
              const value = item[className];

              // 값이 객체이고 description을 포함하는 경우
              if (typeof value === 'object' && value.description) {
                return {
                  class: className,
                  description: value.description
                };
              }

              // 값이 문자열인 경우
              if (typeof value === 'string') {
                return {
                  class: className,
                  description: value
                };
              }
            }
          }

          return item;
        });
      }

      console.log('분석 결과 파싱 완료');

      return analysisResult;

    } catch (error) {
      console.error('응답 파싱 실패:', error);
      console.error('원본 응답:', responseText);
      throw new Error('API 응답을 파싱할 수 없습니다');
    }
  }
}

module.exports = {
  GeminiVideoAnalyzer
};
