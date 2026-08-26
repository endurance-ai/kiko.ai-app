# 환경 변수

> `.env.local` 에 들어가는 전체 키 + AWS 측 자격증명. 코드 grep 기반 실측. 2026-05-10 Vercel pause 이후 prod 도 dev-app EC2 의 컨테이너 환경변수가 단일 소스.

## 필수

| 키 | 용도 | 노출 |
|---|---|---|
| `OPENAI_API_KEY` | GPT-4o-mini Vision/Text | 서버 전용 |
| `DB_URL` | PostgREST 엔드포인트. 현재 dev-app 의 nginx PostgREST shim 을 가리킴 — Supabase.com 미사용 (SPEC-INFRA-MIGRATE-001 P6 이후, P8 에서 SUPABASE_URL → DB_URL 리네임) | 서버 전용 |
| `DB_TOKEN` | PostgREST service JWT — DB 쓰기/관리 (구 SUPABASE_SERVICE_ROLE_KEY) | 서버 전용 |
| `DATABASE_URL` | pg Pool 직접 접속 (Auth.js admin_profiles 조회용, P3) — `postgresql://user:pass@host:5432/db` 형식 | 서버 전용 |
| `AUTH_SECRET` | Auth.js JWT 서명 비밀키 (`openssl rand -hex 32`) | 서버 전용 |
| `INTERNAL_API_KEY` | `/api/internal/*` 보호 키 (크롤러 → kiko.ai 호출용). 양쪽 동일 값 (`openssl rand -hex 32`). 최소 16자 | 서버 전용 |
| `NEXTAUTH_URL` | Auth.js 콜백 베이스 URL (dev: `http://localhost:3400`, prod: 도메인) | 서버 전용 |

## 선택 (opt-in)

| 키 | 용도 | 기본 동작 |
|---|---|---|
| `APIFY_TOKEN` | Instagram post 스크래핑 (`apify/instagram-post-scraper` actor) | 미설정 시 fetch-post 실패 — 메인 플로우 v2 진입점에서 필수가 될 예정 |
| `LITELLM_BASE_URL` | LiteLLM 프록시 base URL (`54.116.116.225:4000`). 메인 플로우(analyze-post) + 브랜드 메타 추론 배치(fill_brand_meta.py) + brand-VLM 분류(`/api/internal/classify-brand`) 공통 | 미설정 시 OpenAI 직접 호출 |
| `LITELLM_API_KEY` | 프록시 인증 | OPENAI_API_KEY로 폴백 |
| `LITELLM_MODEL` | 프록시 모델 명시 | (현재 코드는 항상 `gpt-4o-mini`) |
| `LITELLM_DISABLED` | `true` 로 두면 즉시 OpenAI direct 폴백 | 프록시 죽었을 때 비상 스위치 |
| `AI_SERVER_URL` | kiko-ai-server (FastAPI) base URL — 어드민 search-debugger(`AI_API_URL`)의 fallback 키. (구 `/api/find/search` 는 2026-05-22 제거) | 미설정 시 search-debugger 에서 AI 서버 호출 비활성 |
| `AI_API_URL` | 어드민 search-debugger v2 가 AI 서버를 직접 호출할 때 사용 (`AI_API_URL` → `AI_SERVER_URL` 순서로 fallback). `src/domains/admin-tools/search-debug/ai-client.ts` | 미설정 시 search-debugger 에서 "AI_API_URL not configured" 오류 |
| `INTERNAL_API_TOKEN` | 어드민 search-debugger → AI 서버 내부 API 호출 시 `X-Internal-Token` 헤더 값. `src/domains/admin-tools/search-debug/ai-client.ts` | 미설정 시 토큰 없이 호출 (AI 서버 인증 정책에 따라 거부될 수 있음) |
| `AI_SERVER_TIMEOUT_MS` | AI 서버 호출 타임아웃 (ms) | 기본 8000 |
| `PROXY_HOST` / `PROXY_PORT` / `PROXY_USER` / `PROXY_PASS` | Instagram 스크래퍼 undici ProxyAgent | 미설정 시 직접 연결 |
| `LOG_LEVEL` | pino 로그 레벨 | 기본 `info` |
| `EVAL_BASE_URL` | 평가 스크립트 (`scripts/eval-*.ts`) 의 타깃 URL | — |
| `KIKO_AI_TOKEN` | 랜딩(/explore·/chat)의 `/api/chat/stream`·`/api/product/[id]` 가 ai-server 에 붙일 때 쓰는 서버측 bearer (ai-server JWT). **익명 방문자 전원이 이 토큰 하나를 공유한다** | 미설정 시 `/api/chat/stream` 이 501 `live chat not configured` |
| `KIKO_AI_BASE` | 위 프록시의 업스트림 base URL | 기본 `https://dev-ai.kikoai.me` |
| `CHAT_RATE_ENABLED` | `/api/chat/stream` 레이트리밋 킬스위치. `false` 면 게이트 전체 우회 | 기본 `true` |
| `CHAT_RATE_PER_MIN` | IP 당 분당 요청 (`0` = 끔) | 기본 `5` |
| `CHAT_RATE_PER_HOUR` | IP 당 시간당 요청 (`0` = 끔) | 기본 `60` |
| `CHAT_RATE_DAILY_GLOBAL` | 랜딩 전체 하루 요청 예산, KST 자정 리셋 (`0` = 끔) | 기본 `800` |

