# 운동 루틴 자동화

구글 시트에 루틴을 적으면 GitHub이 JSON과 "오늘의 루틴 배경화면"을 만들고, 폰의 Automate가 매일 새벽 그 이미지를 배경화면으로 지정합니다.

## 전체 흐름

```
구글 시트(탭마다 하나의 프로그램) ──(웹에 게시, CSV)──▶ Secret CSV_URL_1 ~ 5
                                                        │
                    GitHub Actions "Sync routine"(매시간) ▼
                                      ppl/routine1.json ~ routine5.json 갱신

ppl/config.json(어떤 루틴, 언제부터) + ppl/routineN.json + log.txt
                    GitHub Actions "Daily image"(매일 한국시간 00:17)
                                      └▶ image 브랜치의 today.jpg 덮어쓰기

폰 Automate(매일 01:00) ──▶ today.jpg 다운로드 ──▶ 배경화면 지정
```

## 핵심 규칙: "슬롯"

시크릿 이름의 번호와 JSON 파일 이름의 번호가 짝입니다. **파일 이름은 내용과 상관없이 번호로만 정해집니다.**

| 시크릿 | 만들어지는 파일 |
|---|---|
| `CSV_URL_1` | `ppl/routine1.json` |
| `CSV_URL_2` | `ppl/routine2.json` |
| `CSV_URL_3` ~ `CSV_URL_5` | `ppl/routine3.json` ~ `routine5.json` |

- 어떤 슬롯에 어떤 프로그램을 넣든 자유입니다. 슬롯의 시크릿 주소만 바꾸면 그 슬롯의 JSON이 새 프로그램으로 바뀝니다.
- 시크릿이 비어 있는 슬롯은 건너뜁니다.
- 그래서 프로그램을 바꿔도 **yml 파일은 고치지 않습니다.** 고치는 곳은 시크릿과 `ppl/config.json`뿐이에요.

## 파일 위치

| 파일 | 설명 |
|---|---|
| `ppl/config.json` | **지금 어떤 슬롯을, 언제부터 하는지** 정하는 파일 (자주 수정) |
| `ppl/routine1.json` ~ `routine5.json` | 시트에서 자동 생성. 직접 고치지 않아요 |
| `log.txt` | 운동 기록. 한 줄에 `날짜,무산소(분),유산소(분)` |
| `assets/bg.jpg` | 배경 사진 (1080×2160 JPEG, 500KB 이하 권장) |
| `scripts/convert.mjs` | 시트 CSV를 JSON으로 바꾸는 스크립트 |
| `scripts/make-image.mjs` | 오늘 루틴과 14일 그래프를 이미지로 그리는 스크립트 |
| `.github/workflows/sync-routine.yml` | 시트 → JSON (매시간) |
| `.github/workflows/daily-image.yml` | 이미지 생성 (매일 한국시간 00:17) |

## 고정 주소

- 오늘 이미지: `https://raw.githubusercontent.com/bulcoh/ssimg2/image/today.jpg`
- Fire 7 용 이미지: `https://raw.githubusercontent.com/bulcoh/ssimg2/image/today-fire.jpg`

`image` 브랜치는 매번 기록을 지우고 이미지 한 장만 남기므로 용량이 쌓이지 않습니다.

## 기기별 이미지 (폰, Fire 등)

`scripts/make-image.mjs` 맨 위의 `PROFILES`에 기기마다 한 줄이 있고, 액션이 매일 모든 기기의 이미지를 한꺼번에 만듭니다. 각 기기는 자기 주소만 받으면 되니까 기기를 바꿔도 다른 설정은 고치지 않아요.

| 기기 | 파일 | 크기 | 레이아웃 |
|---|---|---|---|
| `phone` (Mi Max 3) | `today.jpg` | 1080×2160 | 세로, 목록 1단 |
| `fire` (Fire 7 2022) | `today-fire.jpg` | 1024×600 | 가로, 목록 2단 |

- 새 기기를 추가하려면 `PROFILES`에 한 줄을 더 쓰고(크기, 여백, 통 폭 등), `daily-image.yml`의 `git add` 줄에 그 파일 이름을 추가합니다.
- 기기마다 다른 배경 사진을 쓰려면 `assets/bg-기기이름.jpg`(예: `bg-fire.jpg`)를 올립니다. 없으면 `assets/bg.jpg`를 씁니다.
- 기기가 배경화면을 확대하거나 상태표시줄이 가리는 정도는 기기마다 달라서, 새 기기는 화면을 보고 `side`, `top`, `bottom` 여백을 한 번 조정해야 합니다.

---

## 자주 하는 일

