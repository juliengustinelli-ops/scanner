import { NextRequest, NextResponse } from "next/server";
import { generateExcel } from "@/lib/dcf";
import type { FinancialData, ProjectionAssumptions } from "@/lib/dcf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { financialData: FinancialData; assumptions: ProjectionAssumptions };
    const { financialData, assumptions } = body;

    if (!financialData || !assumptions) {
      return NextResponse.json({ error: "Missing financialData or assumptions" }, { status: 400 });
    }

    const excelBuffer = await generateExcel(financialData, assumptions);
    const safeCompany = financialData.company.replace(/[^a-zA-Z0-9\s-]/g, "").trim();
    const filename    = `${safeCompany}-DCF.xlsx`;

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Company-Name": financialData.company,
        "X-Years": financialData.years.join(","),
        "X-Filename": filename,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
