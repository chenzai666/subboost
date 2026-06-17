import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const publicRoot = path.resolve(__dirname, "../..");

function runBash(script: string) {
  return spawnSync("bash", ["-lc", "setsid bash -s"], {
    cwd: publicRoot,
    encoding: "utf8",
    input: script,
    timeout: 10_000,
    env: {
      ...process.env,
      LC_ALL: "C.UTF-8",
    },
  });
}

describe("self-host shell scripts", () => {
  it("uses prompt defaults without /dev/tty errors in non-interactive mode", () => {
    const result = runBash(`
      set -Eeuo pipefail
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      source local/scripts/install.sh
      export SUBBOOST_ASSUME_YES=0
      value="$(prompt 'Question: ' 'default-value')"
      printf 'value=%s\\n' "$value"
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("value=default-value");
    expect(result.stderr).not.toContain("/dev/tty");
  });

  it("does not report Doctor OK when health checks fail", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      cat > "$home/.env" <<'ENV'
SUBBOOST_IMAGE=image
POSTGRES_DB=subboost
POSTGRES_USER=subboost
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://subboost:password@db:5432/subboost?schema=public
ENCRYPTION_KEY=key
JWT_SECRET=jwt
CRON_SECRET=cron
APP_URL=http://127.0.0.1:31000
SUBBOOST_PORT=31000
ENV
      : > "$home/docker-compose.yml"
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      source local/scripts/subboost.sh
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl() { return 1; }
      set +e
      output="$(doctor_cmd 2>&1)"
      status=$?
      set -e
      printf 'status=%s\\n%s\\n' "$status" "$output"
      [ "$status" -ne 0 ]
      case "$output" in *"Doctor: OK"*) exit 44 ;; esac
      case "$output" in *"健康检查: 异常"*) exit 0 ;; *) exit 45 ;; esac
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("status=1");
    expect(result.stdout).toContain("健康检查: 异常");
    expect(result.stdout).not.toContain("Doctor: OK");
    expect(result.stdout).toContain("ERROR: Health check failed: app is not responding.");
  });

  it("reports Doctor OK only after health checks pass", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      cat > "$home/.env" <<'ENV'
SUBBOOST_IMAGE=image
POSTGRES_DB=subboost
POSTGRES_USER=subboost
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://subboost:password@db:5432/subboost?schema=public
ENCRYPTION_KEY=key
JWT_SECRET=jwt
CRON_SECRET=cron
APP_URL=http://127.0.0.1:31000
SUBBOOST_PORT=31000
ENV
      : > "$home/docker-compose.yml"
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      source local/scripts/subboost.sh
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl() { return 0; }
      doctor_cmd
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("健康检查: 正常");
    expect(result.stdout).toContain("Doctor: OK");
  });
});
