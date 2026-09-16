/**
 * Imports real students from the admissions sheet export and gives each one a
 * login. Usage: pnpm tsx scripts/import-students.ts private/<sheet>.csv
 *
 * Credentials are written to private/student-credentials.csv (gitignored).
 * Re-running reuses the passwords already in that file, so handed-out logins
 * stay valid; existing accounts never have their password overwritten.
 * Withdrawn students are kept for the finance record: login suspended,
 * enrollment dropped, numbered after everyone still studying.
 */
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { clean, csvCell, parseCsv, parseDate } from "./sheet-csv";

const prisma = new PrismaClient();
const CREDENTIALS_FILE = "private/student-credentials.csv";
const EMAIL_DOMAIN = "globifytech.com";
const WITHDRAWN_STATUSES = ["withdraw", "wihdraw"];

// Sheet course name -> course slug. Courses not listed here don't exist in the catalogue yet.
const COURSE_SLUGS: Record<string, string> = {
  "digital marketing": "digital-marketing-mastery",
  "full stack web development": "full-stack-web-development",
};

async function main() {
  const sheetPath = process.argv[2];
  if (!sheetPath) throw new Error("Pass the sheet CSV path");
  const [header, ...body] = parseCsv(readFileSync(sheetPath, "utf8"));
  const col = (name: string) => header.findIndex((h) => clean(h).toUpperCase() === name);
  const iName = col("NAME"), iPhone = col("CONTACT"), iCourse = col("COURSE"), iReg = col("REGISTRATION DATE"), iStatus = col("CURRENT STATUS");

  const previous = new Map<string, string>();
  if (existsSync(CREDENTIALS_FILE)) {
    const [h, ...rows] = parseCsv(readFileSync(CREDENTIALS_FILE, "utf8"));
    const u = h.indexOf("Username"), p = h.indexOf("Password");
    for (const r of rows) if (r[u]) previous.set(r[u], r[p]);
  }

  const campus = await prisma.campus.findFirst({ select: { id: true } });
  const studentRole = await prisma.role.findUnique({ where: { key: "STUDENT" }, select: { id: true } });
  if (!studentRole) throw new Error("STUDENT role missing - run the seed first");
  const courses = new Map((await prisma.course.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));

  const out: string[][] = [["Student No", "Name", "Phone", "Course", "Status", "Username", "Password", "Enrolled In"]];
  const seen = new Set<string>();
  let n = 0;

  // Sheet data rows always have a status; totals/deposit rows below don't.
  const students = body.filter((r) => clean(r[iName]) && clean(r[iStatus]));
  const isWithdrawn = (r: string[]) => WITHDRAWN_STATUSES.includes(clean(r[iStatus]).toLowerCase());
  for (const r of [...students.filter((x) => !isWithdrawn(x)), ...students.filter(isWithdrawn)]) {
    const name = clean(r[iName]);
    const status = clean(r[iStatus]);
    const withdrawn = isWithdrawn(r);
    n++;

    const digits = clean(r[iPhone]).replace(/\D/g, "");
    const phone = digits ? `+${digits}` : null;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
    let email = `${slug}${digits ? `.${digits.slice(-4)}` : ""}@${EMAIL_DOMAIN}`;
    for (let k = 2; seen.has(email); k++) email = email.replace("@", `${k}@`);
    seen.add(email);

    const firstWord = name.split(/[^A-Za-z]+/).find((w) => w.length >= 3) ?? "Student";
    const password = previous.get(email) ?? `${firstWord[0].toUpperCase()}${firstWord.slice(1).toLowerCase()}@${randomInt(1000, 10000)}`;
    const courseName = clean(r[iCourse]);
    const courseId = courses.get(COURSE_SLUGS[courseName.toLowerCase()] ?? "");
    const studentNumber = `GT-2026-${String(1000 + n)}`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, phone, whatsapp: phone, status: withdrawn ? "SUSPENDED" : "ACTIVE" },
      create: { email, name, phone, whatsapp: phone, passwordHash: await bcrypt.hash(password, 12), emailVerifiedAt: new Date(), status: withdrawn ? "SUSPENDED" : "ACTIVE" },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: studentRole.id } },
      update: {},
      create: { userId: user.id, roleId: studentRole.id, campusId: campus?.id },
    });
    const profile = await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, studentNumber, city: "Faisalabad", country: "PK", campusId: campus?.id },
    });
    if (courseId) {
      const enrollmentStatus = withdrawn ? "DROPPED" : status.toLowerCase() === "freeze" ? "PAUSED" : "ACTIVE";
      await prisma.enrollment.upsert({
        where: { studentId_courseId: { studentId: profile.id, courseId } },
        update: { status: enrollmentStatus },
        create: { studentId: profile.id, courseId, status: enrollmentStatus, startedAt: parseDate(r[iReg]) ?? new Date() },
      });
    }

    out.push([profile.studentNumber, name, phone ?? "", courseName, status, email, password, courseId ? COURSE_SLUGS[courseName.toLowerCase()] : "(course not in catalogue)"]);
  }

  writeFileSync(CREDENTIALS_FILE, out.map((row) => row.map(csvCell).join(",")).join("\n") + "\n");
  console.log(`Imported ${out.length - 1} students -> ${CREDENTIALS_FILE}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
