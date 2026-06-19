<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="平台：Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.4.0-green.svg" alt="版本 2.4.0">
    <img src="https://img.shields.io/badge/image-Docker%20Hub-blue.svg" alt="Docker Hub 镜像">
  </p>
  <p><strong><a href="README.md">English</a> | <a href="README-CN.md">中文</a></strong></p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost** 是一个 **Clash/Mihomo 订阅转换、增强和管理** 工具。可以将机场订阅和自建节点转换为优化后的聚合订阅，并自动更新。通过 UI 可视化，一键实现 **链式代理、精确分流、防 DNS 泄露和多订阅聚合** 等高级功能。

## 亮点与场景

- **订阅转换**：支持订阅链接、YAML 文件和节点链接等多种格式导入。
- **节点管理**：支持批量对节点重命名、删除或配置监听端口。
- **节点筛选**：可按导入源、地区和自定义规则，构建只有部分节点的 `筛选代理组`。
- **链式代理**：一键可视化配置链式代理和 `中转代理组`。
- **精确分流**：内置 30 多个常用代理组和 2000 多条远程规则集供启用。
- **规则管理**：可修改规则顺序，供高级用户深度自定义。
- **防 DNS 泄露**：默认的 `基础和 DNS 配置` 可防止 DNS 泄露。
- **自动刷新**：定时自动刷新订阅，刷新时可智能匹配节点。

## 界面展示

<p align="center">
  <img src="docs/assets/screenshot-main.png" alt="SubBoost 可视化配置界面" width="960">
</p>

## 部署

**前置要求：** Docker + Docker Compose

```bash
git clone https://github.com/chenzai666/subboost.git
cd subboost
./start.sh
```

首次运行 `start.sh` 会自动生成所有密钥并写入 `.env`，随后拉取镜像（`bats666/subboost`）并启动全部服务（应用 + PostgreSQL + 定时任务）。

默认端口 **8488**，访问 `http://<your-ip>:8488`。

### 手动配置

复制示例配置文件并按需修改：

```bash
cp local/local.env.example .env
# 编辑 .env，填写 POSTGRES_PASSWORD、ENCRYPTION_KEY、JWT_SECRET、CRON_SECRET
docker compose up -d
```

### 更新

```bash
docker compose pull && docker compose up -d
```

### 环境变量说明

| 变量 | 说明 | 示例 |
|------|------|------|
| `POSTGRES_PASSWORD` | 数据库密码 | 随机字符串 |
| `ENCRYPTION_KEY` | 数据加密密钥 | 64 位十六进制 |
| `JWT_SECRET` | JWT 签名密钥 | 64 位十六进制 |
| `CRON_SECRET` | 定时任务鉴权 token | 64 位十六进制 |
| `APP_URL` | 应用访问地址 | `http://192.168.1.1:8488` |
| `SUBBOOST_PORT` | 应用监听端口（默认 8488） | `8488` |
| `SUBBOOST_DB_PORT` | 数据库对外端口（默认 15432） | `15432` |

## 开发说明

从源码启动本地开发环境：

```bash
npm ci
npm run dev
```

常用检查：

```bash
npm run lint
npm run test:unit
npm run check:local-app
```

## 开源许可

SubBoost 公开源码以 [GNU Affero General Public License v3.0 only](./LICENSE) 授权。

## 免责声明

本项目不提供任何代理服务，不对第三方订阅内容的可用性与合法性作出保证。
