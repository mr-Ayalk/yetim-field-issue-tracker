import type { Metadata, Viewport } from "next";
import { Noto_Sans_Ethiopic, Outfit } from "next/font/google";
import { YetimProvider } from "@/components/provider";
import { Shell } from "@/components/shell";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const ethiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  weight: ["500", "700"],
  variable: "--font-ethiopic",
});

export const metadata: Metadata = {
  title: "Yetim (የትም)",
  description: "An offline-first field issue tracker that works anywhere, even where there's no signal.",
  applicationName: "Yetim",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Yetim" },
};

export const viewport: Viewport = {
  themeColor: "#083633",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${ethiopic.variable} antialiased`}>
        <YetimProvider>
          <Shell>{children}</Shell>
        </YetimProvider>
      </body>
    </html>
  );
}
