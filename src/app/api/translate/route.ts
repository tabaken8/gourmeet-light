// src/app/api/translate/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TRANSLATE_KEY = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY ?? "";

export async function POST(req: Request) {
  try {
    const { text, target = "en" } = await req.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (!TRANSLATE_KEY) {
      return NextResponse.json({ error: "Translation not configured" }, { status: 500 });
    }

    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${TRANSLATE_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text.slice(0, 5000),
          target,
          format: "text",
        }),
      },
    );

    const payload = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.error?.message ?? "Translation failed" },
        { status: res.status },
      );
    }

    const translated =
      payload?.data?.translations?.[0]?.translatedText ?? null;
    const detectedLang =
      payload?.data?.translations?.[0]?.detectedSourceLanguage ?? null;

    return NextResponse.json({ translated, detectedLang });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
