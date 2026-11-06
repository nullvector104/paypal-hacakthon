import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit — Treasury, Payments & Smart Budgeting Prototype",
  description:
    "Orbit is an independent prototype payments and club treasury platform featuring category budgeting and authoritative PayPal Sandbox integration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