`ppl/config.json`은 GitHub 웹에서 파일을 열고 연필 아이콘으로 수정한 뒤 **Commit**하면 이미지가 자동으로 다시 만들어집니다. 바로 확인하려면 Actions 탭 → **Daily image** → **Run workflow**를 누르세요.

```json
{
  "routine": "routine1.json",
  "start_date": "2026-10-19",
  "skip_weeks": []
}
```

| 항목 | 의미 |
|---|---|
| `routine` | 지금 쓰는 슬롯의 파일 이름 (`ppl` 폴더 안) |
| `start_date` | 그 루틴 1주차가 시작하는 **월요일** 날짜 |
| `skip_weeks` | 주차를 세지 않을 주(디로드, 휴식, 부상)의 월요일 날짜 목록 |

주차는 항상 **월요일 기준**으로 계산됩니다. 날짜를 수요일 같은 날로 적어도 그 주 월요일로 계산해요.

### 1. 부상 등으로 W1부터 다시 시작하기

`start_date`를 새 1주차의 월요일로 바꾸고, `skip_weeks`는 비웁니다. 시트나 시크릿은 건드리지 않아요.

```json
{
  "routine": "routine1.json",
  "start_date": "2026-11-16",
  "skip_weeks": []
}
```

- 시작일이 미래면 그날까지 이미지에 "아직 시작 전이에요"가 나옵니다. 쉬는 기간에는 미리 바꿔 두면 편해요.
- 이번 주부터 바로 W1로 시작하려면 **이번 주 월요일** 날짜를 적습니다. 이미 지난 요일의 루틴은 건너뛰고 오늘 요일부터 보입니다.
- 시트의 요일(Mon~Sun)과 실제 요일이 연결되어 있어서, 수요일에 시작해도 W1의 수요일 루틴부터 나오는 구조입니다. 1일차를 수요일에 하고 싶다면 시트에서 요일 칸을 옮겨 주세요.

### 2. 한 주 쉬기 (디로드, 아픈 주)

`skip_weeks`에 쉬는 주의 월요일 날짜를 추가합니다.

```json
"skip_weeks": ["2026-11-09"]
```

- 그 주에는 이미지에 "이번 주는 디로드·휴식 주"가 나옵니다.
- 주차는 멈췄다가 다음 주에 이어집니다. `start_date`는 바꾸지 않아도 됩니다.
- 여러 주면 `["2026-11-09", "2026-11-16"]`처럼 쉼표로 이어요.

### 3. 이미 만들어 둔 다음 구간(예: 슬롯 2)으로 넘어가기

`routine`과 `start_date`를 둘 다 바꿉니다.

```json
{
  "routine": "routine2.json",
  "start_date": "2026-12-07",
  "skip_weeks": []
}
```

루틴이 끝나면(주차가 루틴의 주 수를 넘으면) 이미지에 "루틴이 끝났어요"가 나옵니다. 그때 위처럼 다음 루틴으로 바꾸면 돼요. 자동으로 처음으로 돌아가지 않습니다.

### 4. 완전히 새로운 프로그램 하기

방법은 둘 중 하나입니다. **yml은 고치지 않습니다.**

**방법 A: 비어 있는 슬롯에 추가 (이전 프로그램을 남겨 두고 싶을 때)**

1. 구글 시트에 새 탭을 만들고 기존 탭과 같은 열 구성(WEEK, DAY, TITLE, EXERCISE, W, SETS, REPS, RPE, REST, SUB 1, SUB 2, NOTE)으로 작성합니다.
2. 시트 메뉴 **파일 → 공유 → 웹에 게시**에서 그 탭을 선택하고 형식을 **CSV**로 게시한 뒤 주소를 복사합니다.
3. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 이름 `CSV_URL_3`(비어 있는 번호), 값은 복사한 주소로 저장합니다.
4. Actions 탭에서 **Sync routine**을 한 번 실행해 `ppl/routine3.json`이 생기는지 확인합니다.
5. `ppl/config.json`의 `routine`을 `"routine3.json"`으로, `start_date`를 시작 월요일로 바꿉니다.

**방법 B: 기존 슬롯의 주소를 바꿈 (이전 프로그램이 필요 없을 때)**

1. 시트에 새 프로그램 탭을 만들고 CSV로 게시해 주소를 복사합니다.
2. 사용 중인 슬롯의 시크릿(예: `CSV_URL_1`)을 **Update secret**으로 새 주소로 바꿉니다.
3. Actions에서 **Sync routine**을 실행하면 `routine1.json`이 새 프로그램으로 바뀝니다.
4. `ppl/config.json`의 `start_date`를 시작 월요일로 바꿉니다 (`routine`은 그대로).

슬롯이 5개로 부족해지면 `sync-routine.yml`의 `env` 목록과 `for i in 1 2 3 4 5`의 번호만 늘리면 됩니다.

