# kiko.ai

AI 이미지 기반 패션 스타일 분석 & 크로스플랫폼 상품 추천. "Paste any Instagram post. We'll tell you where to buy the fit."

## 활성 진입점

- `/admin` — 어드민 대시보드 (승인 게이트). **현재 유일 활성 표면.**
- `/` — `/admin` 으로 redirect (공개 IG "snitch" 플로우는 2026-05-22 제거 — admin 전용 전환).

> **2026-05-22 admin 전용 전환**: 공개 IG 플로우(`page.tsx`/`_components`/`api/find`/`api/instagram`/`api/analyze`/`api/feedback` + `domains/{vision,search,instagram}` + 관련 lib) 일괄 제거. 봇(ai 리포)은 app 미호출(Postgres 직결)이라 영향 없음. 검색/Vision 엔진은 ai 리포 + 어드민 search-debugger 자체 모듈에 잔존.

## 작업 규칙

- `docs/archive/` 는 종료된 문서 산출물 보관소. **탐색·참조하지 않는다.**
- ~~`src/app/_archive-qa/`~~ — **삭제됨** (SPEC-ARCH-APP-001 step 8, 2026-05-17). 구 Q&A 6단계 코드, 더 이상 존재하지 않음 — 참조 불가.
- 새 plan/spec은 `docs/plans/` 또는 `docs/research/` 에 작성. 종료 시 archive로 이동.
- 결정 지점이 모호하면 **혼자 가정하지 말고 먼저 질문할 것** (설계·기획·리팩터링 방향 등).

## ❗ 필수 동기화 문서 3종 (절대 stale 금지)

다음 3개 doc 은 코드 변경 시 **반드시 함께 업데이트**한다. 메인 플로우·검색·아키텍처가 stale 된 채 머지되면 신규 합류자/AI 가 잘못된 그림으로 작업 시작함.

| Doc | 트리거 — 다음 변경 시 갱신 |
|---|---|
| `docs/ARCHITECTURE.md` | 외부 서비스 추가/제거, 토폴로지 변경, 활성 진입점 변경, 마이그레이션 머지 |
| `docs/features/main-flow.md` | `/api/instagram/*`, `/api/find/*`, `_components/find-*` 변경, 에러 코드 추가/삭제, 캐시·picker UX 흐름 변경 |
| `docs/features/search-engine.md` | `/api/admin/search-v6-debug` 변경, v6 embedding-first 진척, 검색 관련 enum/사전/RPC 변경 (`/api/search-products` 는 feature/redesign-admin에서 삭제됨) |

**`/feature-finalize` 스킬의 doc-update 단계에서 이 3개는 "변경 없음" 처리 금지.** 매 PR마다 코드 diff 와 cross-check 후 본문 갱신 여부 명시.

## 개발 명령어

```bash
pnpm dev          # 개발 서버 (localhost:3400)
pnpm build        # 프로덕션 빌드 (Turbopack)
pnpm lint         # ESLint
pnpm test         # vitest 1회
pnpm test:watch   # vitest watch
```

