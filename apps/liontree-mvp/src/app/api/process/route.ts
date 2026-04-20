// Thin wrapper kept for backward compatibility.
// New flow uses /api/extract → /api/generate (two-step with assumption review).
import { NextRequest, NextResponse } from "next/server";
import { computeDefaultAssumptions, extractFinancialData, generateExcel } from "@/lib/dcf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    if (file.type !== "application/pdf")
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });

    const pdfBuffer     = Buffer.from(await file.arrayBuffer());
    const financialData = await extractFinancialData(pdfBuffer);
    const assumptions   = computeDefaultAssumptions(financialData);
    const excelBuffer   = await generateExcel(financialData, assumptions);

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
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
