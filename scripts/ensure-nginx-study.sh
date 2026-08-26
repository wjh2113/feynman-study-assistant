#!/usr/bin/env bash
# Ensure study.aidigitcloud.cn nginx allows batch uploads (12 × 100 MB) and long proxy timeouts.
set -euo pipefail

REMOTE="${DEPLOY_HOST:-ubuntu@111.228.6.222}"
CONF="/etc/nginx/conf.d/aidigitcloud.conf"
MARKER="client_max_body_size 1200m"

ssh "${REMOTE}" bash -s <<'REMOTE'
set -euo pipefail
CONF="/etc/nginx/conf.d/aidigitcloud.conf"
MARKER="client_max_body_size 1200m"

if sudo grep -q "${MARKER}" "${CONF}"; then
  echo "nginx: ${MARKER} already present"
else
  echo "nginx: patching study HTTPS block for large uploads"
  sudo python3 - <<'PY'
from pathlib import Path

path = Path("/etc/nginx/conf.d/aidigitcloud.conf")
text = path.read_text()
needle = """# study -> zhifan-feynman-study (port 8787)
server {
    listen 443 ssl;
    server_name study.aidigitcloud.cn;

    ssl_certificate /etc/nginx/ssl/aidigitcloud.cn/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/aidigitcloud.cn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 增加 API 相关超时和缓冲设置
    proxy_connect_timeout 30s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;"""
insert = """# study -> zhifan-feynman-study (port 8787)
server {
    listen 443 ssl;
    server_name study.aidigitcloud.cn;

    ssl_certificate /etc/nginx/ssl/aidigitcloud.cn/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/aidigitcloud.cn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 批量资料上传：最多 12 个文件 × 100 MB
    client_max_body_size 1200m;

    # 增加 API 相关超时和缓冲设置
    proxy_connect_timeout 30s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;"""
if needle not in text:
    raise SystemExit("study nginx block not found; manual patch required")
path.write_text(text.replace(needle, insert, 1))
PY
fi

sudo nginx -t
sudo systemctl reload nginx
echo "nginx: reloaded OK"
REMOTE
