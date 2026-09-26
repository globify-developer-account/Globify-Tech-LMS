import type { Permission } from "@/lib/rbac";

/**
 * App-shell navigation for each authenticated surface.
 * `icon` is a lucide icon name resolved in the client component.
 * `permission` hides items the principal cannot use (server also enforces).
 * Labels are i18n keys under `student.nav`, `instructor.nav`, `admin.nav`.
 */
export interface NavItem {
  key: string;
  href: string;
  icon: string;
  permission?: Permission;
  badge?: "notifications" | "messages" | "grading" | "leads";
}

export interface NavGroup {
  key: string;
  items: NavItem[];
}

export const STUDENT_NAV: NavGroup[] = [
  {
    key: "overview",
    items: [
      { key: "dashboard", href: "/student/dashboard", icon: "LayoutDashboard" },
      { key: "learning", href: "/student/learning", icon: "Route" },
      { key: "courses", href: "/student/courses", icon: "BookOpen" },
      { key: "liveClasses", href: "/student/live-classes", icon: "Video" },
      { key: "calendar", href: "/student/calendar", icon: "CalendarDays" },
    ],
  },
  {
    key: "assessment",
    items: [
      { key: "tasks", href: "/student/tasks", icon: "ListTodo" },
      { key: "assignments", href: "/student/assignments", icon: "ClipboardList" },
      { key: "projects", href: "/student/projects", icon: "FolderKanban" },
      { key: "quizzes", href: "/student/quizzes", icon: "ListChecks" },
      { key: "exams", href: "/student/exams", icon: "FileCheck2" },
      { key: "attendance", href: "/student/attendance", icon: "UserCheck" },
    ],
  },
  {
    key: "career",
    items: [
      { key: "certificates", href: "/student/certificates", icon: "Award" },
      { key: "career", href: "/student/career", icon: "Briefcase" },
      { key: "portfolio", href: "/student/portfolio", icon: "Layers" },
    ],
  },
  {
    key: "engagement",
    items: [
      { key: "community", href: "/student/community", icon: "MessagesSquare" },
      { key: "messages", href: "/student/messages", icon: "MessageCircle", badge: "messages" },
      { key: "notifications", href: "/student/notifications", icon: "Bell", badge: "notifications" },
      { key: "ai", href: "/student/ai", icon: "Sparkles" },
    ],
  },
  {
    key: "platform",
    items: [
      { key: "payments", href: "/student/payments", icon: "CreditCard" },
      { key: "settings", href: "/student/settings", icon: "Settings" },
    ],
  },
];

export const INSTRUCTOR_NAV: NavGroup[] = [
  {
    key: "overview",
    items: [
      { key: "dashboard", href: "/instructor/dashboard", icon: "LayoutDashboard" },
      { key: "courses", href: "/instructor/courses", icon: "BookOpen" },
      { key: "courseBuilder", href: "/instructor/course-builder", icon: "Hammer", permission: "courses.update" },
      { key: "modules", href: "/instructor/modules", icon: "Layers" },
      { key: "lessons", href: "/instructor/lessons", icon: "PlaySquare" },
    ],
  },
  {
    key: "assessment",
    items: [
      { key: "assignments", href: "/instructor/assignments", icon: "ClipboardList" },
      { key: "projects", href: "/instructor/projects", icon: "FolderKanban" },
      { key: "quizzes", href: "/instructor/quizzes", icon: "ListChecks" },
      { key: "exams", href: "/instructor/exams", icon: "FileCheck2" },
      { key: "submissions", href: "/instructor/submissions", icon: "Inbox", badge: "grading" },
      { key: "grading", href: "/instructor/grading", icon: "PenLine" },
    ],
  },
  {
    key: "people",
    items: [
      { key: "students", href: "/instructor/students", icon: "Users" },
      { key: "batches", href: "/instructor/batches", icon: "Boxes" },
      { key: "attendance", href: "/instructor/attendance", icon: "UserCheck" },
      { key: "liveClasses", href: "/instructor/live-classes", icon: "Video" },
    ],
  },
  {
    key: "platform",
    items: [
      { key: "analytics", href: "/instructor/analytics", icon: "BarChart3" },
      { key: "messages", href: "/instructor/messages", icon: "MessageCircle", badge: "messages" },
      { key: "settings", href: "/instructor/settings", icon: "Settings" },
    ],
  },
];

