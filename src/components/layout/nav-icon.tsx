import {
  LayoutDashboard, Route, BookOpen, Video, CalendarDays, ClipboardList, FolderKanban, ListChecks, FileCheck2, UserCheck, Award, Briefcase, Layers, MessagesSquare, MessageCircle, Bell, Sparkles, CreditCard, Settings, Hammer, PlaySquare, Inbox, PenLine, Users, Boxes, BarChart3, FileBarChart, GraduationCap, Tags, UserPlus, Presentation, Star, Kanban, FileText, DoorOpen, Receipt, BadgePercent, HandCoins, Rocket, Building2, PanelsTopLeft, FileStack, Newspaper, Image, Quote, Workflow, ScrollText, ListTodo, Circle,
  type LucideProps,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  LayoutDashboard, Route, BookOpen, Video, CalendarDays, ClipboardList, FolderKanban, ListChecks, FileCheck2, UserCheck, Award, Briefcase, Layers, MessagesSquare, MessageCircle, Bell, Sparkles, CreditCard, Settings, Hammer, PlaySquare, Inbox, PenLine, Users, Boxes, BarChart3, FileBarChart, GraduationCap, Tags, UserPlus, Presentation, Star, Kanban, FileText, DoorOpen, Receipt, BadgePercent, HandCoins, Rocket, Building2, PanelsTopLeft, FileStack, Newspaper, Image, Quote, Workflow, ScrollText, ListTodo,
};

export function NavIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon {...props} />;
}
