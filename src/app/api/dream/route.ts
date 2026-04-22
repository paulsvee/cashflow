import { NextRequest, NextResponse } from "next/server";
import { readState, writeState, type AppState, type Category } from "@/lib/db";

// ─── CORS ──────────────────────────────────────────────────────────────────────
const CORS_ORIGIN = "http://localhost:3004";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const { state, categories } = readState("dream");
    return NextResponse.json(
      { state, categories_dream: categories },
      { headers: corsHeaders() }
    );
  } catch (e) {
    return NextResponse.json(
      { state: null, categories_dream: [] },
      { headers: corsHeaders() }
    );
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────────
// Body: { state: AppState, categories_dream: Category[] }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state: AppState        = body.state;
    const categories: Category[] = body.categories_dream ?? [];

    writeState("dream", state, categories);
    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }
}
