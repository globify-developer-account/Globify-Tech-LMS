# Sourced by backup-db.sh and restore-db.sh.
#
# Splits DATABASE_URL (mysql://user:pass@host:port/db?params) into a private
# option file for the mysql client tools, so the password never appears on a
# command line where other users of a shared host could see it. Sets MYSQL_CNF
# and DB_NAME, and removes the file when the calling script exits.

: "${DATABASE_URL:?DATABASE_URL must be set}"
[[ "$DATABASE_URL" == mysql://* ]] || { echo "DATABASE_URL must start with mysql://" >&2; exit 1; }

MYSQL_CNF="$(mktemp)"
trap 'rm -f "$MYSQL_CNF"' EXIT
DB_NAME="$(node -e '
const u = new URL(process.env.DATABASE_URL);
const bs = String.fromCharCode(92), dq = String.fromCharCode(34); // backslash and double quote, spelled out so no shell can mangle them
const esc = (s) => s.split(bs).join(bs + bs).split(dq).join(bs + dq);
const cnf = ["[client]", "host=" + dq + esc(u.hostname) + dq, `port=${u.port || 3306}`, "user=" + dq + esc(decodeURIComponent(u.username)) + dq, "password=" + dq + esc(decodeURIComponent(u.password)) + dq, "default-character-set=utf8mb4", ""];
require("fs").writeFileSync(process.argv[1], cnf.join("\n"), { mode: 0o600 });
process.stdout.write(decodeURIComponent(u.pathname.slice(1)));
' "$MYSQL_CNF")"
