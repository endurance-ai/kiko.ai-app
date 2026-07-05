// 어드민 계정 발급 스크립트 (셀프 가입 비활성화 대체 — src/app/admin/signup 참고).
//
// admin_profiles 에 approved 계정을 직접 INSERT 한다. 이메일이 이미 있으면
// password_hash 만 갱신(비밀번호 재설정 겸용). bcrypt round=10 은 로그인 경로
// (src/auth.ts) 및 migration 046 주석과 일치시킨다.
//
// 실행:
//   pnpm create-admin <email> <password>
//   # 또는 셸 히스토리에 비밀번호를 남기지 않으려면 env 로 전달
//   ADMIN_EMAIL=me@kiko.ai ADMIN_PASSWORD='...' pnpm create-admin
//
// DATABASE_URL 은 .env.local 에서 dotenv 가 주입 (package.json 스크립트 참고).

import bcrypt from "bcryptjs"
import {Pool} from "pg"

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// src/repositories/clients/pg-pool.ts 와 동일한 SSL 처리 — server-only 라 재사용 불가라 복제.
function createPool(): Pool {
  const raw = process.env.DATABASE_URL
  if (!raw) fail("Missing environment variable: DATABASE_URL (.env.local)")
  const url = new URL(raw as string)
  const sslmode = url.searchParams.get("sslmode")
  url.searchParams.delete("sslmode")
  const ssl = sslmode === "disable" ? false : {rejectUnauthorized: false}
  return new Pool({connectionString: url.toString(), ssl, max: 1})
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? process.argv[2] ?? "").trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? process.argv[3] ?? ""

  if (!email || !email.includes("@")) fail("유효한 이메일이 필요합니다: create-admin <email> <password>")
  // src/auth.ts 의 authorize() 제약과 동일: bcrypt 72바이트 절단 방지 위해 8~72 범위만 허용.
  if (password.length < 8 || password.length > 72) fail("비밀번호는 8~72자여야 합니다")

  const passwordHash = await bcrypt.hash(password, 10)
  const pool = createPool()
  try {
    // email 유니크 제약의 형태(컬럼 vs lower(email) 표현식 인덱스)에 의존하지 않도록
    // UPDATE 후 미적중 시 INSERT. 일회성 스크립트라 경합은 무시 가능.
    const upd = await pool.query<{user_id: string}>(
      `UPDATE admin_profiles
          SET password_hash = $2, status = 'approved'
        WHERE lower(email) = lower($1)
      RETURNING user_id`,
      [email, passwordHash],
    )
    if (upd.rows[0]) {
      console.log(`✓ 갱신: ${email} (user_id=${upd.rows[0].user_id}, status=approved)`)
      return
    }
    // 라이브 admin_profiles.user_id 에는 DEFAULT 가 없어 명시 삽입 필요.
    const ins = await pool.query<{user_id: string}>(
      `INSERT INTO admin_profiles (user_id, email, password_hash, status)
       VALUES (gen_random_uuid(), lower($1), $2, 'approved')
       RETURNING user_id`,
      [email, passwordHash],
    )
    console.log(`✓ 생성: ${email} (user_id=${ins.rows[0].user_id}, status=approved)`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
