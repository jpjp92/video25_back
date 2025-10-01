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

  // 설명문 개선 메인 메서드
  async improveDescriptions(originalDescriptions) {
    try {
      console.log('설명문 개선 시작');

      // 개선 프롬프트 생성
      const prompt = this.buildImprovementPrompt(originalDescriptions);

      // API 요청
      const result = await this.model.generateContent([{ text: prompt }]);
      const response = await result.response;
      const text = response.text();

      console.log('📥 Gemini 개선 응답 완료');
      console.log('🔍 응답 길이:', text.length + '자');

      // JSON 파싱 및 응답 처리
      const improvedResult = this.parseResponse(text);
      return improvedResult;

    } catch (error) {
      console.error('설명문 개선 실패:', error);
      throw new Error(`설명문 개선에 실패했습니다: ${error.message}`);
    }
  }

  // 개선 프롬프트 생성
  buildImprovementPrompt(descriptions) {
    return `
다음은 비디오 분석으로 생성된 5가지 설명문입니다. 각 설명문을 검토하고 개선해주세요.

**현재 설명문:**
${JSON.stringify(descriptions, null, 2)}

**개선 요청사항:**

1. **문법 및 표현 개선**
   - 문법적 오류 수정
   - 어색한 표현을 자연스럽게 수정
   - 중복되는 단어나 표현 제거
   - 적절한 조사 사용 (은/는, 이/가, 을/를 등)

2. **구체성과 정확성 향상**
   - 모호하거나 추상적인 표현을 구체적으로 수정
   - 시각적으로 확인 가능한 사실만 서술
   - 추측이나 해석은 제거
   - 객관적이고 명확한 묘사 사용

3. **일관성 유지**
   - 5개 설명문이 서로 자연스럽게 연결되도록 조정
   - 동일한 대상을 지칭할 때 일관된 표현 사용
   - 시제와 어조의 통일성 유지
   - 현재 진행형/관형형 사용 유지

4. **서술 방식**
   - 각 설명문은 1-2문장으로 구체적으로 작성
   - 핵심 정보를 명확하게 전달
   - 불필요한 수식어 제거

**중요 규칙:**
- 5개의 class 구조는 그대로 유지 (순서와 이름 변경 금지)
- 각 class의 의도와 목적은 유지하면서 내용만 개선
- 추가 정보를 만들어내지 말고, 기존 정보를 개선하는데 집중
- 한국어 문법과 자연스러운 표현에 중점

**출력 형식 (JSON만 반환):**
{
  "descriptions": [
    {
      "class": "상황 설명",
      "description": "개선된 설명..."
    },
    {
      "class": "배경/분위기",
      "description": "개선된 설명..."
    },
    {
      "class": "주인공 얼굴 묘사",
      "description": "개선된 설명..."
    },
    {
      "class": "주인공 의상 묘사",
      "description": "개선된 설명..."
    },
    {
      "class": "주인공 행동 묘사",
      "description": "개선된 설명..."
    }
  ]
}
`;
  }

  // Gemini 응답 파싱
  parseResponse(responseText) {
    try {
      // JSON 추출
      const startIndex = responseText.indexOf('{');
      const endIndex = responseText.lastIndexOf('}');

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('JSON을 찾을 수 없습니다.');
      }

      const jsonString = responseText.substring(startIndex, endIndex + 1);
      const result = JSON.parse(jsonString);

      console.log('개선된 설명문 파싱 완료');

      // descriptions 배열 검증
      if (!result.descriptions || !Array.isArray(result.descriptions)) {
        throw new Error('descriptions 배열을 찾을 수 없습니다.');
      }

      if (result.descriptions.length !== 5) {
        throw new Error('descriptions는 5개의 항목이어야 합니다.');
      }

      // 5개 설명문을 한 줄로 합치기
      const fullDescription = result.descriptions
        .map(item => item.description)
        .join(' ');

      return {
        descriptions: result.descriptions,
        full_description: fullDescription
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