## 기술 스택 (한눈에)

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Turbopack), React 19 |
| UI | Tailwind 4, shadcn/ui, framer-motion, Pretendard |
| 인증 | Auth.js v5 (next-auth@5 beta) Credentials Provider + bcryptjs + pg Pool (SPEC-INFRA-MIGRATE-001 P3) |
| 이미지 분석 | OpenAI GPT-4o-mini Vision (LiteLLM 프록시 토글, 현재 OFF) |
| 검색 | **v6** (embedding-first, SPEC-SEARCH-V6-001) — `search_products_v6` RPC (072, 082 verbatim JOIN 정정) + `product_embeddings` halfvec(768) HNSW. ~~v4 어드민 전용 (`/api/search-products`)~~ — feature/redesign-admin에서 삭제, 어드민 search-debugger가 `/api/admin/search-v6-debug` 로 전환됨. PAI·pgroonga·v5 어댑터 폐기 (069) |
| 저장 | 자체호스트 Postgres 16 (dev-app EC2) + pgvector, PostgREST 게이트웨이 (nginx shim, SPEC-INFRA-MIGRATE-001 P6), Cloudflare R2 |
| 크롤러 | **외부 리포 [`endurance-ai/crawler`](https://github.com/endurance-ai/crawler)** — Playwright (Cafe24 22) + Shopify JSON (10), 81k SKU / 697 브랜드 |
| 배포 | dev-app EC2 self-host (Dockerfile + GitHub Actions CI/CD, SPEC-INFRA-MIGRATE-001 P5) + AWS EC2 g5 Spot (임베딩 배치). 2026-05-10 Vercel pause |

## 코딩 컨벤션

- 컴포넌트: PascalCase, named export. `export default` 는 page/layout 만
- 경로 별칭: `@/*` → `src/*`
- shadcn/ui: `pnpm dlx shadcn@latest add <component>`
- 서버/클라이언트: RSC 기본, 인터랙션 시만 `"use client"`
- 서버 모듈: `import "server-only"` 로 누출 가드 (R2, PostgREST service JWT, pg Pool, Auth.js)
- UI 텍스트: 메인 영어, 어드민 한글 (영어 고유명사 유지)
- 코드 스타일: 무필요 주석/추상화 금지. 기능 추가 외 정리는 별도 PR

## 📍 문서 매핑

작업 시작 전 해당 doc 1개만 Read 하면 됨.

| 작업 영역 | 읽을 doc |
|---|---|
| 시스템 전체 그림 / 토폴로지 | `docs/ARCHITECTURE.md` |
| 메인 플로우 (IG 스크래퍼 → Vision → 검색) | `docs/features/main-flow.md` |
| 검색 엔진 (v6 embedding-first / v4 어드민) | `docs/features/search-engine.md` |
| 크롤러 (외부 리포 — `endurance-ai/crawler`) | `docs/features/crawler.md` (데이터 흐름만, 본체 코드는 외부 리포) |
| DB 스키마 / 마이그레이션 / RLS | `docs/infra/data-model.md` |
| 환경변수 / AWS 프로필 | `docs/infra/env.md` |
| 배포 / EC2 Spot / Git 워크플로 | `docs/infra/deployment.md` |
| 새 API route / DB·인증 클라이언트 / 프론트 패턴 | `docs/PATTERNS.md` |
| 디자인 시스템 (Editorial, cream/ink, Pretendard) | `docs/design/system.md` |
| 활성 plan (실행 대기) | `docs/plans/` |
| 경쟁사·차별화 리서치 | `docs/research/` |
| 새 크롤 사이트 추가 가이드 | [`endurance-ai/crawler` README](https://github.com/endurance-ai/crawler) (DB 스키마 변경 시만 kiko.ai 작업 필요 — `docs/guides/platform-parser-guide.md`) |

> 어드민/archived flow 는 분리 안 함 → `docs/ARCHITECTURE.md` 안에 한 섹션씩.

## 작업 가이드라인

### Scope Challenge (브레인스토밍 단계)
- "이거 진짜 필요한가?" — 기존 코드/라이브러리로 해결 가능한지 먼저 확인
- 최소 범위는 뭔가? 절반으로 줄일 수 있나?
- 설명에 "그리고" 가 3번 이상 = 분해 필요 신호

### AI Slop 블랙리스트 (UI 작업 시)
- 보라색 그라디언트, 3-칼럼 피처 그리드
- 장식용 이모지, 전부 가운데 정렬
- 균일한 border-radius, blob/divider 장식
- 제네릭 카피 ("Unlock your potential" 류), 쿠키커터 카드 패턴

### NOT in scope (플랜 작성 시)
- 모든 plan 문서에 "NOT in scope" 섹션 필수
- 명시적으로 "이번에 안 하는 것" 나열 — 스코프 크리프 방지

## docs 파일명 컨벤션

`yy-mm-dd-{설명}.md` — 예: `26-04-26-search-engine-v5.md`
- 설명은 다른 문서와 구분되도록 구체적으로
- `docs/plans/`, `docs/research/` 둘 다 적용
- `docs/ARCHITECTURE.md`, `docs/PATTERNS.md`, `docs/features/*`, `docs/infra/*`, `docs/design/*` 는 예외 (고정 이름)

## GitHub

- 조직: endurance-ai · 레포: [endurance-ai/kiko.ai-app](https://github.com/endurance-ai/kiko.ai-app) (public)
- 기본 브랜치: `dev` · 흐름: dev → feature → PR → squash merge
- `git add -A` 금지, force push 금지
- **Commit attribution**: MoAI-ADK 표준 적용 (`.claude/settings.json` 의 `attribution.commit/pr` = `🗿 MoAI <email@mo.ai.kr>`). 기존 `Co-Authored-By: Claude` 룰은 폐기 (2026-05-04, MoAI 전면 도입). legacy 백업: `CLAUDE.md.pre-moai`
## 디자인 규칙 (애플 하네스)
- 모든 UI/화면/컴포넌트 설계·구현은 `apple-designer` 에이전트로 위임한다. 일반 AI풍 디자인 금지.
- 애플 정본만 사용: `.claude/skills/apple-hig`, `apple-design`, `apple-hig/reference/blueprints.md`, `scope.md`.
- PreToolUse(주입)·PostToolUse(감사)·Stop(게이트) 애플 훅이 UI 파일 편집을 강제 검사한다.
- 정본 canonical = kikoai-mobile. 수정 후 `scripts/sync-apple-skills.sh <target-repo>`로 동기화.
