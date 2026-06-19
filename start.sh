#!/bin/sh
set -e

ENV_FILE=".env"
STATE_DIR=".data"
mkdir -p "$STATE_DIR"

gen_secret() {
  openssl rand -hex 32
}

load_or_gen() {
  local key="$1" file="$STATE_DIR/.$2"
  if [ -f "$file" ]; then
    cat "$file"
  else
    val=$(gen_secret)
    printf '%s' "$val" > "$file"
    printf '%s' "$val"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "[subboost] 首次启动，自动生成密钥..."

  POSTGRES_PASSWORD=$(load_or_gen POSTGRES_PASSWORD pg_password)
  ENCRYPTION_KEY=$(load_or_gen ENCRYPTION_KEY encryption_key)
  JWT_SECRET=$(load_or_gen JWT_SECRET jwt_secret)
  CRON_SECRET=$(load_or_gen CRON_SECRET cron_secret)

  cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_SECRET=${JWT_SECRET}
CRON_SECRET=${CRON_SECRET}
APP_URL=http://localhost:8488
SUBBOOST_PORT=8488
EOF

  echo "[subboost] 密钥已写入 ${ENV_FILE}"
else
  echo "[subboost] 使用已有的 ${ENV_FILE}"
fi

docker compose pull
docker compose up -d
echo "[subboost] 启动完成，访问: $(grep APP_URL $ENV_FILE | cut -d= -f2)"
