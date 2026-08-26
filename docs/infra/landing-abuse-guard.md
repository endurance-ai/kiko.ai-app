# 랜딩(/explore) 어뷰징 방어 · 토큰 예산 런북

> 2026-08-26 작성. 광고 랜딩 `https://kikoai.me/explore` 가 익명으로 LLM 검색을 돌리는 동안의
> 레이트리밋 · 토큰 예산 · 모니터링 절차.

## 1. 왜 여기가 방어선인가

```
인터넷 → ALB(kikoai-dev-alb) → web 컨테이너 :81 (Next fallback rewrite)
                                    → app 컨테이너 :3000  /api/chat/stream   ← 여기
                                          → ai-server dev-ai.kikoai.me /v1/chat/*
```

`/explore`·`/chat`·`/api/chat/*` 는 `kiko.ai-web/next.config.ts` 의 fallback rewrite 로
**kiko.ai-app 컨테이너**가 서빙한다. 그리고 `/api/chat/stream` 은 서버측 `KIKO_AI_TOKEN`
(ai-server JWT) 하나를 **모든 익명 방문자가 공유**해서 붙인다. 즉 방문자 구분이 없고,
이 라우트 앞뒤 어디에도 다른 레이트리밋이 없다.

주의: `dev-app.kikoai.me/api/chat/stream` 으로 랜딩을 **우회**해 직접 때리는 것도 가능하다
(ALB 가 host 규칙으로 app 컨테이너를 그대로 노출). 앱단 리밋은 두 경로 모두에 걸린다.

## 2. per-IP 레이트리밋 (배포됨)

구현: `src/lib/rate-limit.ts` + `src/app/api/chat/stream/route.ts`.
dev-app 에 Redis 가 없고(ai-server 의 Redis 는 dev-ai 소속) `app` 컨테이너가 1개라
**프로세스 로컬 인메모리 카운터**가 곧 전역 카운터다.

| env | 기본값 | 의미 |
|---|---|---|
| `CHAT_RATE_ENABLED` | `true` | `false` 로 두면 게이트 전체 우회 (킬스위치) |
| `CHAT_RATE_PER_MIN` | `5` | IP 당 분당 요청 |
| `CHAT_RATE_PER_HOUR` | `60` | IP 당 시간당 요청 |
| `CHAT_RATE_DAILY_GLOBAL` | `800` | 랜딩 **전체** 하루 요청 (KST 자정 리셋) |

`0` 은 해당 제한만 끔. 초과 시 `429` + `Retry-After` + `{"detail":"..."}` —
클라이언트(`src/app/(chat)/_lib/chat-stream.ts`)가 이미 `detail` 을 에러 배너로 렌더한다.

### 클라이언트 IP 는 XFF 의 **마지막** 항목이다

ALB 는 클라이언트가 보낸 `X-Forwarded-For` 뒤에 실제 소스 IP 를 append 하고,
Next 의 rewrite 프록시는 XFF 를 건드리지 않고 그대로 넘긴다(`xfwd` 를 켜지 않는다).
따라서 마지막 항목만 신뢰할 수 있다. **`xff.split(",")[0]` 은 클라이언트가 위조 가능하다.**

마지막 항목이 사설/루프백/CGNAT(10/8, 172.16/12, 192.168/16, 127/8, 100.64/10, `::1`,
`fc00::/7`, `fe80::/10`)이면 "미해결"로 보고 **per-IP 는 fail-open** 한다. XFF 체인이 예상과
달라 도커 내부 IP 가 잡혔을 때 전원이 한 버킷에 묶여 다 같이 차단되는 사고를 막는 안전장치다.
(글로벌 하루 예산은 이 경우에도 그대로 걸린다.)

### env 변경

`docker compose restart` 로는 `env_file` 이 안 먹는다.

```bash
ssh -i ~/Desktop/aws-infra/kikoai-key.pem ec2-user@15.165.107.28
cd /home/ec2-user
vi env/.env                     # CHAT_RATE_* 수정
ECR_REGISTRY=717740918281.dkr.ecr.ap-northeast-2.amazonaws.com \
  sudo --preserve-env=ECR_REGISTRY \
  docker compose --env-file env/.env up -d --force-recreate --no-deps app
```

**롤백**: `CHAT_RATE_ENABLED=false` 후 위 recreate.

## 3. 일일 토큰 캡 — 랜딩 계정은 캡 밖

