import type { Metadata, Viewport } from "next";
import { Anton, Archivo } from "next/font/google";
import "./globals.css";

// Anton for anything that has to read from the sofa: ultra-condensed and
// heavy, so a long Spanish name still fills a television at four metres.
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// Archivo for everything else. Variable weight, and its tabular figures keep
// the scoreboard column from twitching as scores change.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Adivina la canción",
  description: "Juego de buzzer musical presencial: adivina la canción antes que nadie.",
};

// Paints the phone's browser chrome to match the stage instead of leaving a
// bright bar above a dark screen. Pinch-zoom is deliberately left enabled;
// the buzzer suppresses double-tap zoom on its own with `touch-action`.
export const viewport: Viewport = {
  themeColor: "#0b0d12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${anton.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
