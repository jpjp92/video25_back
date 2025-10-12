// api/lib/gemini.js

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
    const { categoryData, categoryLabels } = require('./categories');

    // 카테고리 정보를 프롬프트용 텍스트로 변환
    let categoriesText = '';
    for (const [key, items] of Object.entries(categoryData)) {
      const koreanName = categoryLabels[key] || key;
      const labels = items.map(item => item.label).join(', ');
      categoriesText += `- **${key}** (${koreanName}): ${labels}\n`;
    }

    return `
영상을 분석하여 주인공 1명을 식별하고 다음 정보를 JSON으로 제공하세요:

## 사전 검증 (매우 중요!)

**영상에 분석 가능한 주인공이 있는지 먼저 확인:**
1. **인물이 있는가?** 영상에 사람이 전혀 없으면 → 에러 반환
2. **식별 가능한 크기인가?** 사람이 너무 멀리 있거나 작아서 얼굴/표정/복장을 식별할 수 없으면 → 에러 반환
3. **주인공으로 삼을 만한 인물이 있는가?** 배경에 지나가는 사람만 있고 주인공이 될 만한 인물이 없으면 → 에러 반환

**에러 조건에 해당하는 경우 다음 JSON 형식으로 반환:**
{
  "error": true,
  "message": "주인공으로 삼을 만한 인물이 영상에 없습니다."
}

**위 조건을 통과한 경우에만 아래 분석 단계 진행:**

## 분석 단계

### 1단계: 주인공 탐지 및 메타 정보 생성
- 영상에서 주인공 1명을 식별 (얼굴/표정/복장이 명확히 보이는 인물)
- 주인공의 첫 등장 시간을 **반드시 초 단위 숫자(float)**로 기록 (예: 0.0, 2.5, 10.3) - **절대 "MM:SS" 형식 사용 금지**
- 영상 전체 길이 정보를 **반드시 초 단위 숫자(float)**로 기록 (예: 21.8, 45.2, 22.96) - **절대 "MM:SS" 형식 사용 금지**
- **중요**: 시간은 모두 "초" 단위로만 표현하세요. 예를 들어 2분 22.96초는 "2:22.96"이 아니라 "142.96"입니다.
- 주인공의 감정이 가장 강렬하게 드러나는 핵심 시점 탐지

### 2단계: 프레임 기반 정밀 분석 (subject_time)
- 영상을 프레임별로 순차 분석하여 주인공의 감정 변화 추적
- 주인공의 얼굴/표정/특징이 **가장 명확하고 선명하게** 보이는 시점 찾기 (손/도구/사물만 보이는 컷 제외)
- 감정이 **가장 강렬하고 명확하게** 나타나는 시점을 peak_moment로 설정
- start_time = peak_moment, end_time = peak_moment + 1.0초 (1초 구간)
- 모든 시간 값은 **float 형식의 초 단위**로 기록 (예: 8.4, 9.4)

**프레임 정보 계산 (매우 중요!):**
- fps_used: 영상의 실제 프레임레이트 (불확실 시 30 사용)
- **frame_number**: 주인공의 얼굴/표정/특징이 가장 명확하게 보이는 **정확한 프레임 번호**
  * 단순히 start_time × fps로 계산하지 말고, 실제 분석한 프레임 번호를 정확히 기록
  * 예: 8.5초 시점을 분석했다면 frame_number = 255 (8.5 × 30)
- total_frames: video_duration × fps_used (반올림)

**bbox (주인공 바운딩 박스) - 2개의 픽셀 좌표로 표현 (매우 중요!):**
- 주인공을 감싸는 사각형 영역의 **좌상단**과 **우하단** 두 점으로 표현
- 영상 해상도를 기준으로 실제 픽셀 좌표로 표현
- 형식: [{x: 픽셀값, y: 픽셀값}, {x: 픽셀값, y: 픽셀값}]

**bbox 설정 3단계 프로세스 (반드시 순서대로 실행!):**

**STEP 1: 주인공의 정확한 중심점 찾기**
1. 주인공의 **얼굴 중심**(코/미간)의 x 좌표를 정확히 파악
2. 이 x 좌표를 center_x라고 기록
3. 주인공의 **머리 끝부터 상반신 하단**까지의 y 범위 파악

**STEP 2: bbox 너비/높이 결정**
1. **너비 계산**:
   - 주인공의 어깨 너비 × 1.3배 (양쪽 여백 포함)
   - 최소 500px 이상 확보
   - 손에 든 물건도 완전히 포함되도록

2. **높이 계산**:
   - 머리 끝 ~ 상반신 하단(허리/엉덩이)
   - 위아래 약간의 여백 포함

**STEP 3: bbox 좌표 계산 (중심 기준)**
1. **x1 (좌상단 x)** = center_x - (너비 / 2)
2. **x2 (우하단 x)** = center_x + (너비 / 2)
3. **검증**: (x1 + x2) / 2 = center_x 인지 확인
4. **y1, y2** = 머리 위 여백 ~ 상반신 하단 여백

**반드시 지킬 규칙:**
- ✅ **좌우 대칭**: 주인공 중심에서 왼쪽 거리 = 오른쪽 거리
- ✅ **완전 포함**: 주인공의 모든 부분(머리, 팔, 손, 물건) 포함
- ❌ **배경 과다**: 왼쪽/오른쪽에 배경만 많이 포함된 경우
- ❌ **인물 잘림**: 주인공의 일부가 bbox 밖으로 나간 경우
- ❌ **치우침**: 주인공이 bbox의 왼쪽 또는 오른쪽에 몰린 경우

**검증 체크리스트:**
1. [ ] 주인공의 얼굴 중심이 bbox 가로 중심선에 위치?
2. [ ] 왼쪽 여백과 오른쪽 여백이 거의 같음?
3. [ ] 주인공의 모든 부분이 bbox 안에 포함?
4. [ ] 불필요한 배경이 최소화됨?

**구체적 예시**:
   - ❌ 잘못된 bbox: 얼굴만 포함, 배경만 포함, 주인공 잘림
   - ✅ 올바른 bbox: 머리~상반신 전체, 적절한 여백, 중앙 배치

   1920×1080 영상에서 주인공(상반신)이 화면 중앙에 있다면:
   * [{x: 600, y: 150}, {x: 1320, y: 900}] (좌상단, 우하단 순서)
   * 너비: 720px, 높이: 750px (충분한 크기)

### 3단계: 카테고리 분류 (class_type)
아래 모든 카테고리에서 주인공에 가장 적합한 label을 정확히 선택하세요:

${categoriesText}

**감정 분류 일관성 규칙 (매우 중요!):**

긍정 감정 (EmomainCategory: "긍정"):
- class 1: 즐거움 - 기쁘고 유쾌한 감정, 웃음이나 미소, 밝은 표정
- class 2: 열의 - 열정적이고 의욕적인 감정, 적극적이고 활기찬 모습
- class 3: 평온 - 차분하고 안정된 감정, 편안하고 여유로운 표정

부정 감정 (EmomainCategory: "부정"):
- class 4: 분노 - 화나고 짜증난 감정, 찡그린 얼굴, 격양된 표정
- class 5: 불안 - 걱정되고 긴장된 감정, 불안하고 초조한 모습
- class 6: 슬픔 - 슬프고 우울한 감정, 침울하고 기운 없는 표정

중립 감정 (EmomainCategory: "중립"):
- class 7: 중립 - 특별한 감정 표현이 없는 평상시 상태

**필수 규칙:**
- EmomainCategory가 "긍정"이면 EmoCategory는 class 1~3 (즐거움, 열의, 평온) 중 선택
- EmomainCategory가 "부정"이면 EmoCategory는 class 4~6 (분노, 불안, 슬픔) 중 선택
- EmomainCategory가 "중립"이면 EmoCategory는 반드시 "중립" (class 7)

**감정 분석 시 상황 컨텍스트 반드시 고려 (매우 중요!):**
- **눈물/울먹임이 보여도 상황에 따라 긍정/부정 판단:**
  * 긍정 상황 (수상, 시상식, 결혼식, 재회, 감동적인 선물 등) + 눈물/울먹임 = **긍정** (감격, 즐거움 또는 열의)
  * 부정 상황 (이별, 사고, 슬픈 소식, 싸움, 실패 등) + 눈물/울먹임 = **부정** (슬픔)
- **상황별 감정 분류 예시:**
  * 시상식에서 수상 소감 말하며 울먹임 → EmomainCategory: "긍정", EmoCategory: "즐거움" 또는 "열의"
  * 결혼식에서 감격하며 눈물 흘림 → EmomainCategory: "긍정", EmoCategory: "즐거움"
  * 이별 장면에서 울며 안타까워함 → EmomainCategory: "부정", EmoCategory: "슬픔"
  * 사고 소식 듣고 충격받아 울음 → EmomainCategory: "부정", EmoCategory: "슬픔"
- **반드시 '상황' 먼저 파악 → 그 다음 표정/눈물 분석 → 최종 감정 분류 결정**

### 4단계: 구조화된 설명문 작성 (subject_description)
총 5개의 설명문을 작성하세요. **카테고리명은 {{}}로 유지**하고, 구체적 내용은 실제 분석 결과로 작성:

1. **상황 (category: "상황")**
   - 형식: "본 영상은 {{Male/Female}}가 [행동/상황]하는 장면이다."
   - 예시:
     * "본 영상은 {{Male/Female}}가 인터뷰 중 자신의 생각과 감정을 표현하는 장면이다."
     * "본 영상은 {{Male/Female}}가 식사하며 웃음을 나누는 장면이다."
     * "본 영상은 {{Male/Female}}의 결혼식 장면이다."
     * "본 영상은 {{Male/Female}}가 운동하는 장면이다."
     * "본 영상은 {{Male/Female}}가 업무 중 스트레스를 받는 장면이다."
   - 템플릿: "본 영상은 {{Male/Female}}가 [실제 영상의 행동/상황]하는 장면이다."

2. **위치 (category: "위치")**
   - 형식: "[성별]는 화면의 [위치]에 위치하고 있다."
   - 예시: "여자는 화면의 중앙에 위치하고 있다.", "남자는 화면의 왼쪽 상단에 위치하고 있다."
   - 템플릿: "{{Male/Female}}는 화면의 [구체적 위치]에 위치하고 있다."
   - 위치 표현: 중앙, 왼쪽, 오른쪽, 상단, 하단, 좌상단, 우상단, 좌하단, 우하단 등

3. **얼굴 (category: "얼굴")**
   - 형식: "[행동]하는 [성별]는 [얼굴형] 얼굴, [눈 모양] 눈, [코 모양] 코, [입 모양] 입을 가지고 있다."
   - 예시: "결혼하는 여자는 둥근형 얼굴, 수평형 눈, 직선형 코, 곡선형 입을 가지고 있다."
   - 템플릿: "[행동]하는 {{Male/Female}}는 {{Face}} 얼굴, {{EyeShape}} 눈, {{NoseShape}} 코, {{MouthShape}} 입을 가지고 있다."

4. **복장 (category: "복장")**
   - 형식: "[의상 유형/스타일]인 [주요 색상] [대표 아이템]을 입고 있다." 또는 "[직업/상황별 복장명]을 입고 있다."
   - **작성 원칙 (매우 중요!):**
     * 가장 눈에 띄는 핵심 특징만 간결하게 표현 (과도한 디테일 지양)
     * **의상만 기술, 악세사리(귀걸이, 목걸이, 팔찌, 시계, 모자, 가방 등) 절대 포함 금지**
     * **디자인 디테일(오프숄더, 슬림핏, V넥, 라운드넥 등) 제외**
     * 의상 유형 + 색상만 간결하게 표현
     * **반드시 상황 컨텍스트를 먼저 고려한 후 복장 분류**
     * 상황별 복장 판단 예시:
       - 병원 상황 (침대, 간호사, 주사 등) → 환자복 또는 의료복
       - 결혼식 상황 → 웨딩드레스 또는 정장
       - 경찰서/법원 → 제복 또는 정장
       - 운동/체육관 → 스포츠웨어
       - 일상/집/카페 → 캐주얼
     * **예시: 일반 티셔츠처럼 보여도 상황이 병원이면 반드시 "환자복"으로 분류**

   **의상 유형 분류 가이드:**
   | 유형 | 설명 및 예시 |
   |------|-------------|
   | 캐주얼 | 티셔츠, 청바지, 후드티, 원피스 등 일상복 |
   | 비즈니스 | 블라우스, 슬랙스, 재킷, 정장 등 직장/업무용 단정한 복장 |
   | 정장 | 수트, 턱시도, 드레스, 웨딩드레스 등 공식 행사 격식 차림 의복 |
   | 전통복 | 한복, 기모노 등 문화권 특유의 전통 의복 |
   | 근무복/유니폼 | 작업복, 군복, 학복, 승무원 유니폼, 의료복 등 직종이 명확한 의복 |
   | 스포츠웨어 | 트레이닝복, 요가복, 등산복, 수영복 등 운동/레저 활동을 위한 기능성 복장 |
   | 아더웨어 | 브래지어, 팬티, 런닝셔츠 등 속옷 |

   - **간결한 표현 예시 (권장):**
     * "흰색 캐주얼 상의를 입고 있다."
     * "검은색 정장을 입고 있다."
     * "화이트 웨딩드레스를 입고 있다."
     * "경찰 제복을 입고 있다."
     * "간호사 유니폼을 입고 있다."
     * "환자복을 입고 있다."
     * "전통 한복을 입고 있다."
     * "파란색 트레이닝복을 입고 있다."

   - **과도하게 상세한 표현 (지양):**
     * "캐주얼한 흰색 민소매 상의 위에 흰색 시스루 긴팔 가디건을 걸치고 있다." → "흰색 캐주얼 상의를 입고 있다."
     * "비즈니스 스타일의 네이비 블루 컬러 긴팔 블라우스와 회색 슬림핏 슬랙스를 착용하고 있다." → "네이비 비즈니스 정장을 입고 있다."
     * "오프숄더 디자인의 베이지색 드레스를 입고 있으며, 화려한 귀걸이와 목걸이를 착용하고 있다." → "베이지색 드레스를 입고 있다."

   - **중요**: 핵심 의상 유형 + 주요 색상만 간결하게 표현
   - 레이어링, 재질, 핏, 브랜드, 디자인 디테일, 악세사리 등 모두 생략

5. **감정 (category: "감정")**
   - 형식: "{{Male/Female}}는 {{EmoCategory}} 상태의 {{EmomainCategory}}적 감정인 것으로 보인다."
   - 예시: "{{Male/Female}}는 {{EmoCategory}} 상태의 {{EmomainCategory}}적 감정인 것으로 보인다."
   - 템플릿: "{{Male/Female}}는 {{EmoCategory}} 상태의 {{EmomainCategory}}적 감정인 것으로 보인다."

**매우 중요한 템플릿 변수 유지 규칙:**

**❌ 잘못된 예시 (절대 이렇게 작성하지 말 것):**
- "본 영상은 여자의 결혼식 장면이다." ({{Male/Female}}을 '여자'로 바꿨음)
- "결혼하는 여자는 둥근형 얼굴" ({{Male/Female}}, {{Face}}를 실제 값으로 바꿨음)

**✅ 올바른 예시:**
- "본 영상은 {{Male/Female}}의 결혼식 장면이다."
- "결혼하는 {{Male/Female}}는 {{Face}} 얼굴"

**필수 규칙:**
1. **{{Male/Female}}, {{Face}}, {{EyeShape}}, {{NoseShape}}, {{MouthShape}}, {{EmoCategory}}, {{EmomainCategory}}** 등 이중 중괄호로 감싸진 모든 변수는 **절대로 실제 값으로 바꾸지 말고 정확히 그대로 유지**해주세요
2. 예시: "여자는 둥근형 얼굴" (❌ 잘못됨) → "{{Male/Female}}는 {{Face}} 얼굴" (✅ 올바름)
3. [행동], [구체적인 상황 설명], [구체적 위치] 등 대괄호로 감싸진 부분만 실제 영상 내용으로 구체적으로 작성
4. **복장 설명**: 템플릿 변수 없이 영상에서 보이는 의상을 자유롭게 서술
   - 의상 스타일/종류, 색상, 디테일을 최대한 구체적으로 작성
   - 예: "캐주얼한 회색 티셔츠를 입고 있다", "환자복을 입고 있다", "경찰 제복을 입고 있다", "화이트 웨딩드레스를 입고 있다", "파란색 후드티를 입고 있다"

**작성 원칙:**
- 카테고리명을 이중 중괄호로 유지 ({{Male/Female}}, {{Face}}, {{EmoCategory}} 등)
- 복장(category: "복장")만 예외로 템플릿 변수 없이 자유 서술
- 자연스럽고 문법적으로 올바른 한국어 문장 작성
- 조사(은/는, 이/가, 을/를) 정확히 사용
- 복장 설명 시 영상에서 보이는 옷의 스타일, 색상, 디테일을 매우 구체적으로 작성

## 출력 형식
**중요:
1. 모든 시간 값은 정수가 아닌 소수점을 포함한 float 형식으로 출력 (예: 0이 아닌 0.0, 22가 아닌 22.0)
2. 아래 예시의 숫자 값들은 참고용이며, 반드시 실제 영상 분석 결과로 교체해야 함**

{
  "meta": {
    "frame_number": [주인공 특징이 가장 명확한 프레임 번호],
    "total_frames": [video_duration × fps_used, 반올림],
    "fps_used": [영상 실제 프레임레이트, 기본 30],
    "bbox": [
      {"x": [좌상단 x 픽셀 좌표], "y": [좌상단 y 픽셀 좌표]},
      {"x": [우하단 x 픽셀 좌표], "y": [우하단 y 픽셀 좌표]}
    ]
  },
  "class_type": [
    { "category": "Male/Female", "class": 2, "label": "여자" },
    { "category": "EmomainCategory", "class": 2, "label": "부정" },
    { "category": "EmoCategory", "class": 5, "label": "불안" },
    { "category": "Face", "class": 1, "label": "둥근형" },
    { "category": "EyeShape", "class": 2, "label": "수평형" },
    { "category": "NoseShape", "class": 1, "label": "직선형" },
    { "category": "MouthShape", "class": 2, "label": "곡선형" }
  ],
  "subject_description": [
    {
      "category": "상황",
      "description": "본 영상은 {{Male/Female}}가 결혼식장에서 행복한 표정을 짓는 장면이다."
    },
    {
      "category": "위치",
      "description": "{{Male/Female}}는 화면의 중앙에 위치하고 있다."
    },
    {
      "category": "얼굴",
      "description": "행복한 표정을 짓는 {{Male/Female}}는 {{Face}} 얼굴, {{EyeShape}} 눈, {{NoseShape}} 코, {{MouthShape}} 입을 가지고 있다."
    },
    {
      "category": "복장",
      "description": "화이트 웨딩드레스를 입고 있다."
    },
    {
      "category": "감정",
      "description": "{{Male/Female}}는 {{EmoCategory}} 상태의 {{EmomainCategory}}적 감정인 것으로 보인다."
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

  // 시간 값을 초 단위 float로 변환하는 헬퍼 함수
  parseTimeToSeconds(timeValue) {
    // 이미 숫자인 경우
    if (typeof timeValue === 'number') {
      return timeValue;
    }

    // 문자열인 경우 파싱
    if (typeof timeValue === 'string') {
      // 콜론(:)이 있으면 시:분:초 형식
      if (timeValue.includes(':')) {
        const parts = timeValue.split(':');

        if (parts.length === 2) {
          // MM:SS.ms 형식 (예: "00:23.5" -> 23.5초)
          const minutes = parseInt(parts[0]) || 0;
          const seconds = parseFloat(parts[1]) || 0;
          return minutes * 60 + seconds;
        } else if (parts.length === 3) {
          // HH:MM:SS.ms 형식
          const hours = parseInt(parts[0]) || 0;
          const minutes = parseInt(parts[1]) || 0;
          const seconds = parseFloat(parts[2]) || 0;
          return hours * 3600 + minutes * 60 + seconds;
        }
      }

      // 점이 2개 이상 있는 경우: "2.02.96" 형식 (잘못된 형식)
      const dotCount = (timeValue.match(/\./g) || []).length;
      if (dotCount >= 2) {
        // "2.02.96" 형식을 "0:122.96"으로 해석
        const parts = timeValue.split('.');

        if (parts.length === 3) {
          // parts[0] = 분, parts[1] = 초, parts[2] = 밀리초
          const minutes = parseInt(parts[0]) || 0;
          const seconds = parseInt(parts[1]) || 0;
          const milliseconds = parseFloat('0.' + parts[2]) || 0;

          return minutes * 60 + seconds + milliseconds;
        }
      }

      // 단순 숫자 문자열 (예: "22.96")
      return parseFloat(timeValue) || 0;
    }

    return 0;
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

      // 잘못된 시간 형식 수정 (예: 2.02.96 -> "00:22.96")
      // video_duration, first_appearance_time, start_time, end_time에서
      // 여러 개의 점이 있는 숫자를 문자열로 감싸기
      jsonString = jsonString.replace(/("(?:video_duration|first_appearance_time|start_time|end_time)":\s*)(\d+\.\d+\.\d+)/g, '$1"$2"');

      const analysisResult = JSON.parse(jsonString);

      // 에러 응답 체크
      if (analysisResult.error === true) {
        const errorMessage = analysisResult.message || '주인공으로 삼을 만한 인물이 영상에 없습니다.';
        console.log('⚠️ Gemini 분석 에러:', errorMessage);
        throw new Error(errorMessage);
      }

      // meta 객체 구성 - start_time 계산
      const frameNumber = analysisResult.meta?.frame_number || 0;
      const fps = analysisResult.meta?.fps_used || 30;
      const startTime = Math.round((frameNumber / fps) * 10000) / 10000; // 소수점 4자리, float 유지

      const meta = {
        frame_number: frameNumber,
        total_frames: analysisResult.meta?.total_frames || 0,
        fps_used: fps,
        start_time: startTime,
        bbox: analysisResult.meta?.bbox || [{x: 0, y: 0}, {x: 0, y: 0}]
      };

      console.log('✅ meta 정보:');
      console.log('  frame_number:', meta.frame_number);
      console.log('  total_frames:', meta.total_frames);
      console.log('  fps_used:', meta.fps_used);
      console.log('  start_time:', meta.start_time, '초');
      console.log('  bbox:', meta.bbox);

      // class_type에 class 번호 추가
      const { categoryData } = require('./categories');
      const classTypeWithClassNumber = (analysisResult.class_type || []).map(item => {
        const category = categoryData[item.category];
        if (category) {
          const found = category.find(c => c.label === item.label);
          if (found) {
            return {
              category: item.category,
              class: found.class,
              label: item.label
            };
          }
        }
        // 못 찾은 경우 기본값
        return {
          category: item.category,
          class: item.class || 0,
          label: item.label
        };
      });

      // 최종 결과 구성
      const result = {
        meta: meta,
        class_type: classTypeWithClassNumber,
        subject_description: analysisResult.subject_description || []
      };

      console.log('분석 결과 파싱 완료');
      console.log('🎯 반환할 result.meta:', result.meta);

      return result;

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