export const ADMIN_NAV: NavGroup[] = [
  {
    key: "overview",
    items: [
      { key: "dashboard", href: "/admin/dashboard", icon: "LayoutDashboard" },
      { key: "analytics", href: "/admin/analytics", icon: "BarChart3", permission: "analytics.read" },
      { key: "reports", href: "/admin/reports", icon: "FileBarChart", permission: "reports.export" },
      { key: "ai", href: "/admin/ai", icon: "Sparkles", permission: "ai.admin_assistant" },
    ],
  },
  {
    key: "academics",
    items: [
      { key: "courses", href: "/admin/courses", icon: "BookOpen", permission: "courses.read" },
      { key: "programs", href: "/admin/programs", icon: "GraduationCap", permission: "programs.manage" },
      { key: "categories", href: "/admin/categories", icon: "Tags", permission: "categories.manage" },
      { key: "batches", href: "/admin/batches", icon: "Boxes", permission: "batches.read" },
      { key: "enrollments", href: "/admin/enrollments", icon: "UserPlus", permission: "enrollments.read" },
      { key: "attendance", href: "/admin/attendance", icon: "UserCheck", permission: "attendance.read" },
    ],
  },
  {
    key: "assessment",
    items: [
      { key: "assignments", href: "/admin/assignments", icon: "ClipboardList", permission: "assessments.manage" },
      { key: "quizzes", href: "/admin/quizzes", icon: "ListChecks", permission: "assessments.manage" },
      { key: "exams", href: "/admin/exams", icon: "FileCheck2", permission: "assessments.manage" },
      { key: "certificates", href: "/admin/certificates", icon: "Award", permission: "certificates.read" },
    ],
  },
  {
    key: "people",
    items: [
      { key: "students", href: "/admin/students", icon: "Users", permission: "students.read" },
      { key: "instructors", href: "/admin/instructors", icon: "Presentation", permission: "instructors.read" },
      { key: "alumni", href: "/admin/alumni", icon: "Star", permission: "students.read" },
    ],
  },
  {
    key: "admissions",
    items: [
      { key: "leads", href: "/admin/leads", icon: "Kanban", permission: "crm.leads.read", badge: "leads" },
      { key: "applications", href: "/admin/applications", icon: "FileText", permission: "applications.read" },
      { key: "admissions", href: "/admin/admissions", icon: "DoorOpen", permission: "applications.review" },
    ],
  },
  {
    key: "finance",
    items: [
      { key: "payments", href: "/admin/payments", icon: "CreditCard", permission: "payments.read" },
      { key: "invoices", href: "/admin/invoices", icon: "Receipt", permission: "payments.read" },
      { key: "discounts", href: "/admin/discounts", icon: "BadgePercent", permission: "discounts.manage" },
      { key: "scholarships", href: "/admin/scholarships", icon: "HandCoins", permission: "discounts.manage" },
    ],
  },
  {
    key: "career",
    items: [
      { key: "jobs", href: "/admin/jobs", icon: "Briefcase", permission: "career.jobs.manage" },
      { key: "internships", href: "/admin/internships", icon: "Rocket", permission: "career.jobs.manage" },
      { key: "employers", href: "/admin/employers", icon: "Building2", permission: "career.jobs.manage" },
    ],
  },
  {
    key: "content",
    items: [
      { key: "cms", href: "/admin/cms", icon: "PanelsTopLeft", permission: "cms.pages.manage" },
      { key: "pages", href: "/admin/pages", icon: "FileStack", permission: "cms.pages.manage" },
      { key: "blog", href: "/admin/blog", icon: "Newspaper", permission: "cms.blog.manage" },
      { key: "media", href: "/admin/media", icon: "Image", permission: "cms.media.manage" },
      { key: "events", href: "/admin/events", icon: "CalendarDays", permission: "cms.content.manage" },
      { key: "testimonials", href: "/admin/testimonials", icon: "Quote", permission: "cms.content.manage" },
    ],
  },
  {
    key: "engagement",
    items: [
      { key: "notifications", href: "/admin/notifications", icon: "Bell", permission: "notifications.manage" },
      { key: "messages", href: "/admin/messages", icon: "MessageCircle" },
      { key: "automation", href: "/admin/automation", icon: "Workflow", permission: "automation.manage" },
    ],
  },
  {
    key: "platform",
    items: [
      { key: "auditLogs", href: "/admin/audit-logs", icon: "ScrollText", permission: "audit.read" },
      { key: "settings", href: "/admin/settings", icon: "Settings", permission: "settings.manage" },
    ],
  },
];
