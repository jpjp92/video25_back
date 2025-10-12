/**
 * 카테고리 데이터 정의
 * 2025.10.11 수정
 */

const categoryData = {
  "Male/Female": [
    { "class": 1, "label": "남자" },
    { "class": 2, "label": "여자" }
  ],
  "EmomainCategory": [
    { "class": 1, "label": "긍정" },
    { "class": 2, "label": "부정" },
    { "class": 3, "label": "중립" }
  ],
  "EmoCategory": [
    { "class": 1, "label": "즐거움" },
    { "class": 2, "label": "열의" },
    { "class": 3, "label": "평온" },
    { "class": 4, "label": "분노" },
    { "class": 5, "label": "불안" },
    { "class": 6, "label": "슬픔" },
    { "class": 7, "label": "중립" }
  ],
  "Face": [
    { "class": 1, "label": "둥근형" },
    { "class": 2, "label": "각진형" },
    { "class": 3, "label": "길쭉한형" }
  ],
  "EyeShape": [
    { "class": 1, "label": "상향형" },
    { "class": 2, "label": "수평형" },
    { "class": 3, "label": "하향형" }
  ],
  "NoseShape": [
    { "class": 1, "label": "직선형" },
    { "class": 2, "label": "곡선형" },
    { "class": 3, "label": "들창코형" },
    { "class": 4, "label": "매부리코형" }
  ],
  "MouthShape": [
    { "class": 1, "label": "직선형" },
    { "class": 2, "label": "곡선형" },
    { "class": 3, "label": "하트형" }
  ]
};

// 메뉴 구조를 위한 그룹핑
const categoryGroups = {
  "👤 인물 정보": ["Male/Female"],
  "😊 감정 분석": ["EmomainCategory", "EmoCategory"],
  "🎭 얼굴 특징": ["Face", "EyeShape", "NoseShape", "MouthShape"]
};

// 카테고리 한글명 매핑
const categoryLabels = {
  "Male/Female": "성별",
  "EmomainCategory": "감정 구분",
  "EmoCategory": "감정 분류",
  "Face": "얼굴형",
  "EyeShape": "눈 모양",
  "NoseShape": "코 모양",
  "MouthShape": "입 모양"
};

/**
 * 카테고리 키로 라벨 배열 가져오기
 * @param {string} categoryKey - 카테고리 키 (예: "EmoCategory")
 * @returns {Array} 해당 카테고리의 라벨 배열
 */
function getCategoryLabels(categoryKey) {
  return categoryData[categoryKey] || [];
}

/**
 * class 번호로 라벨 찾기
 * @param {string} categoryKey - 카테고리 키
 * @param {number} classNumber - class 번호
 * @returns {string|null} 라벨 또는 null
 */
function getLabelByClass(categoryKey, classNumber) {
  const category = categoryData[categoryKey];
  if (!category) return null;

  const item = category.find(item => item.class === classNumber);
  return item ? item.label : null;
}

/**
 * 라벨로 class 번호 찾기
 * @param {string} categoryKey - 카테고리 키
 * @param {string} label - 라벨
 * @returns {number|null} class 번호 또는 null
 */
function getClassByLabel(categoryKey, label) {
  const category = categoryData[categoryKey];
  if (!category) return null;

  const item = category.find(item => item.label === label);
  return item ? item.class : null;
}

/**
 * 모든 카테고리 키 가져오기
 * @returns {Array<string>} 카테고리 키 배열
 */
function getAllCategoryKeys() {
  return Object.keys(categoryData);
}

module.exports = {
  categoryData,
  categoryGroups,
  categoryLabels,
  getCategoryLabels,
  getLabelByClass,
  getClassByLabel,
  getAllCategoryKeys
};
