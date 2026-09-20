#!/bin/bash
# ==============================================================================
# kiko-app (Next.js standalone) 배포 스크립트 — kikoai dev-app
# ==============================================================================
# 사용법: ./deploy.app.sh <IMAGE_TAG>
# 예시:   ./deploy.app.sh 20260507150000-abc1234
#
# 위치: /home/ec2-user/scripts/deploy.app.sh (dev-app EC2)
# 트리거: kikoai/app 리포의 .github/workflows/deploy-dev.yml 이 SSH 로 호출
#
# 주의: env_file (.env) 만 수정한 후에는 `docker compose restart` 로는 새 값이
#       컨테이너에 반영되지 않는다. `--force-recreate` 가 필수:
#         ECR_REGISTRY=<...> sudo --preserve-env=ECR_REGISTRY \
#           docker compose --env-file env/.env up -d --force-recreate --no-deps app
#       본 스크립트는 이미지 태그를 바꾸므로 자동으로 recreate 된다.
# ==============================================================================

set -e

# ======================================================
#   1. 환경 설정
# ======================================================
HOME_DIR="/home/ec2-user"
COMPOSE_DIR="${HOME_DIR}"
ENV_FILE="${COMPOSE_DIR}/env/.env"
SERVICE_NAME="app"

cd "$COMPOSE_DIR"

if [ ! -f "$ENV_FILE" ]; then
    echo "[ERROR] .env 파일을 찾을 수 없습니다: $ENV_FILE"
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [ -z "$1" ]; then
    echo "[ERROR] 이미지 태그가 필요합니다."
    echo "사용법: ./deploy.app.sh <IMAGE_TAG>"
    exit 1
fi

IMAGE_TAG=$1
# .env 가 다른 용도(Bedrock 등)의 AWS_PROFILE / AWS_REGION 을 setting 할 수 있음.
# deploy 는 EC2 IAM role + ap-northeast-2 ECR 로 고정 — env 값 모두 오버라이드.
unset AWS_PROFILE
DEPLOY_AWS_REGION="ap-northeast-2"
AWS_REGION="$DEPLOY_AWS_REGION"
export AWS_REGION
export AWS_DEFAULT_REGION="$DEPLOY_AWS_REGION"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-120}"
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
export TZ=Asia/Seoul

# AWS 계정 ID — IAM Role 사용
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --region "$DEPLOY_AWS_REGION" --query Account --output text 2>/dev/null)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "[ERROR] AWS 계정 ID 조회 실패 (IAM Role 확인)"
    exit 1
fi

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPOSITORY="kikoai-dev/app"
DOCKER_IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"

# docker-compose.yml 이 참조하는 변수
export AWS_ACCOUNT_ID
export KIKOAI_APP_TAG="${IMAGE_TAG}"
export ECR_REGISTRY

# ======================================================
#   2. Discord 알림
# ======================================================
send_discord_message() {
    local status=$1
    local message=$2
    [ -z "$DISCORD_WEBHOOK_URL" ] && return 0

    local emoji=":white_check_mark:"
    [ "$status" = "failure" ] && emoji=":x:"
    [ "$status" = "start" ]   && emoji=":rocket:"

    local content="${emoji} **[kikoai-app DEV]** ${message}\\n- Service: ${SERVICE_NAME}\\n- Tag: \`${IMAGE_TAG:0:18}\`\\n- Time: $(date '+%Y-%m-%d %H:%M:%S')"
    local JSON_PAYLOAD=$(cat <<EOF
{ "content": "${content}" }
EOF
)
    curl -s -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1 || true
}

