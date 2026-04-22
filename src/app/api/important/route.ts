import { NextResponse } from "next/server";
import { readCategories, readPanels } from "@/lib/db";

const CORS_ORIGIN = "http://localhost:3004";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  try {
    const categories = readCategories("main");
    const importantName = "\uC911\uC694";
    const importantCat = categories.find((category) => category.name === importantName);

    if (!importantCat) {
      return NextResponse.json(
        { panels: [], lastUpdated: null },
        { headers: corsHeaders() }
      );
    }

    const panels = readPanels("main").filter(
      (panel) => Array.isArray(panel.categoryIds) && panel.categoryIds.includes(importantCat.id)
    );

    return NextResponse.json(
      { panels, lastUpdated: Date.now() },
      { headers: corsHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      { panels: [], lastUpdated: null, error: String(error) },
      { status: 500, headers: corsHeaders() }
    );
  }
}
