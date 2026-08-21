import { Hanken_Grotesk, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";

export const schibsted = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800", "900"],
  variable: "--font-schibsted",
  display: "swap",
});

export const hanken = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-hanken",
  display: "swap",
});

export const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});
