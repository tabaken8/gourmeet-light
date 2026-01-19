// app/test/page.tsx
"use client";
import { useEffect } from "react";

type TicketRow = { balance: number };

function isTicketRow(v: unknown): v is TicketRow {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.balance === "number";
}

export default function TestPage() {
  useEffect(() => {
    const x = { balance: 100, extra: "hi" };
    console.log("x is TicketRow?", isTicketRow(x));

    console.log("悪い例", isTicketRow({ balance: "100" }));
    console.log("悪い例", isTicketRow({}));
    console.log("悪い例", isTicketRow(null));
  }, []);

  return <div>Open DevTools Console (F12)</div>;
}
