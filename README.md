# Video25 Backend API

비디오 분석 및 감정 설명문 생성을 위한 Node.js 백엔드 API

## 🚀 시작하기

### 설치

```bash
npm install
```

### 환경 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=*
```

### 서버 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

서버는 `http://localhost:3000`에서 실행됩니다.

---

## 📡 API 엔드포인트

### 1️⃣ 비디오 분석 API

**Endpoint:** `POST /api/video/analyze`

비디오 파일을 분석하여 주인공 정보, VA 감정값, 5가지 설명문을 생성합니다.

#### 요청 예시

**방법 1: Body에 API 키 포함**
```bash
curl -X POST http://localhost:3000/api/video/analyze \
  -F "video=@/path/to/video.mp4" \
  -F "apiKey=YOUR_GEMINI_API_KEY"
```

**방법 2: 헤더에 API 키 포함**
```bash
curl -X POST http://localhost:3000/api/video/analyze \
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
        "first_appearance_time": "00 00.00"
      },
      "video_duration": "00 22.99",
      "subject_time": [
        {
          "start_time": "00 08.50",
          "end_time": "00 09.50",
          "frame_number": 255,
          "total_frames": 690,
          "fps_used": 30
        }
      ]
    },
    "VA": {
      "valence": -2,
      "arousal": 2
    },
    "descriptions": [
      {
        "class": "상황 설명",
        "description": "주인공이 처한 상황에 대한 설명"
      },
      {
        "class": "배경/분위기",
        "description": "배경과 분위기에 대한 설명"
      },
      {
        "class": "주인공 얼굴 묘사",
        "description": "얼굴 특징에 대한 설명"
      },
      {
        "class": "주인공 의상 묘사",
        "description": "의상에 대한 설명"
      },
      {
        "class": "주인공 행동 묘사",
        "description": "행동에 대한 설명"
      }
    ]
  }
}
```

---

### 2️⃣ 설명문 개선 API

**Endpoint:** `POST /api/video/analyzer-desc`

5개의 설명문을 문법적으로 개선하고 하나의 전체 설명문으로 통합합니다.

#### 요청 예시

**방법 1: Body에 API 키 포함**
```bash
curl -X POST http://localhost:3000/api/video/analyzer-desc \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_GEMINI_API_KEY",
    "descriptions": [
      {"class": "상황 설명", "description": "..."},
      {"class": "배경/분위기", "description": "..."},
      {"class": "주인공 얼굴 묘사", "description": "..."},
      {"class": "주인공 의상 묘사", "description": "..."},
      {"class": "주인공 행동 묘사", "description": "..."}
    ]
  }'
```

**방법 2: 헤더에 API 키 포함**
```bash
curl -X POST http://localhost:3000/api/video/analyzer-desc \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_GEMINI_API_KEY" \
  -d '{
    "descriptions": [
      {"class": "상황 설명", "description": "..."},
      {"class": "배경/분위기", "description": "..."},
      {"class": "주인공 얼굴 묘사", "description": "..."},
      {"class": "주인공 의상 묘사", "description": "..."},
      {"class": "주인공 행동 묘사", "description": "..."}
    ]
  }'
```

#### Request Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `apiKey` | String | ✅ | Gemini API 키 (body 또는 헤더) |
| `descriptions` | Array | ✅ | 5개의 설명문 배열 (정확히 5개) |

#### Response

```json
{
  "success": true,
  "data": {
    "descriptions": [
      {
        "class": "상황 설명",
        "description": "개선된 상황 설명"
      },
      {
        "class": "배경/분위기",
        "description": "개선된 배경/분위기 설명"
      },
      {
        "class": "주인공 얼굴 묘사",
        "description": "개선된 얼굴 묘사"
      },
      {
        "class": "주인공 의상 묘사",
        "description": "개선된 의상 묘사"
      },
      {
        "class": "주인공 행동 묘사",
        "description": "개선된 행동 묘사"
      }
    ],
    "full_description": "5개 설명문을 하나로 합친 전체 설명문"
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
Response: meta + VA + descriptions
  ↓
2단계: 설명문 개선 (선택사항)
POST /api/video/analyzer-desc
  ↓
1단계의 descriptions + Gemini API 키
  ↓
Response: 개선된 descriptions + full_description
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

### VA (Valence-Arousal) 값

**Valence**: 감정의 긍정/부정 척도
- `-3` ~ `+3` (정수)
- 음수: 부정적 감정
- 양수: 긍정적 감정
- `0`: 중립

**Arousal**: 감정의 강도 척도
- `-3` ~ `+3` (정수)
- 음수: 약한 감정
- 양수: 강한 감정
- `0`: 중간 강도

### Meta 정보

- **main_character**: 주인공 설명 및 첫 등장 시간
- **video_duration**: 비디오 전체 길이
- **subject_time**: 감정이 가장 강렬한 핵심 프레임 정보
  - `start_time`, `end_time`: 1초 구간
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

- **Runtime**: Node.js
- **Framework**: Express.js
- **AI Model**: Google Gemini 2.5 Flash
- **File Upload**: Multer
- **Deployment**: Vercel (Serverless)

---

## 📁 프로젝트 구조

```
video25_back/
├── api/
│   ├── index.js              # Express 서버 진입점
│   ├── lib/
│   │   ├── gemini.js         # 비디오 분석 로직
│   │   └── geminiAnalyzer.js # 설명문 개선 로직
│   └── routes/
│       └── video.js          # 비디오 API 라우트
├── vercel.json               # Vercel 배포 설정
├── package.json
└── .env.example
```

---

## 🚀 Vercel 배포

### 배포 명령어

```bash
vercel
```

### 환경 변수 설정

Vercel 대시보드에서 환경 변수 설정:
- `ALLOWED_ORIGINS`: CORS 허용 도메인

---
