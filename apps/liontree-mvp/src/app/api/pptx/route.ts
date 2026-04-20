import { NextRequest, NextResponse } from "next/server";
import { generatePptx } from "@/lib/pptx";
import type { FinancialData, ProjectionAssumptions } from "@/lib/dcf";

export const runtime   = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      financialData: FinancialData;
      assumptions: ProjectionAssumptions;
    };
    const { financialData, assumptions } = body;

    if (!financialData || !assumptions) {
      return NextResponse.json({ error: "Missing financialData or assumptions" }, { status: 400 });
    }

    const pptxBuffer = await generatePptx(financialData, assumptions);
    const safeCompany = financialData.company.replace(/[^a-zA-Z0-9\s-]/g, "").trim();
    const filename    = `${safeCompany}-DCF-Analysis.pptx`;

    return new NextResponse(new Uint8Array(pptxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Filename": filename,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PPTX generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
