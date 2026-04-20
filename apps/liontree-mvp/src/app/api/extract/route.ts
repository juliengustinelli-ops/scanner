import { NextRequest, NextResponse } from "next/server";
import { computeDefaultAssumptions, extractFinancialData } from "@/lib/dcf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file   = formData.get("pdf") as File | null;
    const apiKey = (formData.get("apiKey") as string || "").trim() || process.env.OPENAI_API_KEY;

    if (!file)   return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "No API key found. Add your OpenAI key in Settings." }, { status: 400 });

    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const financialData = await extractFinancialData(pdfBuffer, apiKey);
    const assumptions = computeDefaultAssumptions(financialData);

    const lastRevenue = [...financialData.revenue].reverse().find((v) => v !== null) ?? null;
    const lastEbitda  = [...financialData.ebitda].reverse().find((v) => v !== null) ?? null;

    return NextResponse.json({ financialData, assumptions, lastRevenue, lastEbitda });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
