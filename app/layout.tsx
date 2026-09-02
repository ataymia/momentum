import type { Metadata } from "next";
import "./globals.css";
import "./final-pass.css";
import "./departments.css";
import "./performance-dispatch.css";
import "./platform-controls.css";
import "./owner-feedback.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Momentum Distribution | Golden Eagle",
  description: "Momentum Distribution",
  other: { "codex-preview": "development" },
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
