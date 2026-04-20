import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file     = formData.get("pdf") as File | null;
    const apiKey   = (formData.get("apiKey") as string || "").trim() || process.env.OPENAI_API_KEY;

    if (!file)   return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "No API key found. Add your OpenAI key in Settings." }, { status: 400 });

    const pdfParse = require("pdf-parse/lib/pdf-parse");
    const buf    = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buf);
    const text   = parsed.text.slice(0, 40_000);

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2500,
      messages: [
        {
          role: "system",
          content: "You are a senior M&A analyst at LionTree, an investment bank focused on media, tech, communications, and consumer industries. You write precise, structured deal summaries from CIMs and information memoranda.",
        },
        {
          role: "user",
          content: `Analyze this document and produce a 1-page deal summary.\n\nDocument:\n${text}\n\nStructure your summary exactly as follows:

**COMPANY**
Name and one-line description.

**BUSINESS OVERVIEW**
2-3 sentences: what they do, key products/services, business model, geographies.

**KEY FINANCIAL METRICS**
Present as a table or bullet list:
- Revenue: [figure + year]
- EBITDA: [figure + margin]
- Growth rate: [YoY]
- Other notable metrics

**INVESTMENT HIGHLIGHTS**
4-5 bullet points — the strongest reasons to pursue this deal.

**KEY RISKS**
3-4 bullet points — principal risks and concerns.

**MANAGEMENT TEAM**
Key executives and relevant background (2-3 lines).

**DEAL STRUCTURE & TERMS** (if disclosed)
Any known pricing, structure, or timeline.

**LIONTREE ANGLE**
How LionTree should position and what value we bring to this deal.

Be precise. Use numbers wherever available. Flag anything that seems incomplete or uncertain.`,
        },
      ],
    });

    const summary = response.choices[0]?.message?.content ?? "";

    // Extract company name from the summary
    const companyMatch = summary.match(/\*\*COMPANY\*\*\n([^\n]+)/);
    const company = companyMatch?.[1]?.split("—")[0]?.split(":").pop()?.trim() || "Company";

    return NextResponse.json({ summary, company });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
