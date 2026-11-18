/**
 * Course completion engine (pure). Given a course's configurable rules and a
 * snapshot of the student's standing, decides whether the course is complete
 * and explains which requirements are met or missing.
 */
export interface CompletionRules {
  requireAllLessons: boolean;
  minAttendancePercent?: number | null;
  minQuizPercent?: number | null;
  minExamPercent?: number | null;
  requireProjects: boolean;
  requirePaymentClear: boolean;
}

export interface CompletionSnapshot {
  lessonsTotal: number;
  lessonsCompleted: number;
  /** null when the course has no attendance sessions yet */
  attendancePercent: number | null;
  /** best percent per published quiz; null entries mean not attempted */
  quizPercents: Array<number | null>;
  /** best percent per published exam */
  examPercents: Array<number | null>;
  projectsTotal: number;
  projectsApproved: number;
  /** true when all issued invoices for the enrollment are PAID (or none exist) */
  paymentClear: boolean;
}

export interface RequirementResult {
  key: "lessons" | "attendance" | "quizzes" | "exams" | "projects" | "payment";
  label: string;
  required: boolean;
  met: boolean;
  detail: string;
}

export interface CompletionEvaluation {
  complete: boolean;
  requirements: RequirementResult[];
  /** 0–100 overall readiness across required items */
  readinessPercent: number;
}

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function evaluateCompletion(rules: CompletionRules, s: CompletionSnapshot): CompletionEvaluation {
  const requirements: RequirementResult[] = [];

  // Lessons
  const lessonsMet = !rules.requireAllLessons || s.lessonsTotal === 0 || s.lessonsCompleted >= s.lessonsTotal;
  requirements.push({
    key: "lessons",
    // Like attendance and quizzes: only promise "all lessons" when the course requires it,
    // otherwise a student at 40% sees a ticked "Complete all lessons".
    label: rules.requireAllLessons ? "Complete all lessons" : "Lessons",
    required: rules.requireAllLessons,
    met: lessonsMet,
    detail: `${s.lessonsCompleted} of ${s.lessonsTotal} lessons`,
  });

  // Attendance
  const attRequired = rules.minAttendancePercent != null;
  const attMet = !attRequired || s.attendancePercent == null || s.attendancePercent >= (rules.minAttendancePercent ?? 0);
  requirements.push({
    key: "attendance",
    label: attRequired ? `Attend at least ${rules.minAttendancePercent}% of sessions` : "Attendance",
    required: attRequired,
    met: attMet,
    detail: s.attendancePercent == null ? "No sessions recorded" : `${Math.round(s.attendancePercent)}% attendance`,
  });

  // Quizzes: every quiz attempted and average >= threshold
  const quizRequired = rules.minQuizPercent != null && s.quizPercents.length > 0;
  const attempted = s.quizPercents.filter((p): p is number => p != null);
  const quizAvg = avg(attempted);
  const quizMet = !quizRequired || (attempted.length === s.quizPercents.length && quizAvg >= (rules.minQuizPercent ?? 0));
  requirements.push({
    key: "quizzes",
    label: quizRequired ? `Average at least ${rules.minQuizPercent}% across quizzes` : "Quizzes",
    required: quizRequired,
    met: quizMet,
    detail: s.quizPercents.length ? `${attempted.length}/${s.quizPercents.length} attempted · ${Math.round(quizAvg)}% average` : "No quizzes",
  });

  // Exams
  const examRequired = rules.minExamPercent != null && s.examPercents.length > 0;
  const examsTaken = s.examPercents.filter((p): p is number => p != null);
  const examMet = !examRequired || (examsTaken.length === s.examPercents.length && examsTaken.every((p) => p >= (rules.minExamPercent ?? 0)));
  requirements.push({
    key: "exams",
    label: examRequired ? `Score at least ${rules.minExamPercent}% in every exam` : "Exams",
    required: examRequired,
    met: examMet,
    detail: s.examPercents.length ? `${examsTaken.length}/${s.examPercents.length} taken` : "No exams",
  });

  // Projects
  const projRequired = rules.requireProjects && s.projectsTotal > 0;
  const projMet = !projRequired || s.projectsApproved >= s.projectsTotal;
  requirements.push({
    key: "projects",
    label: "Get every project approved",
    required: projRequired,
    met: projMet,
    detail: s.projectsTotal ? `${s.projectsApproved} of ${s.projectsTotal} approved` : "No projects",
  });

  // Payment
  requirements.push({
    key: "payment",
    label: "Clear outstanding fees",
    required: rules.requirePaymentClear,
    met: !rules.requirePaymentClear || s.paymentClear,
    detail: s.paymentClear ? "No balance due" : "Balance outstanding",
  });

  const required = requirements.filter((r) => r.required);
  const complete = required.every((r) => r.met);
  const readinessPercent = required.length ? Math.round((required.filter((r) => r.met).length / required.length) * 100) : lessonsMet ? 100 : 0;
  return { complete, requirements, readinessPercent };
}
