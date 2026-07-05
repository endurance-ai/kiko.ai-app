// SQL 마이그레이션 자동 적용 스크립트 (database/migrations/*.sql).
//
// schema_migrations 테이블로 적용 이력을 추적한다. 테이블이 없으면 새로 만들고,
// 이 시점에 이미 존재하는 001~089 파일은 "이미 수기로 적용된 것"으로 간주해
// 베이스라인 seed 한다(재실행 방지). 090 이후 파일부터 실제로 실행된다.
//
// public 스키마 CREATE TABLE/GRANT 권한이 있는 계정 필요 — app_user/ai_user 는
// 권한 없음(README 참고). DDL 권한 있는 계정의 연결 문자열을 MIGRATION_DATABASE_URL
// 로 전달한다(런타임 앱이 쓰는 DATABASE_URL과는 별개 자격증명).
//
// 실행:
//   MIGRATION_DATABASE_URL=postgresql://<ddl계정>:<pw>@host:5432/kikoai?sslmode=require \
//     pnpm db:migrate

import {readFileSync, readdirSync} from "fs"
import {join} from "path"
import {Pool} from "pg"

const MIGRATIONS_DIR = join(__dirname, "..", "database", "migrations")
const BASELINE_MAX = 89 // 001~089는 이미 수기 적용된 것으로 간주 (첫 실행 시 seed)

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// src/repositories/clients/pg-pool.ts 와 동일한 SSL 처리 — server-only 라 재사용 불가라 복제.
function createPool(): Pool {
  const raw = process.env.MIGRATION_DATABASE_URL
  if (!raw) fail("Missing environment variable: MIGRATION_DATABASE_URL (DDL 권한 있는 계정 필요)")
  const url = new URL(raw as string)
  const sslmode = url.searchParams.get("sslmode")
  url.searchParams.delete("sslmode")
  const ssl = sslmode === "disable" ? false : {rejectUnauthorized: false}
  return new Pool({connectionString: url.toString(), ssl, max: 1})
}

function migrationNumber(filename: string): number | null {
  const m = filename.match(/^(\d+)_/)
  return m ? parseInt(m[1], 10) : null
}

async function main() {
  const pool = createPool()
  try {
    const {rows: existing} = await pool.query<{to_regclass: string | null}>(
      "SELECT to_regclass('public.schema_migrations') AS to_regclass",
    )
    const tableExisted = existing[0]?.to_regclass !== null

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `)

    const allFiles = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    if (!tableExisted) {
      const baseline = allFiles.filter((f) => {
        const n = migrationNumber(f)
        return n !== null && n <= BASELINE_MAX
      })
      for (const f of baseline) {
        await pool.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
          [f],
        )
      }
      console.log(`✓ schema_migrations 신규 생성 — 베이스라인 ${baseline.length}개 seed (001~${BASELINE_MAX})`)
    }

    const {rows: appliedRows} = await pool.query<{filename: string}>("SELECT filename FROM schema_migrations")
    const applied = new Set(appliedRows.map((r) => r.filename))
    const pending = allFiles.filter((f) => !applied.has(f))

    if (pending.length === 0) {
      console.log("✓ 적용할 마이그레이션 없음 — 전부 최신 상태")
      return
    }

    for (const filename of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8")
      console.log(`→ 적용 중: ${filename}`)
      await pool.query(sql)
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename])
      console.log(`✓ 완료: ${filename}`)
    }

    console.log(`✓ 총 ${pending.length}개 마이그레이션 적용 완료`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
