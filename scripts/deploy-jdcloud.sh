#!/usr/bin/env bash
# Deploy feynman-study-assistant to JD Cloud (rsync via /tmp + sudo + pm2 restart).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${DEPLOY_HOST:-ubuntu@111.228.6.222}"
REMOTE_DIR="${DEPLOY_PATH:-/opt/zhifan-feynman-study}"
STAGING="/tmp/zhifan-feynman-study-deploy"

echo "==> Build locally"
cd "${ROOT}"
npm run build

echo "==> Stage to ${REMOTE}:${STAGING}"
ssh "${REMOTE}" "rm -rf '${STAGING}' && mkdir -p '${STAGING}'"
rsync -az \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.data' \
  --exclude '.data-*' \
  --exclude '.env' \
  --exclude 'tests' \
  "${ROOT}/" "${REMOTE}:${STAGING}/"

echo "==> Install into ${REMOTE_DIR} and restart"
ssh "${REMOTE}" bash -s <<REMOTE
set -euo pipefail
STAGING='${STAGING}'
REMOTE_DIR='${REMOTE_DIR}'
sudo rsync -a \
  --exclude '.env' \
  --exclude '.data' \
  --exclude 'node_modules' \
  "\${STAGING}/" "\${REMOTE_DIR}/"
cd "\${REMOTE_DIR}"
sudo npm install --omit=dev
if sudo grep -q '^GENERATION_TIMEOUT_MS=' .env; then
  sudo sed -i 's/^GENERATION_TIMEOUT_MS=.*/GENERATION_TIMEOUT_MS=180000/' .env
else
  echo 'GENERATION_TIMEOUT_MS=180000' | sudo tee -a .env >/dev/null
fi
if sudo grep -q '^INGESTION_GENERATION_TIMEOUT_MS=' .env; then
  sudo sed -i 's/^INGESTION_GENERATION_TIMEOUT_MS=.*/INGESTION_GENERATION_TIMEOUT_MS=300000/' .env
else
  echo 'INGESTION_GENERATION_TIMEOUT_MS=300000' | sudo tee -a .env >/dev/null
fi
if sudo grep -q '^ONE_PAGER_TIMEOUT_MS=' .env; then
  sudo sed -i 's/^ONE_PAGER_TIMEOUT_MS=.*/ONE_PAGER_TIMEOUT_MS=180000/' .env
else
  echo 'ONE_PAGER_TIMEOUT_MS=180000' | sudo tee -a .env >/dev/null
fi
sudo pm2 restart zhifan-feynman-study --update-env
sleep 3
PORT=\$(sudo grep -E '^PORT=' .env | cut -d= -f2 || echo 8787)
echo "Checking http://127.0.0.1:\${PORT}/api/health"
curl -fsS "http://127.0.0.1:\${PORT}/api/health" | head -c 500 || {
  echo "health via PORT failed; trying common ports"
  for p in 8787 8788; do
    curl -fsS "http://127.0.0.1:\${p}/api/health" | head -c 500 && break || true
  done
}
echo
sudo pm2 status zhifan-feynman-study
rm -rf "\${STAGING}"
REMOTE

echo "==> Ensure nginx upload limits for study.aidigitcloud.cn"
"${ROOT}/scripts/ensure-nginx-study.sh"

echo "==> Done"
