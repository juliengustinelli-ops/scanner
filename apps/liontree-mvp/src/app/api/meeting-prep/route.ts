import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MEETING_LABELS: Record<string, string> = {
  new_pitch:               "New Pitch / First Meeting",
  due_diligence:           "Due Diligence",
  follow_up:               "Follow-Up",
  management_presentation: "Management Presentation",
};

export async function POST(request: NextRequest) {
  try {
    const formData   = await request.formData();
    const company    = (formData.get("company") as string || "").trim();
    const meetingType = (formData.get("meetingType") as string) || "new_pitch";
    const context    = (formData.get("context") as string || "").trim();
    const apiKey     = (formData.get("apiKey") as string || "").trim() || process.env.OPENAI_API_KEY;
    const docFile    = formData.get("document") as File | null;

    if (!company) return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    if (!apiKey)  return NextResponse.json({ error: "No API key found. Add your OpenAI key in Settings." }, { status: 400 });

    let docText = "";
    if (docFile) {
      const pdfParse = require("pdf-parse/lib/pdf-parse");
      const buf = Buffer.from(await docFile.arrayBuffer());
      const parsed = await pdfParse(buf);
      docText = parsed.text.slice(0, 20_000);
    }

    const client = new OpenAI({ apiKey });

    const systemPrompt = `You are a senior investment banker at LionTree, an independent investment and merchant bank specializing in media, technology, communications, consumer, and creative industries. You write sharp, concise briefing documents for client meetings.`;

    const userPrompt = `Prepare a meeting briefing document for: ${company}
Meeting type: ${MEETING_LABELS[meetingType] || meetingType}
${context ? `Additional context from our team: ${context}` : ""}
${docText ? `\nDocument provided:\n${docText}` : ""}

Write a structured briefing with these sections:

**COMPANY OVERVIEW**
2-3 sentences on what they do, scale, and market position.

**KEY FINANCIALS**
Revenue, EBITDA, growth trajectory if known. Note if figures are estimated.

**RECENT DEVELOPMENTS**
3-5 bullet points: recent deals, leadership changes, strategic announcements, earnings highlights.

**STRATEGIC CONTEXT**
What's driving their agenda right now? Pressure points, opportunities, competitive dynamics.

**DEAL ANGLES FOR LIONTREE**
2-3 specific ways LionTree could add value (M&A advisory, capital raising, strategic partnerships).

**SUGGESTED QUESTIONS**
5 sharp questions to ask in the meeting.

Keep each section tight. Write like a banker, not a consultant. No fluff.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    });

    const brief = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({ brief });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
