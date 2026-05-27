import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlitzGammon",
  description: "Настоящие быстрые нарды: короткие решения, высокий темп и post-game AI coaching."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
