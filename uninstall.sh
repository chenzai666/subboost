#!/bin/sh

echo "[subboost] 即将完整卸载 SubBoost，包括容器、数据卷、镜像和本地数据文件。"
printf "确认继续？(y/N) "
read -r confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "[subboost] 已取消。"
  exit 0
fi

# 停止并删除容器、网络、数据卷
echo "[subboost] 停止并删除容器、网络、数据卷..."
docker compose down -v --remove-orphans 2>/dev/null || true

# 删除镜像
echo "[subboost] 删除本地镜像..."
docker rmi -f bats666/subboost:latest 2>/dev/null || true
docker rmi -f postgres:16-alpine 2>/dev/null || true
docker rmi -f curlimages/curl:8.11.1 2>/dev/null || true

# 删除残留 volume（防止 compose 未能清理干净）
docker volume rm subboost_subboost-db 2>/dev/null || true

# 删除本地密钥和配置文件
echo "[subboost] 删除本地数据文件..."
rm -rf .data .env

echo "[subboost] 卸载完成。如需删除项目目录，请手动执行："
echo "  cd .. && rm -rf $(pwd)"