### 5. 1RM(기록 최대 무게)이나 루틴 내용 바꾸기

구글 시트만 고치면 됩니다. 시트 → JSON은 매시간 자동으로 갱신되고, 이미지에는 **다음 새벽** 반영됩니다. 바로 보려면 Actions에서 **Sync routine**을 실행하고 몇 분 뒤 **Daily image**를 실행하세요. 게시된 시트는 반영이 몇 분 늦을 수 있습니다.

---

## 폰을 바꿨을 때: Automate 설정

사용 앱: **Automate** (LlamaLab, 플레이스토어). 앱 버전에 따라 항목 이름이 조금 다를 수 있어요.

### 1. 앱 권한

- 저장공간(파일) 접근을 허용합니다.
- 앱 정보 → 배터리 → **제한 없음**으로 설정합니다. 그래야 새벽에 흐름이 멈추지 않아요.
- 정확한 알람 허용(알람 및 리마인더) 항목이 있다면 켭니다.

### 2. 흐름(Flow) 만들기

블록을 아래 순서로 연결하고 마지막에 시각 대기 블록으로 되돌려서 반복시킵니다.

| 순서 | 블록 | 설정 |
|---|---|---|
| 1 | Flow beginning | 기본값 |
| 2 | Time await | 시각 **01:00**, Awake 사용, Proceed는 exact |
| 3 | HTTP request | URL: `https://raw.githubusercontent.com/bulcoh/ssimg2/image/today.jpg`<br>Save response: save to file<br>Response path: `/storage/emulated/0/Download/wallpaper.jpg` |
| 4 | Wallpaper image set | Image URI: `/storage/emulated/0/Download/wallpaper.jpg` (`file://` 없이 경로만)<br>Which: System (잠금화면도 바꾸려면 블록을 하나 더 만들고 Lock screen 선택) |
| 5 | 2번 Time await로 연결 | 다음 날을 기다림 |

시각을 **01:00**으로 두는 이유는 GitHub의 예약 실행이 자정 직후에 몇 분~수십 분 늦어지는 경우가 많아서예요. 00:01 같은 이른 시각에 받으면 어제 이미지가 받아집니다.

### 3. 테스트

시스템 시간을 바꾸지 마세요. 인증서 오류로 다운로드가 실패할 수 있어요.

- 방법 A: Time await의 시각을 지금보다 2~3분 뒤로 바꾸고 흐름을 껐다 켠 뒤 기다립니다. 끝나면 01:00으로 되돌리고 다시 시작해요.
- 방법 B: Time await 없이 `HTTP request → Wallpaper image set` 블록만 있는 테스트용 흐름을 따로 만들어 한 번 실행합니다. 즉시 결과를 볼 수 있어요.

배경화면이 안 바뀌면 파일 관리자에서 `Download/wallpaper.jpg`의 수정 시각을 확인하세요. 방금이라면 다운로드는 성공이고 지정 단계 문제, 예전 시각이면 다운로드 단계 문제입니다.

---

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 이미지가 어제 것이다 | Actions → Daily image 최근 실행이 성공(초록)인지, 실행 시각이 Automate 시각보다 앞인지 |
| 이미지 가장자리가 잘린다 | 픽셀롬이 배경화면을 약 8% 확대해서 지정합니다. `scripts/make-image.mjs` 맨 위의 `SIDE_SAFE`, `TOP_SAFE` 숫자를 키우세요 (알림창을 내리면 확대가 풀려서 전체가 보입니다) |
| 위쪽 날짜가 상태표시줄에 가려진다 | `TOP_SAFE`를 키웁니다 |
| 루틴이 JSON에 반영 안 된다 | 시트 게시가 켜져 있는지, 시크릿의 주소가 맞는지, Actions → Sync routine 로그 (슬롯 실패는 노란 경고로 표시됩니다) |
| 이미지 생성이 "파일을 찾을 수 없다"로 실패 | `ppl/config.json`의 `routine` 이름이 `ppl` 폴더의 실제 파일 이름과 같은지 |
| Actions 예약 실행이 멈췄다 | 저장소에 60일간 활동이 없으면 GitHub이 예약 실행을 끕니다. Actions 탭에서 다시 켜세요 |
| 이미지에 "아직 시작 전이에요" | `start_date`가 미래입니다 |
| 이미지에 "루틴이 끝났어요" | `routine`과 `start_date`를 다음 루틴으로 바꾸세요 |

## 시간 기준

GitHub Actions의 예약(`cron`)은 **UTC** 기준입니다. `17 15 * * *`는 UTC 15:17, 즉 한국시간 00:17입니다. 이미지 계산의 "오늘"은 한국시간 기준이에요.
