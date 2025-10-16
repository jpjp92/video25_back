# Video25 Backend API

비디오 분석, 감정 인식, 얼굴 특징 추출 및 설명문 생성을 위한 Node.js 백엔드 API

## 🚀 시작하기

### 필수 요구사항

- Node.js >= 18.0.0
- FFmpeg (자동 설치됨)
- npm 또는 pnpm

### 설치

```bash
npm install
# 또는
pnpm install
```

### 환경 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
PORT=3001
NODE_ENV=development
```

### 서버 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

서버는 `http://localhost:3001`에서 실행됩니다.

**Health Check:**
```bash
curl http://localhost:3001/api/health
```

---

## 📡 API 엔드포인트

### 1️⃣ 비디오 분석 API

**Endpoint:** `POST /api/video/analyze`

비디오 파일을 분석하여 주인공의 감정, 얼굴 특징, 분류 정보 및 설명문을 생성합니다.

#### 요청 예시

**방법 1: Body에 API 키 포함**
```bash
curl -X POST http://localhost:3001/api/video/analyze \
  -F "video=@/path/to/video.mp4" \
  -F "apiKey=YOUR_GEMINI_API_KEY"
```

**방법 2: 헤더에 API 키 포함**
```bash
curl -X POST http://localhost:3001/api/video/analyze \
  -H "x-api-key: YOUR_GEMINI_API_KEY" \
  -F "video=@/path/to/video.mp4"
```

#### Request Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `video` | File | ✅ | 비디오 파일 (mp4, mov, avi, mkv, webm, mpeg) |
| `apiKey` | String | ✅ | Gemini API 키 (body 또는 헤더) |

#### Response

```json
{
  "success": true,
  "data": {
    "meta": {
      "main_character": {
        "description": "주인공의 간단한 설명",
        "first_appearance_time": 0.0
      },
      "video_duration": 22.99,
      "subject_time": [
        {
          "start_time": 8.5,
          "end_time": 9.5,
          "frame_number": 255,
          "total_frames": 690,
          "fps_used": 30
        }
      ]
    },
    "class_type": [
      {
        "category": "Male/Female",
        "label": "여자"
      },
      {
        "category": "EmomainCategory",
        "label": "긍정"
      },
      {
        "category": "EmoCategory",
        "label": "즐거움"
      },
      {
        "category": "Face",
        "label": "둥근형"
      },
      {
        "category": "EyeShape",
        "label": "수평형"
      },
      {
        "category": "NoseShape",
        "label": "직선형"
      },
      {
        "category": "MouthShape",
        "label": "곡선형"
      }
    ],
    "subject_description": [
      {
        "category": "상황",
        "description": "{{Male/Female}}가 야외에서..."
      },
      {
        "category": "위치",
        "description": "{{Male/Female}}는 화면 중앙에..."
      },
      {
        "category": "얼굴",
        "description": "{{EmoCategory}}하는 {{Male/Female}}는 {{Face}} 얼굴에..."
      },
      {
        "category": "복장",
        "description": "{{Male/Female}}는 캐주얼한..."
      },
      {
        "category": "감정",
        "description": "{{Male/Female}}는 {{EmoCategory}} 상태이며 {{EmomainCategory}}적인..."
      }
    ]
  }
}
```

---

### 2️⃣ 설명문 개선 API

**Endpoint:** `POST /api/video/analyzer-desc`

템플릿 변수를 실제 값으로 치환하고, 5개의 설명문을 문법적으로 개선하며, 하나의 완전한 설명문으로 통합합니다.

#### 요청 예시

```bash
curl -X POST http://localhost:3001/api/video/analyzer-desc \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_GEMINI_API_KEY" \
  -d '{
    "class_type": [
      {"category": "Male/Female", "label": "여자"},
      {"category": "EmomainCategory", "label": "긍정"},
      {"category": "EmoCategory", "label": "즐거움"},
      {"category": "Face", "label": "둥근형"},
      {"category": "EyeShape", "label": "수평형"},
      {"category": "NoseShape", "label": "직선형"},
      {"category": "MouthShape", "label": "곡선형"}
    ],
    "subject_description": [
      {"category": "상황", "description": "{{Male/Female}}가 야외에서..."},
      {"category": "위치", "description": "{{Male/Female}}는 화면 중앙에..."},
      {"category": "얼굴", "description": "{{EmoCategory}}하는 {{Male/Female}}는..."},
      {"category": "복장", "description": "{{Male/Female}}는 캐주얼한..."},
      {"category": "감정", "description": "{{Male/Female}}는 {{EmoCategory}} 상태이며..."}
    ]
  }'
```