send_discord_failure() {
    local error=$1
    [ -z "$DISCORD_WEBHOOK_URL" ] && return 0
    local ERROR_LOG=$(echo "$error" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
    local content="🚨 **[kikoai-app DEV]** 배포 실패!\\n- Tag: \`${IMAGE_TAG:0:18}\`\\n- Time: $(date '+%Y-%m-%d %H:%M:%S')\\n\\n**에러 로그:**\\n\`\`\`\\n${ERROR_LOG}\\n\`\`\`"
    local JSON_PAYLOAD=$(cat <<EOF
{ "content": "${content}" }
EOF
)
    curl -s -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1 || true
}

trap 'send_discord_failure "스크립트 ${LINENO}번째 줄에서 \"${BASH_COMMAND}\" 실행 실패"' ERR

# ======================================================
#   3. ECR 로그인 + Pull
# ======================================================
echo "====================================="
echo "[kikoai-app DEV] 배포 시작"
echo "Image: $DOCKER_IMAGE_URI"
echo "====================================="

send_discord_message "start" "배포 시작"

echo ""
echo "[1/5] ECR 로그인"
aws ecr get-login-password --region "$AWS_REGION" | \
    sudo docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo ""
echo "[2/5] 이미지 Pull"
sudo docker pull "$DOCKER_IMAGE_URI"

# latest 태그 동기화
LATEST_IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
if [ "$IMAGE_TAG" != "latest" ]; then
    echo ">>> 로컬 latest 태그 갱신: ${IMAGE_TAG} -> latest"
    sudo docker tag "$DOCKER_IMAGE_URI" "$LATEST_IMAGE_URI"
fi

# ======================================================
#   DB 함수 동기화 (search_products_v6 등) ← 7/10 사고 재발 방지
# ======================================================
# db 컨테이너 로컬 exec (peer/trust, 무비번). app 재기동 전에 DB 정렬 → 드리프트 창 없음.
# 각 파일은 모든 오버로드 DROP 후 재생성(BEGIN/COMMIT 원자)이라 시그니처 바뀌어도 안전.
# NOTE: ~/sql/functions/*.sql 는 ai-server 리포 sql/functions/ 의 사본 — 함수 변경 시 동기화 필요.
echo ""
echo ">>> DB 함수 적용 (~/sql/functions/*.sql)"
n=0
for f in "$HOME"/sql/functions/*.sql; do
    [ -e "$f" ] || continue
    n=$((n+1))
    echo ">>> apply $(basename "$f")"
    sudo docker exec -i db psql -U postgres -d kikoai -v ON_ERROR_STOP=1 < "$f"
done
[ "$n" -gt 0 ] || { echo "[ERROR] ~/sql/functions/*.sql 없음"; exit 1; }

# ======================================================
#   4. 컨테이너 재기동
# ======================================================
echo ""
echo "[3/5] app 컨테이너 재기동"
sudo --preserve-env=KIKOAI_APP_TAG,ECR_REGISTRY,AWS_ACCOUNT_ID \
    docker compose --env-file env/.env up -d --no-deps ${SERVICE_NAME}

# ======================================================
#   5. Health Check
# ======================================================
echo ""
echo "[4/5] Health Check (최대 ${HEALTH_CHECK_TIMEOUT}초)"
sleep 10

SECONDS_ELAPSED=10
while true; do
    echo ">>> Health check 중... (${SECONDS_ELAPSED}s)"

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80/api/health" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        echo ""
        echo "[SUCCESS] Health check 응답 (HTTP $HTTP_CODE)"
        break
    fi

    if [ $SECONDS_ELAPSED -ge $HEALTH_CHECK_TIMEOUT ]; then
        echo ""
        echo "[ERROR] Health check 타임아웃 (${HEALTH_CHECK_TIMEOUT}초)"
        echo "=== 컨테이너 로그 (최근 50줄) ==="
        sudo docker logs --tail 50 ${SERVICE_NAME} 2>&1
        sudo docker compose --env-file env/.env stop ${SERVICE_NAME} || true
        send_discord_failure "Health check 타임아웃 (${HEALTH_CHECK_TIMEOUT}초)"
        exit 1
    fi

    sleep 5
    SECONDS_ELAPSED=$((SECONDS_ELAPSED + 5))
done

# ======================================================
#   6. 정리
# ======================================================
echo ""
echo "[5/5] dangling 이미지 정리"
sudo docker image prune -af > /dev/null 2>&1 || true

echo ""
echo "====================================="
echo "[SUCCESS] 배포 완료!"
echo "====================================="
sudo docker compose --env-file env/.env ps ${SERVICE_NAME}

send_discord_message "success" "배포 성공!"