### 랜딩 공유 계정 (2026-08-26 실측)

`KIKO_AI_TOKEN` 의 JWT `sub` 로 `GET https://dev-ai.kikoai.me/v1/me` 를 조회한 결과:

| 필드 | 값 |
|---|---|
| `user_id` | `634830a0-db01-4682-a8b2-9a41024e1c71` |
| `provider` | `dev` (소셜 로그인 아님 — 실제 사용자 계정이 아니다) |
| `email` | `web-landing-test@kiko.dev` |
| `display_name` | `Web Landing Test` |
| `created_at` | 2026-08-24 22:11 KST |
| `tier` | `free` |

랜딩 전용 계정이다. 이 1행을 `developer` 로 올려도 다른 계정에는 영향이 없다.
캡 읽기 키는 `kiko:cap:2542335457077839490` (`_user_id_to_chat_id` 파생).

> ⏰ **토큰 만료 2026-08-31 22:11 KST** (발급 8/24 + 7일). 만료되면 랜딩 챗이 401 로
> 죽고 사용자에겐 에러 배너만 뜬다. 랜딩을 계속 열어둘 거면 재발급 + 만료 연장 필요.

### tier 승격

`get_app_cap_status` 는 tier 를 Redis 가 아니라 **DB `ai.user_profiles.tier`** 에서 읽는다
(`chat_service._get_app_user_tier`). 따라서 `/debug/cap/tier` 엔드포인트가 아니라 DB UPDATE 다.
`developer` 는 `_tier_cap` 에서 `CAP_TIER_DEVELOPER=0` → 무제한이고, migration
`0017_allow_developer_tier.py` 가 CHECK 제약에 이미 포함시켜 두었다(내부 개발자 grant 용도).

```bash
ssh -i ~/Desktop/aws-infra/kikoai-key.pem ec2-user@15.165.107.28
cd /home/ec2-user

# 1) 현재 상태 + 영향 범위 확인
sudo docker compose exec -T db psql -U postgres -d kikoai -c \
  "SELECT tier, count(*) FROM ai.user_profiles GROUP BY tier ORDER BY 2 DESC;"

# 2) dry-run — "UPDATE 1" 이어야 한다
sudo docker compose exec -T db psql -U postgres -d kikoai <<'SQL'
BEGIN;
UPDATE ai.user_profiles SET tier='developer', updated_at=now()
WHERE user_id='634830a0-db01-4682-a8b2-9a41024e1c71';
ROLLBACK;
SQL

# 3) 확정
sudo docker compose exec -T db psql -U postgres -d kikoai -c \
  "UPDATE ai.user_profiles SET tier='developer', updated_at=now() \
   WHERE user_id='634830a0-db01-4682-a8b2-9a41024e1c71';"

# 되돌리기
#   UPDATE ai.user_profiles SET tier='free', updated_at=now() WHERE user_id='634830a0-...';
```

검증: `/explore` 에서 검색 1회 → 첫 SSE `session` 이벤트에 `daily_cap: 0`, `cap_remaining: null`.
UI 영향 없음 — `chat/page.tsx` 의 `capReached` 는 `cap_reached` **이벤트**로만 켜지고
`session` 의 `daily_cap` 값은 보지 않는다.

`CAP_TIER_FREE` 를 올리는 방법은 쓰지 않는다 — Telegram·모바일의 모든 free 유저에게
같이 적용되어 blast radius 가 랜딩 밖으로 샌다.

### ⚠️ 캡 수정과의 배포 순서

앱/웹 경로의 일일 캡은 2026-08-20(`91a8c1a`) 이후 **발동하지 않고 있었다** — 쓰기는
`kiko:cap:{session_chat_id}`, 읽기는 `kiko:cap:{user_chat_id}` 로 갈려 있었다.
ai-server PR #235 가 이걸 사람 기준으로 고친다.

**순서를 반드시 지킬 것:**

1. 위 tier 승격 (랜딩 계정 → `developer`)
2. dev-ai `.env` 의 `DAILY_TOKEN_CAP_ENABLED` / `CAP_TIER_FREE` 실값 확인
3. ai-server PR #235 머지 → 배포

1번을 건너뛰고 3번을 먼저 하면 랜딩 방문자 전원이 한 계정을 공유하므로 하루 ~10검색만에
`cap_reached` 로 막힌다. 그리고 3번 배포 시점부터 **일반 앱 free 유저에게도 캡이 실제로
켜진다** (8/20 이후 사실상 무제한이었음).