#### Request Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `apiKey` | String | ✅ | Gemini API 키 (body 또는 헤더) |
| `class_type` | Array | ✅ | 7개의 분류 정보 배열 |
| `subject_description` | Array | ✅ | 5개의 설명문 배열 (템플릿 포함) |

#### Response

```json
{
  "success": true,
  "data": {
    "subject_description": [
      {
        "category": "상황",
        "description": "여자가 야외 테라스에서 맥주를 발견하고 즐겁게 웃고 있는 장면이다."
      },
      {
        "category": "위치",
        "description": "여자는 화면 중앙에 위치해 있다."
      },
      {
        "category": "얼굴",
        "description": "즐거워하는 여자는 둥근형 얼굴에 수평형 눈, 직선형 코, 곡선형 입을 가지고 있다."
      },
      {
        "category": "복장",
        "description": "여자는 캐주얼한 흰색 레이스 상의를 입고 있다."
      },
      {
        "category": "감정",
        "description": "여자는 즐거움 상태이며 긍정적인 감정으로 보인다."
      }
    ],
    "explanation": "여자가 야외 테라스에서 맥주를 발견하고 즐겁게 웃고 있는 장면이다. 여자는 화면 중앙에 위치해 있다. 즐거워하는 여자는 둥근형 얼굴에 수평형 눈, 직선형 코, 곡선형 입을 가지고 있다. 여자는 캐주얼한 흰색 레이스 상의를 입고 있다. 여자는 즐거움 상태이며 긍정적인 감정으로 보인다."
  }
}
```

### 3️⃣ 프레임 캡처 API

**Endpoint:** `POST /api/video/capture-frame`

비디오에서 특정 프레임을 1920x1080 해상도로 캡처하고, 선택적으로 바운딩 박스나 포인트 오버레이를 추가할 수 있습니다.

#### 요청 예시

```bash
curl -X POST http://localhost:3001/api/video/capture-frame \
  -F "video=@/path/to/video.mp4" \
  -F "frameNumber=255" \
  -F "fps=30" \
  -F "bbox1X=100" \
  -F "bbox1Y=100" \
  -F "bbox2X=500" \
  -F "bbox2Y=600" \
  -F "drawOverlay=true"
```

#### Request Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `video` | File | ✅ | 비디오 파일 |
| `frameNumber` | Integer | ✅ | 캡처할 프레임 번호 (0부터 시작) |
| `fps` | Integer | ❌ | 비디오 FPS (기본값: 30) |
| `bbox1X`, `bbox1Y` | Integer | ❌ | 바운딩 박스 좌상단 좌표 |
| `bbox2X`, `bbox2Y` | Integer | ❌ | 바운딩 박스 우하단 좌표 |
| `x`, `y` | Integer | ❌ | 단일 포인트 좌표 |
| `drawOverlay` | Boolean | ❌ | 오버레이 표시 여부 (기본값: false) |

#### Response

```json
{
  "success": true,
  "data": {
    "frameNumber": 255,
    "fps": 30,
    "bbox": [
      {"x": 100, "y": 100},
      {"x": 500, "y": 600}
    ],
    "point": null,
    "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "resolution": "1920x1080"
  }
}
```

---

## 🔄 전체 워크플로우

```
1단계: 비디오 분석
POST /api/video/analyze
  ↓
비디오 파일 업로드 + Gemini API 키
  ↓
Response: meta + class_type + subject_description
  ↓
2단계: 설명문 개선 (선택사항)
POST /api/video/analyzer-desc
  ↓
1단계의 class_type + subject_description + Gemini API 키
  ↓
Response: 개선된 subject_description + explanation
  ↓
3단계: 프레임 캡처 (선택사항)
POST /api/video/capture-frame
  ↓
비디오 파일 + frameNumber (meta.subject_time[0].frame_number)
  ↓
Response: Base64 인코딩된 이미지
```

---

## 📋 지원 형식

### 비디오 파일 형식
- MP4 (`.mp4`)
- MOV (`.mov`)
- AVI (`.avi`)
- MKV (`.mkv`)
- WebM (`.webm`)
- MPEG (`.mpeg`)

### 파일 크기 제한
- 최대 100MB

---

## 🔑 Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com/app/apikey) 접속
2. API 키 생성
3. 요청 시 API 키 사용

---

## 📊 Response 데이터 구조

### class_type (분류 정보)

7개의 필수 카테고리로 주인공의 특징을 분류합니다:

| 카테고리 | 가능한 값 |
|---------|----------|
| **Male/Female** | "남자", "여자" |
| **EmomainCategory** | "긍정", "부정", "중립" |
| **EmoCategory** | "즐거움", "열의", "평온", "분노", "불안", "슬픔", "중립" |
| **Face** | "둥근형", "각진형", "길쭉한형" |
| **EyeShape** | "상향형", "수평형", "하향형" |
| **NoseShape** | "직선형", "곡선형", "들창코형", "매부리코형" |
| **MouthShape** | "직선형", "곡선형", "하트형" |

### subject_description (설명문)

5개의 필수 카테고리로 주인공을 설명합니다:

1. **상황**: 주인공이 처한 상황
2. **위치**: 화면에서의 위치
3. **얼굴**: 얼굴 특징 (Face, EyeShape, NoseShape, MouthShape 포함)
4. **복장**: 의상 및 스타일
5. **감정**: 감정 상태 (EmoCategory, EmomainCategory 포함)

템플릿 변수 (예: `{{Male/Female}}`, `{{EmoCategory}}`)는 `/analyzer-desc` API를 통해 실제 값으로 치환됩니다.

### Meta 정보

- **main_character**: 주인공 설명 및 첫 등장 시간 (초 단위)
- **video_duration**: 비디오 전체 길이 (초 단위)
- **subject_time**: 감정이 가장 강렬한 핵심 프레임 정보
  - `start_time`, `end_time`: 1초 구간 (소수점 형식)
  - `frame_number`: 해당 프레임 번호
  - `total_frames`: 전체 프레임 수
  - `fps_used`: 사용된 FPS

---

## ⚠️ 에러 처리

### 에러 응답 형식

```json
{
  "success": false,
  "error": "에러 메시지"
}
```

### HTTP 상태 코드

| 코드 | 설명 |
|------|------|
| `200` | 성공 |
| `400` | 잘못된 요청 (파일 없음, API 키 없음, 잘못된 형식) |
| `500` | 서버 에러 (분석 실패, API 호출 실패) |

---

## 🛠️ 기술 스택

- **Runtime**: Node.js >= 18.0.0
- **Framework**: Express.js
- **AI Model**: Google Gemini 2.5 Flash
- **Video Processing**: FFmpeg, Sharp
- **Face Detection**: TensorFlow.js, BlazeFace, Face Landmarks Detection
- **File Upload**: Multer
- **Deployment**: Railway / Vercel (Serverless)

---

## 📁 프로젝트 구조

```
video25_back/
├── api/
│   ├── index.js                 # Express 서버 진입점
│   ├── lib/
│   │   ├── categories.js        # 카테고리 정의 (얼굴형, 감정 등)
│   │   ├── gemini.js            # 비디오 분석 로직 (Gemini API)
│   │   ├── geminiAnalyzer.js    # 설명문 개선 로직
│   │   ├── frameCapture.js      # 프레임 캡처 (FFmpeg)
│   │   ├── faceLandmarks.js     # 얼굴 특징 추출 (TensorFlow.js)
│   │   ├── frame_div.js         # 프레임 분할 로직
│   │   └── videoMetadata.js     # 비디오 메타데이터 추출
│   └── routes/
│       └── video.js             # 비디오 API 라우트
├── tmp/uploads/                 # 임시 업로드 디렉토리
├── vercel.json                  # Vercel 배포 설정
├── package.json
├── package-lock.json
└── .env
```

---

## 🚀 배포

### Railway 배포

이 프로젝트는 Railway에서 실행되도록 구성되어 있습니다.

```bash
# Railway CLI 설치
npm install -g @railway/cli

# Railway 로그인
railway login

# 배포
railway up
```

### Vercel 배포 (Serverless)

```bash
vercel
```

**환경 변수:**
- Railway/Vercel 대시보드에서 환경 변수 설정 가능 (선택사항)

---

## 📝 개발 노트

### 주요 기능

1. **비디오 분석**: Gemini 2.5 Flash를 사용하여 비디오의 감정, 주인공 특징 추출
2. **얼굴 인식**: TensorFlow.js의 BlazeFace 및 Face Landmarks Detection 모델 사용
3. **프레임 캡처**: FFmpeg를 사용하여 특정 프레임을 1920x1080 해상도로 캡처
4. **설명문 개선**: Gemini AI를 사용하여 템플릿 치환 및 문법 개선

### 제한 사항

- 비디오 파일 크기: 최대 100MB
- 지원 형식: MP4, MOV, AVI, MKV, WebM, MPEG
- Gemini API 키 필수 (사용자가 제공)

---
