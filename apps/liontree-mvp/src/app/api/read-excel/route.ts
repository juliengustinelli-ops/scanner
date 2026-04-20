import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { FinancialData, ProjectionAssumptions } from "@/lib/dcf";

export const runtime = "nodejs";

const ROWS = {
  WACC: 5, TERM_GROWTH: 6, TAX: 7, REV_GROWTH: 8,
  EBITDA_MARGIN: 9, DA_PCT: 10, CAPEX_PCT: 11,
  YEAR_INDEX: 13, FY_HDR: 14,
  REV: 16, EBITDA: 18, DA: 21, EBIT: 23, CAPEX: 32,
  NET_DEBT: 42, SHARES: 44,
};

function numVal(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" ? r : null;
  }
  return null;
}

function histColCount(ws: ExcelJS.Worksheet): number {
  let count = 0;
  for (let col = 2; col <= 20; col++) {
    const yearVal = ws.getCell(ROWS.FY_HDR, col).value;
    if (!yearVal) break;
    const idxVal = ws.getCell(ROWS.YEAR_INDEX, col).value;
    // Historical columns have no year-index number (empty); projection cols have 1–5
    if (idxVal === null || idxVal === "" || idxVal === undefined) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function readHistRow(ws: ExcelJS.Worksheet, row: number, histN: number, negate = false): (number | null)[] {
  const vals: (number | null)[] = [];
  for (let col = 2; col < 2 + histN; col++) {
    const v = numVal(ws.getCell(row, col));
    vals.push(v !== null && negate ? -v : v);
  }
  return vals;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("xlsx") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wb.xlsx as any).load(await file.arrayBuffer());

    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: "No worksheet found" }, { status: 400 });

    // Assumptions from B5:B11 — always static values
    const assumptions: ProjectionAssumptions = {
      wacc:         numVal(ws.getCell(ROWS.WACC,         2)) ?? 0.10,
      termGrowth:   numVal(ws.getCell(ROWS.TERM_GROWTH,  2)) ?? 0.025,
      taxRate:      numVal(ws.getCell(ROWS.TAX,          2)) ?? 0.25,
      revGrowth:    numVal(ws.getCell(ROWS.REV_GROWTH,   2)) ?? 0.05,
      ebitdaMargin: numVal(ws.getCell(ROWS.EBITDA_MARGIN,2)) ?? 0.20,
      daRevPct:     numVal(ws.getCell(ROWS.DA_PCT,       2)) ?? 0.03,
      capexRevPct:  numVal(ws.getCell(ROWS.CAPEX_PCT,    2)) ?? 0.04,
    };

    // Company name from row 1 title: "COMPANY — DCF VALUATION MODEL"
    const titleVal = ws.getCell(1, 1).value;
    const titleStr = typeof titleVal === "string" ? titleVal : "";
    const company  = titleStr.split("—")[0].trim() || "Company";

    // Currency / unit from FY header label: "Fiscal Year  (USD in millions)"
    const fyLabel = typeof ws.getCell(ROWS.FY_HDR, 1).value === "string"
      ? (ws.getCell(ROWS.FY_HDR, 1).value as string)
      : "";
    const currMatch = fyLabel.match(/\((\w+)\s+in\s+(\w+)\)/);
    const currency  = currMatch?.[1] ?? "USD";
    const unit      = currMatch?.[2] ?? "millions";

    // Determine how many historical columns exist
    const histN = histColCount(ws);
    if (histN === 0) {
      return NextResponse.json({ error: "Could not locate historical data columns" }, { status: 400 });
    }

    // Read year labels
    const years: string[] = [];
    for (let col = 2; col < 2 + histN; col++) {
      const y = ws.getCell(ROWS.FY_HDR, col).value;
      if (y) years.push(String(y));
    }

    // Net Debt: stored as negative ("Less: Net Debt"), flip sign back
    const netDebtStored = numVal(ws.getCell(ROWS.NET_DEBT, 2));
    const netDebt = netDebtStored !== null ? -netDebtStored : null;

    const financialData: FinancialData = {
      company,
      currency,
      unit,
      years,
      revenue: readHistRow(ws, ROWS.REV,    histN),
      ebitda:  readHistRow(ws, ROWS.EBITDA, histN),
      ebit:    readHistRow(ws, ROWS.EBIT,   histN),
      da:      readHistRow(ws, ROWS.DA,     histN),
      capex:   readHistRow(ws, ROWS.CAPEX,  histN, true), // stored negative, flip to positive
      net_debt:    netDebt,
      cash:        null,
      share_count: numVal(ws.getCell(ROWS.SHARES, 2)),
      tax_rate:    assumptions.taxRate,
      uncertain_cells: [],
    };

    return NextResponse.json({ financialData, assumptions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read Excel file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