## 4. 엣지 — AWS WAF (미적용, 필요 시)

Vercel Firewall 은 없고(EC2 도커 배포), Cloudflare 는 경로에 없다(Route53 → ALB, ACM 종단).
등가물은 ALB 앞 **AWS WAF rate-based rule** 이다. 아래는 준비만 해둔 절차 — 적용 전 승인 필요.

**챌린지·캡차·Bot Control 은 쓰지 않는다.** 기본 동작이 `Allow` 이고 scope-down 이 경로 한정이라
랜딩 페이지·정적 자산·다른 API 에는 영향이 없다(광고 방문자 이탈 방지).

```bash
export AWS_PROFILE=kikoai-org AWS_REGION=ap-northeast-2

cat > /tmp/waf-rules.json <<'JSON'
[{
  "Name": "ChatPathRateLimit",
  "Priority": 0,
  "Statement": {
    "RateBasedStatement": {
      "Limit": 300,
      "EvaluationWindowSec": 300,
      "AggregateKeyType": "IP",
      "ScopeDownStatement": {
        "ByteMatchStatement": {
          "SearchString": "/api/chat/",
          "FieldToMatch": { "UriPath": {} },
          "TextTransformations": [{ "Priority": 0, "Type": "NONE" }],
          "PositionalConstraint": "STARTS_WITH"
        }
      }
    }
  },
  "Action": { "Block": { "CustomResponse": { "ResponseCode": 429 } } },
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "ChatPathRateLimit"
  }
}]
JSON

aws wafv2 create-web-acl \
  --name kikoai-chat-guard --scope REGIONAL \
  --default-action Allow={} \
  --rules file:///tmp/waf-rules.json \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=kikoaiChatGuard

ALB_ARN=$(aws elbv2 describe-load-balancers --names kikoai-dev-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
ACL_ARN=$(aws wafv2 list-web-acls --scope REGIONAL \
  --query "WebACLs[?Name=='kikoai-chat-guard'].ARN" --output text)

aws wafv2 associate-web-acl --web-acl-arn "$ACL_ARN" --resource-arn "$ALB_ARN"

# 롤백
aws wafv2 disassociate-web-acl --resource-arn "$ALB_ARN"
```

scope-down 이 호스트가 아니라 **경로** 기준이므로 `kikoai.me` 와 `dev-app.kikoai.me` 가
함께 커버된다. 비용: WebACL $5/월 + 규칙 $1/월 + $0.60/100만 요청.

Cloudflare Bot Fight Mode 는 제외 — Route53 → Cloudflare NS 이전이 선행되어야 하고
ACM 와일드카드가 ALB 에서 TLS 를 종단하는 현 구성과 충돌한다.

## 5. 모니터링 (수동)

```bash
# 429 발생량 / 총 챗 요청량 (dev-app)
ssh -i ~/Desktop/aws-infra/kikoai-key.pem ec2-user@15.165.107.28 \
  'cd /home/ec2-user && sudo docker compose logs --since 24h app | grep -c chat_rate_limited'

# XFF 체인이 실제로 공인 IP 를 주는지 (배포 직후 1회 확인 — 프로세스당 한 줄만 찍힌다)
ssh ... 'cd /home/ec2-user && sudo docker compose logs app | grep chat_rate_ip_probe'

# 랜딩 계정의 업스트림 캡 상태 (chat_id = user UUID 앞 8바이트 % 2^62)
curl -s -H "X-Internal-Token: $INTERNAL_API_TOKEN" \
  https://dev-ai.kikoai.me/debug/cap/status/<chat_id> | jq

# 세션별 캡 키가 쌓이는지 (§3 버그의 현장 증거) — dev-ai
ssh -i ~/Desktop/aws-infra/kikoai-key.pem ec2-user@3.35.192.227 \
  'cd /home/ec2-user/docker && docker compose exec -T redis redis-cli -a "$REDIS_AUTH" -n 1 --scan --pattern "kiko:cap:*" | wc -l'
```

LLM 토큰/비용 추이는 **Langfuse** — `https://langfuse.kikoai.me`, trace 이름 `app.chat` 필터.
LiteLLM 은 ai-server 가 **master key** 로 붙어서 virtual-key budget/rpm 제한이 적용되지 않는다.
게이트웨이 레벨 상한이 필요하면 예산 있는 virtual key 발급이 별도 과제.
