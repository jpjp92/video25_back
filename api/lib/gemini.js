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
        temperature: 0,
        topP: 1,
        topK: 1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",  
      }
    });
  }

  // 파일을 Base64로 변환
  async fileToBase64(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    return fileBuffer.toString('base64');
  }

  // 기본 프롬프트 (메타데이터 포함)
  static getDefaultPrompt(videoMetadata = null) {
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

${videoMetadata ? `
## 영상 메타데이터 (정확한 정보 - 반드시 사용)
**이 정보는 실제 영상에서 추출한 정확한 값입니다. 추측하지 말고 아래 값을 그대로 사용하세요:**
- **영상 해상도**: ${videoMetadata.width} × ${videoMetadata.height} 픽셀
- **FPS (초당 프레임 수)**: ${videoMetadata.fps}
- **영상 전체 길이**: ${videoMetadata.duration}초
- **전체 프레임 수**: ${videoMetadata.totalFrames}

**중요: 위 값들은 절대 변경하거나 추측하지 마세요. JSON 출력 시 그대로 사용하세요.**
` : ''}

## 사전 검증 (매우 중요!)

**영상 분석 가능성 먼저 확인:**
1. **인물이 있는가?** 영상에 사람이 전혀 없으면 → 에러 반환
2. **식별 가능한 크기인가?** 사람이 너무 멀리 있거나 작아서 얼굴/표정/복장을 식별할 수 없으면 → 에러 반환

**에러 조건에 해당하는 경우 다음 JSON 형식으로 반환:**
{
  "error": true,
  "message": "표정을 탐지 할 만한 인물이 영상에 없습니다."
}

**위 조건을 통과한 경우에만 아래 분석 단계 진행:**


## 분석 단계

### 1단계: 주인공 선정 및 최적 프레임 탐색

** 핵심 원칙: 한 명의 주인공과 그 사람의 감정 최대치 프레임을 동시에 선정!**

**STEP 1: 주인공 후보군 식별**

영상 전체를 훑어보며 분석 대상이 될 수 있는 사람들을 파악하세요:

**후보 선정 기준:**
1. **얼굴 크기**: 화면에서 얼굴이 큰 사람들 (1~2명)
   - 카메라에 가까운 사람 우선
   - 너무 멀리 있거나 작은 얼굴은 제외

2. **선명도**: 얼굴(눈, 코, 입)이 선명하게 보이는 사람들
   - 흐릿하거나 뒤돌아본 사람 제외
   - 얼굴이 가려진 사람 제외

3. **출현 빈도**: 영상에 자주 등장하는 사람들
   - 한 두 프레임만 나오는 사람보다 지속적으로 등장하는 사람 우선

→ **결과: 주인공 후보 1~2명 선정**

**STEP 2: 각 후보의 최적 프레임 찾기**

각 후보에 대해 감정 표현이 최대치인 프레임을 찾으세요:

**프레임 선정 기준:**

1. **감정 강렬도 (가장 중요!)**: 7가지 감정 중 가장 강렬하게 표현된 순간
   - **즐거움**: 입이 최대한 크게 벌어지고 눈이 초승달 모양인 순간, 가장 밝은 미소
   - **열의**: 가장 집중되고 열정적인 표정, 눈빛이 강렬한 순간, 적극적이고 활기찬 모습
   - **평온**: 가장 편안하고 안정된 표정, 가장 차분하고 여유로운 순간
   - **분노**: 눈썹이 가장 찡그려지고 표정이 굳은 순간, 가장 격양되고 화난 표정
   - **불안**: 가장 긴장되고 초조한 표정, 가장 불안해 보이는 순간, 흔들리는 눈빛
   - **슬픔**: 눈물이 보이거나 가장 침울한 순간, 가장 기운 없고 눈썹이 처진 표정
   - **중립**: 가장 무표정한 상태, 특별한 감정 표현이 없는 평상시 상태

2. **얼굴 품질**: 해당 프레임에서
   - 얼굴이 선명하게 보이는가?
   - 눈, 코, 입이 모두 명확히 보이는가?
   - 얼굴이 화면에 충분히 큰가?
   - 정면 또는 측면 각도인가? (뒤돌아보지 않음)

**제외해야 할 프레임:**
- 얼굴이 가려지거나 잘린 경우
- 움직임으로 흐릿한 경우
- 감정이 애매하거나 중간 단계인 경우
- 손이나 사물만 보이는 경우
**결과: 각 후보마다 최적 프레임 1개씩 식별**

**STEP 3: 최종 주인공 1명과 프레임 확정**
후보들을 비교하여 최종 주인공 1명을 선택하세요:
**최종 선택 기준 (우선순위):**
1. **출현 빈도 (가장 중요!)**: 영상 전체에서 가장 많이 등장하는 후보
   - 영상의 주인공은 가장 자주 등장하는 사람이어야 함
   - 후보들의 총 출현 프레임 수를 비교
   - 한두 번만 나오는 사람보다 지속적으로 등장하는 사람 우선

2. **감정 표현 강렬도**: 감정이 가장 강렬하고 명확한 후보
   - 감정이 "진행 중"인 프레임이 아닌 "최대치에 도달한" 프레임인지 확인
   - 즐거움의 경우: 입이 완전히 벌어지고 표정이 고정된 순간 (벌어지는 중이 아님)
   - 프레임들을 시간 순으로 비교하여 감정이 가장 강렬한 순간 선택
   - 비슷한 프레임이 여러 개면 → 더 늦은 프레임 선택 (감정이 완전히 발달)

3. **얼굴 크기**: 해당 프레임에서 얼굴이 더 크고 선명한 후보

4. **얼굴 각도**: 정면에 가까운 후보 

→ **최종 결과: 주인공 1명 + 그 사람의 감정 최대치 프레임 1개 확정**

** 중요 검증:**
- 선정한 프레임에서 주인공의 감정 표현이 실제로 최대치인가?
- 주인공 확정 후 다른 사람으로 절대 변경 금지!
- 이후 모든 분석은 이 주인공과 이 프레임을 기준으로 진행! 


#### 2단계: 프레임 기반 정밀 분석 및 시간 정보 추출
**핵심 작업:**
${videoMetadata ? `
**1. 영상 메타데이터 (이미 제공됨 - 재계산 불필요)**
   - 영상 전체 길이: **${videoMetadata.duration}초** (확정값)
   - FPS: **${videoMetadata.fps}** (확정값)
   - 전체 프레임 수: **${videoMetadata.totalFrames}** (확정값)
   - 해상도: **${videoMetadata.width} × ${videoMetadata.height}** (확정값)

**중요: 위 값들은 이미 정확하게 제공되었으므로 다시 측정하거나 추정하지 마세요!**
` : `
1. **영상 메타데이터 파악**
   - 영상 전체 길이(초) 측정
   - 영상 FPS(초당 프레임 수) 확인 (일반적으로 30fps)
   - 전체 프레임 수 계산 = 영상 길이 × FPS
`}

2. **선정된 프레임의 시간 계산**
   - 1단계에서 선정한 **감정이 최고조인 프레임** 번호 확인
   - **start_time 계산 공식: 프레임 번호 ÷ FPS**
   - 예시: 프레임 75번, 30fps → start_time = 75 ÷ 30 = 2.5초
   - **중요: start_time은 반드시 float 형식으로 표기** (예: 2.5, 8.4, 15.0)

   ** 프레임 번호 최종 검증 (반드시 수행!):**

   질문 1: **이 프레임에서 주인공의 감정 표현이 실제로 최대치인가?**
   - 즐거움: 입이 최대한 크게 벌어지고 눈이 초승달 모양인가?
   - 열의: 가장 집중되고 열정적인 표정, 눈빛이 강렬한가?
   - 평온: 가장 편안하고 안정된 표정인가?
   - 분노: 눈썹이 가장 찡그려져 있는가?
   - 불안: 가장 긴장되고 초조한 표정인가?
   - 슬픔: 눈물이 보이거나 가장 침울한 표정인가?
   - 중립: 가장 무표정한 상태인가?

   질문 2: **이 프레임이 1단계에서 선정한 주인공인가?**
   - 다른 사람이 아닌, 1단계에서 확정한 그 사람이 맞는가?

   질문 3: **이 프레임에서 주인공의 얼굴이 명확히 보이는가?**
   - 얼굴이 선명한가? 흐릿하지 않은가?
   - 눈, 코, 입이 모두 보이는가?

   **만약 위 질문 중 하나라도 "아니오"라면, 다시 1단계로 돌아가 올바른 프레임을 찾으세요!**

3. **주인공 얼굴 바운딩 박스 좌표 추출 (매우 중요!)**

   ** 핵심: 1단계에서 선정한 감정 최고조 프레임에서 그 주인공의 얼굴만 측정합니다!**

   **좌표계 정의:**
   - 화면 **좌상단 모서리** = (0, 0)
   - x축: 왼쪽(0)에서 오른쪽으로 증가
   - y축: 위쪽(0)에서 아래로 증가

   **측정 대상: 1단계에서 확정한 주인공의 얼굴만!**
   - **포함:** 이마, 눈썹, 눈, 코, 입, 볼, 턱선, 귀, 머리카락
   - **절대 포함 금지:** 목, 어깨, 몸통, 의상
   - **중요:** 다른 사람들은 절대 측정하지 않습니다!

   **단계별 측정 절차 (매우 신중하게!):**

   STEP 1: 영상 해상도 확인
   - 영상의 가로×세로 픽셀 크기 파악${videoMetadata ? ` (**제공된 값 사용: ${videoMetadata.width}×${videoMetadata.height}**)` : ' (예: 1920×1080, 1280×720)'}

   STEP 2: **선정한 감정 최고조 프레임에서 1단계 주인공의 얼굴 위치 정확히 파악**

   ** 중요: 먼저 주인공 얼굴이 화면 어디에 있는지 확인!**
   - 화면을 눈으로 스캔하여 1단계에서 선정한 그 사람의 얼굴 찾기
   - 다른 사람, 사물, 빈 공간이 아닌 **정확히 그 사람의 얼굴** 확인

   ** 얼굴 찾기 체크리스트:**
   1. 화면에서 사람들이 몇 명 보이는가?
   2. 1단계에서 선정한 주인공은 어느 위치에 있는가? (왼쪽? 중앙? 오른쪽?)
   3. 그 사람의 얼굴에서 눈, 코, 입이 명확히 보이는가?
   4. 얼굴의 대략적인 화면 위치는? (예: 화면 오른쪽 1/3 지점, 세로 중간 부근)
   
   ** 재재확인: 이 프레임에서 주인공의 감정 표현이 실제로 최대인가?**
   - 즐거움: 입이 최대한 벌어져 있는가? 눈이 초승달인가?
   - 열의: 가장 집중되고 열정적인가? 눈빛이 강렬한가?
   - 평온: 가장 편안하고 안정된 표정인가?
   - 분노: 눈썹이 가장 찡그려져 있는가?
   - 불안: 가장 긴장되고 초조한 표정인가?
   - 슬픔: 가장 침울한 표정인가? 눈물이 보이는가?
   - 중립: 가장 무표정한 상태인가?
   - **만약 감정이 최고조가 아니라면, 다시 1단계로 돌아가 올바른 프레임을 찾으세요!**
   
   STEP 3: **주인공 얼굴의 코 중심점 정확히 측정**

   ** 측정 전 필수 확인 절차:**

   1. **주인공 얼굴 영역 먼저 파악:**
      - 주인공의 얼굴이 화면의 어느 영역에 있는가?
      - 이마 맨 위는 대략 y = ?
      - 턱 끝은 대략 y = ?
      - 얼굴 왼쪽 끝은 대략 x = ?
      - 얼굴 오른쪽 끝은 대략 x = ?

   2. **얼굴 영역 내에서 코 위치 찾기:**
      - 코는 얼굴의 **세로 중간 약간 위** (이마와 턱 사이의 중간)
      - 코는 얼굴의 **가로 정중앙** (왼쪽과 오른쪽 끝 사이의 중심)

   3. **코의 정확한 중심점 측정:**
      - **코 중심 x**: 콧등 또는 코끝의 가로 중앙 픽셀 좌표
      - **코 중심 y**: 콧등 중간 또는 코끝의 세로 픽셀 좌표

   ** 측정 방법 예시:**
   - 얼굴이 화면 오른쪽에 있고, 얼굴 범위가 x: 550~750, y: 200~500 이라면
   - 코 중심 x ≈ (550 + 750) / 2 = 650 (얼굴 가로 중앙)
   - 코 중심 y ≈ 200 + (500-200) × 0.45 = 335 (얼굴 세로 45% 지점)

   ** 최종 확인:**
   - **이 좌표가 1단계에서 선정한 그 주인공의 코 중심인가?** 
   - **빈 공간, 배경, 다른 사람이 아닌가?** 
   - **실제 그 주인공의 코가 이 좌표에 있는가?** 

   STEP 4: bbox 좌표 구성 및 **최종 검증**
   - **코 중심점**: {"x": [코 중심 x], "y": [코 중심 y]}

   ** 출력 전 반드시 검증 (매우 중요!):**

   다음 질문에 모두 "예"라고 답할 수 있는지 확인:
   1. **이 좌표가 1단계에서 선정한 그 주인공의 코 중심을 가리킵니까?** 
   2. **이 좌표가 실제 얼굴의 코 부분에 있습니까?** 
   3. **빈 공간이나 다른 사물/사람을 가리키지 않습니까?** 
   4. **좌표가 화면 범위 내입니까?** (0 ≤ x ≤ 가로, 0 ≤ y ≤ 세로) 
   5. **얼굴의 다른 부위(눈, 입, 귀)가 아닌 코 중심이 맞습니까?** 

   **만약 하나라도 "아니오"라면, 좌표를 다시 측정하세요!**

   **측정 예시:**

   화면 중앙에 있는 주인공의 코 위치:
   - 코 중심: x=450 (화면 가로 중앙 부근)
   - 코 중심: y=300 (얼굴의 중간 높이)

   결과:
   "bbox": {"x": 450, "y": 300}
    
### VA(Valence-Arousal) 값 라벨링
선정된 프레임을 기준으로 감정의 V, A 값을 라벨링:

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
- 분노한 감정 (강렬): V=-3, A=+3
- 즐거운 감정 (강렬): V=+3, A=+3
- 평온한 감정 : V=+2, A=-1
- 슬픈 감정: V=-2, A=-2



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

**중요: 모든 설명은 1단계에서 확정한 그 주인공 1명에 대해서만 작성합니다.**

총 5개의 설명문을 작성하세요. **카테고리명은 {{}}로 유지**하고, 구체적 내용은 실제 분석 결과로 작성:

1. **상황 (category: "상황")**
   - 형식: "본 영상은 [행동/상황]하는 장면이다."
   - 예시:
     * "본 영상은 인터뷰 하는 장면이다."
     * "본 영상은 식사하는 장면이다."
     * "본 영상은 결혼식 장면이다."
     * "본 영상은 운동하는 장면이다."
     * "본 영상은 업무 하는 장면이다."
   - 템플릿: "본 영상은 [실제 영상의 행동/상황]하는 장면이다."

2. **위치 (category: "위치")**
   - **중요: 1단계에서 선정한 주인공의 위치를 설명합니다**
   - 형식: "[성별]는 화면의 [위치]에 위치하고 있다."
   - 예시: "여자는 화면의 중앙에 위치하고 있다.", "남자는 화면의 왼쪽 상단에 위치하고 있다."
   - 템플릿: "{{Male/Female}}는 화면의 [구체적 위치]에 위치하고 있다."
   - 위치 표현: 중앙, 왼쪽, 오른쪽, 상단, 하단, 좌상단, 우상단, 좌하단, 우하단 등
   - **검증: bbox 좌표와 위치 설명이 일치하는지 반드시 확인**
     * bbox x 좌표가 화면 왼쪽 1/3 → "왼쪽"
     * bbox x 좌표가 화면 중앙 1/3 → "중앙"
     * bbox x 좌표가 화면 오른쪽 1/3 → "오른쪽"

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
- "결혼하는 여자는 둥근형 얼굴" ({{Male/Female}}, {{Face}}를 실제 값으로 바꿨음)

**✅ 올바른 예시:**
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


## 출력 형식
**중요:
1. 모든 시간 값은 정수가 아닌 소수점을 포함한 float 형식으로 출력 (예: 0이 아닌 0.0, 22가 아닌 22.0)
2. 아래 예시의 숫자 값들은 참고용이며, 반드시 실제 영상 분석 결과로 교체해야 함
${videoMetadata ? `3. **메타데이터 필수 사용**: fps_used=${videoMetadata.fps}, total_frames=${videoMetadata.totalFrames} (정확한 값)` : ''}**

{
  "meta": {
    "frame_number": [주인공 특징이 가장 명확한 프레임 번호],
    "total_frames": ${videoMetadata ? videoMetadata.totalFrames : '[video_duration × fps_used, 반올림]'},
    "fps_used": ${videoMetadata ? videoMetadata.fps : '[영상 실제 프레임레이트, 기본 30]'},
    "bbox": ["x": [코 중심 x 픽셀 좌표], "y": [코 중심 y 픽셀 좌표]]
  },
  "VA": {
     "valence": 정수값 (-3 ~ +3),
     "arousal": 정수값 (-3 ~ +3)
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
      "description": "본 영상은 결혼을 하는 장면이다."
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

      // 1. 먼저 비디오 메타데이터 추출
      const { extractVideoMetadata } = require('./videoMetadata');
      const videoMetadata = extractVideoMetadata(filePath);

      // 파일을 Base64로 변환
      const base64Data = await this.fileToBase64(filePath);

      // Gemini API 요청 (메타데이터 포함)
      const prompt = GeminiVideoAnalyzer.getDefaultPrompt(videoMetadata);

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

      // 토큰 사용량 및 비용 계산
      const usageMetadata = response.usageMetadata;
      if (usageMetadata) {
        const inputTokens = usageMetadata.promptTokenCount || 0;
        const outputTokens = usageMetadata.candidatesTokenCount || 0;
        const totalTokens = usageMetadata.totalTokenCount || 0;

        // Gemini 2.5 Flash 가격 (per 1M tokens)
        const INPUT_PRICE_PER_1M = 0.30;  // $0.30 for text/image/video
        const OUTPUT_PRICE_PER_1M = 2.50; // $2.50 for output (including thinking tokens)

        // 비용 계산 (달러)
        const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M;
        const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;
        const totalCost = inputCost + outputCost;

        console.log('📥 Gemini API 응답 완료');
        console.log('⏱️ 응답 시간:', (requestDuration / 1000).toFixed(2) + '초');
        console.log('🔍 응답 길이:', text.length + '자');
        console.log('\n💰 토큰 사용량 및 예상 비용:');
        console.log('  📤 Input tokens:', inputTokens.toLocaleString());
        console.log('  📥 Output tokens:', outputTokens.toLocaleString());
        console.log('  📊 Total tokens:', totalTokens.toLocaleString());
        console.log('  💵 Input cost: $' + inputCost.toFixed(6));
        console.log('  💵 Output cost: $' + outputCost.toFixed(6));
        console.log('  💵 Total cost: $' + totalCost.toFixed(6));
      } else {
        console.log('📥 Gemini API 응답 완료');
        console.log('⏱️ 응답 시간:', (requestDuration / 1000).toFixed(2) + '초');
        console.log('🔍 응답 길이:', text.length + '자');
        console.log('⚠️ 토큰 사용량 정보를 가져올 수 없습니다.');
      }

      // JSON 파싱 (메타데이터 전달)
      const analysisResult = this.parseGeminiResponse(text, videoMetadata);

      // 2. 선정된 프레임 이미지 추출
      const frameNumber = analysisResult.meta.frame_number;
      const fps = analysisResult.meta.fps_used;

      console.log('🎬 프레임 추출 시작 (프레임:', frameNumber, ')');

      const { captureFrame, deleteCapturedFrame } = require('./frameCapture');
      const framePath = await captureFrame({
        videoPath: filePath,
        frameNumber: frameNumber,
        fps: fps,
        drawOverlay: false
      });

      console.log('✅ 프레임 추출 완료:', framePath);

      // 3. TensorFlow로 정확한 얼굴 랜드마크 추출
      console.log('🤖 TensorFlow 얼굴 랜드마크 탐지 시작');

      const { getDetector } = require('./faceLandmarks');
      const detector = getDetector();

      try {
        const nosePosition = await detector.extractNosePosition(framePath);

        console.log('✅ TensorFlow로 정확한 코 위치 추출 완료');
        console.log('   Gemini bbox:', analysisResult.meta.bbox);
        console.log('   TensorFlow bbox:', nosePosition);

        // Gemini의 bbox를 TensorFlow 결과로 교체
        analysisResult.meta.bbox = {
          x: nosePosition.x,
          y: nosePosition.y
        };

        console.log('🔄 bbox를 TensorFlow 결과로 교체 완료');

      } catch (landmarkError) {
        console.warn('⚠️ 얼굴 랜드마크 탐지 실패, Gemini bbox 사용:', landmarkError.message);
        // TensorFlow 실패 시 Gemini bbox 그대로 사용
      } finally {
        // 임시 프레임 이미지 삭제
        await deleteCapturedFrame(framePath);
      }

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
  parseGeminiResponse(responseText, videoMetadata = null) {
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

      // meta 객체 구성 - 메타데이터 사용 또는 계산
      const frameNumber = analysisResult.meta?.frame_number || 0;
      
      // videoMetadata가 있으면 그 값 사용, 없으면 분석 결과나 기본값 사용
      const fps = videoMetadata?.fps || analysisResult.meta?.fps_used || 30;
      const totalFrames = videoMetadata?.totalFrames || analysisResult.meta?.total_frames || 0;
      
      // start_time 계산: 소수점 최대 4자리까지 표현
      let startTime = frameNumber / fps;
      
      // 소수점 4자리로 반올림
      startTime = Math.round(startTime * 10000) / 10000;
      
      // 소수점이 있도록 문자열로 변환 후 다시 파싱 (JSON 직렬화 시 소수점 유지)
      // 예: 12 -> 12.0, 11.333333 -> 11.3333
      startTime = parseFloat(startTime.toFixed(4));

      const meta = {
        frame_number: frameNumber,
        total_frames: totalFrames,
        fps_used: fps,
        start_time: startTime,
        bbox: analysisResult.meta?.bbox || {x: 0, y: 0}
      };

      // VA 값 추출
      const VA = {
        valence: analysisResult.VA?.valence || 0,
        arousal: analysisResult.VA?.arousal || 0
      };

      console.log('✅ meta 정보:');
      console.log('  frame_number:', meta.frame_number);
      console.log('  total_frames:', meta.total_frames, videoMetadata ? '(메타데이터 사용)' : '');
      console.log('  fps_used:', meta.fps_used, videoMetadata ? '(메타데이터 사용)' : '');
      console.log('  start_time:', meta.start_time, '초');
      console.log('  bbox:', meta.bbox);
      console.log(' VA 정보:');
      console.log('  valence:', VA.valence);
      console.log('  arousal:', VA.arousal);

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
        VA: VA,
        class_type: classTypeWithClassNumber,
        subject_description: analysisResult.subject_description || []
      };

      console.log('분석 결과 파싱 완료');
      console.log('🎯 반환할 result.meta:', result.meta);
      console.log('🎯 반환할 result.VA:', result.VA);

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
