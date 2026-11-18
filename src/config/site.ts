/**
 * Brand constants. Editorial content (pages, courses, testimonials…) lives in the
 * database; only identity-level constants that never change per deployment are here.
 */
export const site = {
  name: "Globify Tech",
  legalName: "Globify Tech Institute",
  tagline: "Learn Today. Lead Tomorrow.",
  description:
    "AI-powered education designed for the careers of tomorrow. Practical, project-first programs in AI, marketing, development, design, automation and freelancing.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://globifytech.com",
  foundedYear: 2019,
  locale: "en",
  contact: {
    email: "info@globifytech.com",
    admissionsPhone: "+92 339 1110171",
    coursesPhone: "+92 342 1405876",
    whatsapp: "+92 339 1110172",
    hours: "Mon–Sat, 9 AM – 9 PM",
    address: "2nd Floor, Kohinoor Plaza, Jaranwala Road, Faisalabad, Punjab 38000, Pakistan",
  },
  social: {
    facebook: "https://facebook.com/globifytech",
    instagram: "https://instagram.com/globifytech",
    linkedin: "https://linkedin.com/company/globifytech",
    youtube: "https://youtube.com/@globifytech",
    tiktok: "https://tiktok.com/@globifytech",
  },
  /** Store listings. The Android package name `globifytech.com` was fixed by the first Play upload. */
  apps: {
    android: "https://play.google.com/store/apps/details?id=globifytech.com",
  },
  currency: "PKR",
  timezone: "Asia/Karachi",
} as const;

export const CATEGORY_ARTWORK: Record<
  string,
  { label: string; from: string; to: string; pattern: "grid" | "orbits" | "waves" | "diagonal" | "dots" | "rings" }
> = {
  ai: { label: "AI", from: "#4F46E5", to: "#06B6D4", pattern: "orbits" },
  marketing: { label: "Marketing", from: "#2563FF", to: "#7C3AED", pattern: "grid" },
  development: { label: "Development", from: "#059669", to: "#06B6D4", pattern: "diagonal" },
  design: { label: "Design", from: "#DB2777", to: "#F97316", pattern: "rings" },
  automation: { label: "Automation", from: "#F59E0B", to: "#DC2626", pattern: "waves" },
  ecommerce: { label: "E-commerce", from: "#0D9488", to: "#84CC16", pattern: "dots" },
  freelancing: { label: "Freelancing", from: "#7C3AED", to: "#2563FF", pattern: "grid" },
  video: { label: "Video", from: "#DC2626", to: "#7C3AED", pattern: "waves" },
  creative: { label: "Creative Technologies", from: "#C026D3", to: "#06B6D4", pattern: "orbits" },
};