## 자동/시스템

| 키 | 출처 |
|---|---|
| `NODE_ENV` | Next.js 자동 |
| `NEXT_PUBLIC_*` | Next.js 빌드타임 인라인 (이전: Vercel 빌드 — 2026-05-10 dev-app EC2 Docker 빌드로 전환) |

---

## AWS 자격증명

`scripts/aws/launch_embed_batch.sh` 가 사용. `.env.local` 이 아닌 `~/.aws/credentials` 의 프로필을 읽음.

| 프로필 | 용도 | 리전 |
|---|---|---|
| `kiko.ai` | EC2 Spot 기동 (FashionSigLIP 임베딩 배치) | `ap-northeast-2` |

배치 실행 전 사전 조건:
1. `~/.aws/credentials` 에 `kiko.ai` 프로필
2. EC2 key pair `portal-key` (디버그 SSH용, 없으면 스크립트가 생성 제안)
3. `.env.local` 에 `DB_URL` + `DB_TOKEN` — 임베딩 배치는 dev-app PostgREST 가 아닌 dev-app Postgres 직접 접근(또는 RPC) 으로 변경 예정. 현재 user-data 로 EC2 에 주입

---

## prod 환경 (dev-app EC2)

- 2026-05-10 이전: Vercel Project Settings → Environment Variables 에 등록
- 2026-05-10 이후 (현재): dev-app EC2 의 `docker compose` env 파일 (`/opt/kikoai-dev/.env.app`) + GitHub Actions secrets 가 단일 소스. Vercel pause.
- `NEXT_PUBLIC_*` 만 빌드타임 인라인 — GHA Docker 빌드 단계에서 주입
- LiteLLM 관련은 현재 prod에도 미설정 (OFF 상태) — v5 인프라 재설계와 함께 켤 때 같이 등록

---

## 시크릿 노출 체크

- 서비스 롤 키 / OpenAI 키 / `AUTH_SECRET` / `DATABASE_URL` 는 절대 클라이언트 노출 금지
- `src/lib/supabase.ts`, `src/lib/admin-auth.ts`, `src/lib/db.ts` 모두 `import "server-only"` 로 가드
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — 제거됨 (P8 SUPABASE_* → DB_* 리네임 시점). Auth.js 전환(P3) 후 어드민 Auth 용도 미사용 + PostgREST shim 도 service role 만 사용 → 클라이언트 PostgREST 직접 호출 없음. 코드 잔존 0건 확인.
- 로컬 `.env.local` 은 `.gitignore` — 절대 커밋 금지
