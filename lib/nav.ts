import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { title: "Debt & Loans", href: "/debt", icon: Landmark },
  { title: "Insights", href: "/insights", icon: Sparkles },
  { title: "Settings", href: "/settings", icon: Settings },
];
