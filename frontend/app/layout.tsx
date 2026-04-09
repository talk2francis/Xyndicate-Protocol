import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { WalletModal } from "@/components/WalletModal";
import { Providers } from "@/components/providers";
import { WalletProvider } from "@/lib/wallet-context";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Xyndicate Protocol",
  description: "Autonomous strategy squads on X Layer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-xyn-surface text-xyn-dark dark:bg-xyn-dark dark:text-xyn-surface">
        <Providers>
          <WalletProvider>
            <Navbar />
            <WalletModal />
            <main>{children}</main>
          </WalletProvider>
        </Providers>
      </body>
    </html>
  );
}
