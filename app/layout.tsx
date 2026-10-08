import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./final-pass.css";
import "./departments.css";
import "./performance-dispatch.css";
import "./management-kpi.css";
import "./employee-directory.css";
import "./data-exchange.css";
import "./platform-controls.css";
import "./owner-feedback.css";
import "./account-health.css";
import "./hcm-workflow.css";
import "./onboarding.css";
import "./admin-polish.css";
import "./global-polish.css";
import "./workflow-navigation.css";
import "./production-polish.css";
import "./visual-polish-v2.css";
import "./invoice-print.css";
import "./mobile-platform.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export const metadata: Metadata = {
  title: "Momentum Distribution | Golden Eagle",
  description: "Momentum Distribution",
  other: { "codex-preview": "development" },
  icons: { icon: `${basePath}/momentum-invoice-brand.jpg`, shortcut: `${basePath}/momentum-invoice-brand.jpg`, apple: `${basePath}/momentum-invoice-brand.jpg` },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
