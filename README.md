<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="Platform: Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.4.0-green.svg" alt="Version 2.4.0">
    <img src="https://img.shields.io/badge/image-Docker%20Hub-blue.svg" alt="Docker Hub image">
  </p>
  <p><strong><a href="README.md">English</a> | <a href="README-CN.md">中文</a></strong></p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost** is a **Clash/Mihomo subscription conversion, enhancement, and management** tool. It converts airport subscriptions and self-hosted nodes into optimized aggregate subscriptions with automatic updates. With the visual UI, configure **chained proxies, precise routing, DNS leak prevention, and multi-subscription aggregation** in one click.

## Highlights

- **Subscription conversion**: Import subscription links, YAML files, node links, and other common formats.
- **Node management**: Rename, delete, or configure listening ports for nodes in batches.
- **Node filtering**: Build `filtered proxy groups` with selected nodes by source, region, and custom rules.
- **Chained proxies**: Configure chained proxies and `relay proxy groups` visually in one click.
- **Precise routing**: Enable 30+ common proxy groups and 2,000+ remote rule sets.
- **Rule management**: Reorder rules for deeper customization.
- **DNS leak prevention**: The default `basic and DNS configuration` prevents DNS leaks.
- **Automatic refresh**: Refresh subscriptions on a schedule with intelligent node matching.

## Interface Preview

<p align="center">
  <img src="docs/assets/screenshot-main.png" alt="SubBoost visual configuration interface" width="960">
</p>

## Deployment

**Requirements:** Docker + Docker Compose

```bash
git clone https://github.com/chenzai666/subboost.git
cd subboost
./start.sh
```

On first run, `start.sh` auto-generates all secrets into `.env`, then pulls the image (`bats666/subboost`) and starts all services (app + PostgreSQL + cron).

Default port is **8488**, visit `http://<your-ip>:8488`.

### Manual Setup

Copy the example config and edit as needed:

```bash
cp local/local.env.example .env
# Edit .env: fill in POSTGRES_PASSWORD, ENCRYPTION_KEY, JWT_SECRET, CRON_SECRET
docker compose up -d
```

### Update

```bash
docker compose pull && docker compose up -d
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Database password | random string |
| `ENCRYPTION_KEY` | Data encryption key | 64-char hex |
| `JWT_SECRET` | JWT signing key | 64-char hex |
| `CRON_SECRET` | Cron job auth token | 64-char hex |
| `APP_URL` | App access URL | `http://192.168.1.1:8488` |
| `SUBBOOST_PORT` | Listening port (default 8488) | `8488` |

## Development

Start a local development environment from source:

```bash
npm ci
npm run dev
```

Common checks:

```bash
npm run lint
npm run test:unit
npm run check:local-app
```

## License

The SubBoost source code is licensed under the [GNU Affero General Public License v3.0 only](./LICENSE).

## Disclaimer

This project does not provide any proxy service and makes no guarantee about the availability or legality of third-party subscription content.
