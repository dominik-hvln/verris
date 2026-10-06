import type { ReactNode } from "react";

// WCAG 2.4.1 / 1.3.1: strony bez logowania mają landmark <main> będący celem skip linka z głównego layoutu (#main).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main id="main" tabIndex={-1}>{children}</main>;
}
