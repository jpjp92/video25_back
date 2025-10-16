// api/lib/geminiAnalyzer.js
// 체크 리스트처럼 검토 필요한 항목들 검수 필요 

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini 설명문 개선 분석 클래스
class GeminiDescriptionAnalyzer {
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

  // 입력 데이터 검증 메서드
  validateInputData(classType, subjectDescription) {
    const { categoryData } = require('./categories');

    // 1. classType 검증
    if (!Array.isArray(classType)) {
      throw new Error('classType은 배열이어야 합니다.');
    }

    console.log('🔍 classType 검증 시작...');

    // 필수 카테고리 목록
    const requiredCategories = [
      'Male/Female',
      'EmomainCategory',
      'EmoCategory',
      'Face',
      'EyeShape',
      'NoseShape',
      'MouthShape'
    ];

    // 각 필수 카테고리가 존재하는지 확인
    for (const requiredCategory of requiredCategories) {
      const found = classType.find(item => item.category === requiredCategory);

      if (!found) {
        throw new Error(`필수 카테고리가 누락되었습니다: ${requiredCategory}`);
      }

      // 해당 카테고리가 categories.js에 정의되어 있는지 확인
      if (!categoryData[requiredCategory]) {
        throw new Error(`정의되지 않은 카테고리입니다: ${requiredCategory}`);
      }

      // label 값이 유효한지 확인
      const validLabels = categoryData[requiredCategory].map(item => item.label);
      if (!validLabels.includes(found.label)) {
        throw new Error(
          `카테고리 "${requiredCategory}"의 label "${found.label}"이(가) 유효하지 않습니다. ` +
          `유효한 값: ${validLabels.join(', ')}`
        );
      }

      console.log(`  ✅ ${requiredCategory}: "${found.label}" (유효)`);
    }

    console.log('✅ classType 검증 완료');

    // 2. subjectDescription 검증
    if (!Array.isArray(subjectDescription)) {
      throw new Error('subjectDescription은 배열이어야 합니다.');
    }

    if (subjectDescription.length !== 5) {
      throw new Error(`subjectDescription는 5개의 항목이어야 합니다. (현재: ${subjectDescription.length}개)`);
    }

    console.log('🔍 subject_description 검증 시작...');

    // 필수 카테고리 목록 (설명문)
    const requiredDescCategories = ['상황', '위치', '얼굴', '복장', '감정'];

    // 각 필수 카테고리가 존재하는지 확인
    for (const requiredCat of requiredDescCategories) {
      const found = subjectDescription.find(item => item.category === requiredCat);

      if (!found) {
        throw new Error(`필수 설명문 카테고리가 누락되었습니다: ${requiredCat}`);
      }

      if (!found.description || typeof found.description !== 'string') {
        throw new Error(`카테고리 "${requiredCat}"의 설명문이 비어있거나 유효하지 않습니다.`);
      }

      console.log(`  ✅ ${requiredCat}: "${found.description.substring(0, 30)}..."`);
    }

    console.log('✅ subject_description 검증 완료\n');
  }

  // 설명문 개선 메인 메서드
  async improveDescriptions(classType, subjectDescription) {
    try {
      console.log('설명문 개선 시작');

      // 입력 데이터 검증
      this.validateInputData(classType, subjectDescription);

      // 개선 프롬프트 생성
      const prompt = this.buildImprovementPrompt(classType, subjectDescription);

      // API 요청
      const result = await this.model.generateContent([{ text: prompt }]);
      const response = await result.response;
      const text = response.text();

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

        console.log('📥 Gemini 개선 응답 완료');
        console.log('🔍 응답 길이:', text.length + '자');
        console.log('\n💰 토큰 사용량 및 예상 비용:');
        console.log('  📤 Input tokens:', inputTokens.toLocaleString());
        console.log('  📥 Output tokens:', outputTokens.toLocaleString());
        console.log('  📊 Total tokens:', totalTokens.toLocaleString());
        console.log('  💵 Input cost: $' + inputCost.toFixed(6));
        console.log('  💵 Output cost: $' + outputCost.toFixed(6));
        console.log('  💵 Total cost: $' + totalCost.toFixed(6));
      } else {
        console.log('📥 Gemini 개선 응답 완료');
        console.log('🔍 응답 길이:', text.length + '자');
        console.log('⚠️ 토큰 사용량 정보를 가져올 수 없습니다.');
      }

      // JSON 파싱 및 응답 처리
      const improvedResult = this.parseResponse(text);
      return improvedResult;

    } catch (error) {
      console.error('설명문 개선 실패:', error);
      throw new Error(`설명문 개선에 실패했습니다: ${error.message}`);
    }
  }

  // 개선 프롬프트 생성
  buildImprovementPrompt(classType, subjectDescription) {
    return `
다음은 비디오 분석으로 생성된 카테고리 분류와 5가지 설명문입니다. 설명문을 검토하고 개선해주세요.

## 입력 데이터 검증

작업을 시작하기 전에 입력 데이터가 올바른지 확인하세요:

**1. class_type 검증:**
- 필수 카테고리 7개 확인: Male/Female, EmomainCategory, EmoCategory, Face, EyeShape, NoseShape, MouthShape
- 각 label 값이 다음 유효한 값 중 하나인지 확인:
  * Male/Female: "남자", "여자"
  * EmomainCategory: "긍정", "부정", "중립"
  * EmoCategory: "즐거움", "열의", "평온", "분노", "불안", "슬픔", "중립"
  * Face: "둥근형", "각진형", "길쭉한형"
  * EyeShape: "상향형", "수평형", "하향형"
  * NoseShape: "직선형", "곡선형", "들창코형", "매부리코형"
  * MouthShape: "직선형", "곡선형", "하트형"

**2. subject_description 검증:**
- 필수 카테고리 5개 확인: 상황, 위치, 얼굴, 복장, 감정
- 각 description이 비어있지 않은지 확인

**카테고리 분류 (class_type) - 변경 금지:**
${JSON.stringify(classType, null, 2)}

**현재 설명문 (subject_description):**
${JSON.stringify(subjectDescription, null, 2)}

## 개선 작업:

1. **템플릿 변수를 실제 값으로 치환 (class_type의 label 값 사용)**
   - {{Male/Female}} → "여자" 또는 "남자" (예: "여자는" → "여자는" 유지)
   - {{Face}} → "둥근형", "각진형", "길쭉한형"
   - {{EyeShape}} → "상향형", "수평형", "하향형"
   - {{NoseShape}} → "직선형", "곡선형", "들창코형", "매부리코형"
   - {{MouthShape}} → "직선형", "곡선형", "하트형"
   - {{EmomainCategory}} → "긍정", "부정", "중립"
   - {{EmoCategory}} → "즐거움", "열의", "평온", "분노", "불안", "슬픔", "중립"
   - **복장은 템플릿 변수 없이 이미 완성된 문장**이므로 자연스럽게 개선만 진행

2. **각 문장을 독립적으로 자연스럽게 개선**
   - 각각의 5개 문장을 독립적으로 자연스럽고 완성도 있게 수정
   - 각 문장은 독립적으로 읽혀도 자연스러워야 함
   - 5개 문장을 순서대로 이어 붙였을 때도 자연스러운 흐름이어야 함
   - 주어는 각 문장에 명확히 포함 (생략하지 말 것)
   - 문법적 오류 수정 및 자연스러운 표현 사용

   개선 예시 (class_type의 label 값은 반드시 유지):

   예시 1 - 긍정 감정:
   입력 class_type: Male/Female="여자", Face="둥근형", EyeShape="수평형", NoseShape="직선형", MouthShape="곡선형", EmoCategory="즐거움", EmomainCategory="긍정"
   → 상황: "여자가 야외 테라스에서 맥주를 발견하고 즐겁게 웃고 있는 장면이다."
   → 위치: "여자는 화면 중앙에 위치해 있다."
   → 얼굴: "즐거워하는 여자는 둥근형 얼굴에 수평형 눈, 직선형 코, 곡선형 입을 가지고 있다."
   → 복장: "여자는 캐주얼한 흰색 레이스 상의를 입고 있다."
   → 감정: "여자는 즐거움 상태이며 긍정적인 감정으로 보인다."

   예시 2 - 부정 감정:
   입력 class_type: Male/Female="남자", Face="각진형", EyeShape="하향형", NoseShape="매부리코형", MouthShape="직선형", EmoCategory="분노", EmomainCategory="부정"
   → 상황: "남자가 실내에서 서류를 보며 화난 표정을 짓고 있는 장면이다."
   → 위치: "남자는 화면 왼쪽에 위치해 있다."
   → 얼굴: "분노하는 남자는 각진형 얼굴에 하향형 눈, 매부리코형 코, 직선형 입을 가지고 있다."
   → 복장: "남자는 정장 차림의 검은색 재킷을 입고 있다."
   → 감정: "남자는 분노 상태이며 부정적인 감정으로 보인다."

   예시 3 - 중립 감정:
   입력 class_type: Male/Female="남자", Face="둥근형", EyeShape="수평형", NoseShape="직선형", MouthShape="직선형", EmoCategory="중립", EmomainCategory="중립"
   → 상황: "남자가 사무실에서 자료를 검토하고 있는 장면이다."
   → 위치: "남자는 화면 중앙에 위치해 있다."
   → 얼굴: "담담한 남자는 둥근형 얼굴에 수평형 눈, 직선형 코, 직선형 입을 가지고 있다."
   → 복장: "남자는 베이지색 셔츠를 입고 있다."
   → 감정: "남자는 중립 상태이며 중립적인 감정으로 보인다."

**한국어 조사 사용 규칙 (필수 적용):**
- 앞 음절이 자음으로 끝나는 경우: 은, 이, 을 사용
  예) 얼굴은, 눈이, 코를
- 앞 음절이 모음으로 끝나는 경우: 는, 가, 를 사용
  예) 여자는, 얼굴형이, 눈꺼풀을
- 구체적 조사 규칙:
  - 보조사: -은(자음 뒤) / -는(모음 뒤)
  - 주격/보격 조사: -이(자음 뒤) / -가(모음 뒤)
  - 목적격 조사: -을(자음 뒤) / -를(모음 뒤)
- 문장 생성 시 반드시 앞 음절의 받침 유무를 확인하여 올바른 조사를 선택하세요

**중요 규칙:**
- category 이름은 변경하지 말 것 (상황, 위치, 얼굴, 복장, 감정)
- 모든 {{}} 템플릿은 반드시 class_type의 label 값으로 치환
- class_type에서 가져온 핵심 키워드(성별, 얼굴형, 감정 등)는 반드시 유지하되, 문장 표현은 자연스럽게 개선
- 예: "여자", "남자", "둥근형", "수평형", "직선형", "즐거움", "긍정", "중립" 등 class_type의 label 값 자체는 절대 변경 금지
- 조사만 자연스럽게 변경 가능: "여자는" → "여자가" (문맥에 따라)

**출력 형식 (JSON만 반환):**
{
  "subject_description": [
    {
      "category": "상황",
      "description": "템플릿이 치환되고 개선된 완전한 문장"
    },
    {
      "category": "위치",
      "description": "템플릿이 치환되고 개선된 완전한 문장"
    },
    {
      "category": "얼굴",
      "description": "템플릿이 치환되고 개선된 완전한 문장"
    },
    {
      "category": "복장",
      "description": "템플릿이 치환되고 개선된 완전한 문장"
    },
    {
      "category": "감정",
      "description": "템플릿이 치환되고 개선된 완전한 문장"
    }
  ],
  "explanation": "상황 → 위치 → 얼굴 → 복장 → 감정 순서대로 5개 문장을 그대로 이어 붙인 완전한 설명문"
}
`;
  }

  // Gemini 응답 파싱
  parseResponse(responseText) {
    try {
      // 코드블록 제거
      let cleanedText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // JSON 추출
      const startIndex = cleanedText.indexOf('{');
      const endIndex = cleanedText.lastIndexOf('}');

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('JSON을 찾을 수 없습니다.');
      }

      const jsonString = cleanedText.substring(startIndex, endIndex + 1);
      const result = JSON.parse(jsonString);

      console.log('개선된 설명문 파싱 완료');

      // subject_description 배열 검증
      if (!result.subject_description || !Array.isArray(result.subject_description)) {
        throw new Error('subject_description 배열을 찾을 수 없습니다.');
      }

      if (result.subject_description.length !== 5) {
        throw new Error('subject_description는 5개의 항목이어야 합니다.');
      }

      // explanation 검증
      let explanation = result.explanation || '';

      // explanation이 없으면 자동 생성: 상황 → 위치 → 얼굴 → 복장 → 감정 순서대로 연결
      if (!explanation) {
        const categoryOrder = ['상황', '위치', '얼굴', '복장', '감정'];
        const sortedDescriptions = categoryOrder.map(category => {
          const item = result.subject_description.find(d => d.category === category);
          return item ? item.description : '';
        }).filter(d => d); // 빈 문자열 제거

        explanation = sortedDescriptions.join(' ');
      }

      return {
        subject_description: result.subject_description,
        explanation: explanation
      };

    } catch (error) {
      console.error('응답 파싱 실패:', error);
      console.error('원본 응답:', responseText);
      throw new Error('API 응답을 파싱할 수 없습니다');
    }
  }
}

module.exports = {
  GeminiDescriptionAnalyzer
};
