# AI Workflow Suite for LionTree
### Proposal — Julien Gustinelli / LexAi
**April 2026 · Confidential**

---

## The Opportunity

LionTree operates at the intersection of creativity, community, and capital — mandates that demand speed, precision, and presentation quality that matches the caliber of your clients.

Today, analyst bandwidth is consumed by tasks that are mechanical, not intellectual: extracting financials from PDFs, reformatting data into models, assembling first-draft pitch materials. The work that actually moves a deal forward — judgment, relationships, narrative — gets compressed.

This proposal outlines a bespoke AI workflow suite purpose-built for LionTree's deal team. Not a generic chatbot. A private, firm-specific toolkit that knows your templates, your deal types, and your standards.

---

## What We've Built (Already Working)

**Document Intelligence — PDF → Live DCF Model**

Upload any financial document (10-K, CIM, earnings report). The system extracts historical financials, auto-calculates projection assumptions from historical averages, and outputs a fully formula-driven Excel model in under 30 seconds. Analysts review and edit — they don't format.

Tested against Paramount Global's 2024 Annual Report. Output matched manually-built model.

---

## The Full Suite

### Phase 1 — Document Intelligence *(Built)*
- PDF → structured Excel with live formulas (WACC, terminal growth, DCF, equity value)
- Yellow cells flag GPT uncertainty for analyst review
- Formula bar shows full audit trail — every projection cell is traceable

### Phase 2 — Deal Intelligence Layer *(Proposed)*

**Deal Room Chatbot**
Upload a CIM, NDA, or data room package. Ask questions in plain English: *"What is their net retention rate?"* or *"Summarize the key reps and warranties."* Responses cite the source page. No more ctrl+F through 200-page documents.

**Meeting Prep Brief**
Input a company name or executive contact. Output in 60 seconds: company profile, recent deals and press, suggested talking points, potential objections. Built for coverage calls and client prep — not generic research.

**Branded Pitch Materials**
Auto-generate presentation slides directly from the DCF model output — formatted to LionTree's exact brand specifications (fonts, colors, layout). First draft indistinguishable from a manually-built deck. Senior banker reviews, not rebuilds.

---

## On Data Security

LionTree's documents contain material non-public information. Security is not an afterthought — it is the architecture.

**How it works:**
The AI model is stateless. It processes a document, returns a result, and retains nothing. There is no database of your deal data, no training pipeline, no persistent memory. Each call is the equivalent of a calculation — the model does not write anything down.

**Deployment options:**

| Option | What it means |
|---|---|
| **OpenAI / Anthropic Enterprise API** | Contractual zero data retention. No training on your data. Covered by enterprise terms of service. |
| **Azure OpenAI Service** | All processing occurs inside LionTree's Azure cloud tenant. Documents never leave your infrastructure. Covered under your existing Microsoft enterprise agreement. |
| **On-premise (air-gapped)** | Model runs entirely on LionTree servers. No external network calls. Maximum isolation. |

**Recommendation:** Azure OpenAI. If LionTree has a Microsoft enterprise agreement (likely, given Office 365), this option requires no new vendor approval — it runs inside infrastructure compliance has already cleared.

---

## Timeline & Investment

| Phase | Deliverables | Timeline | Investment |
|---|---|---|---|
| **Phase 1** | Document Intelligence (Excel output, live formulas, branded PPTX shell) | *(Complete)* | — |
| **Phase 2** | Deal Room Chatbot + Meeting Prep Brief + Branded Pitch Materials | 6 weeks from kickoff | $18,000 |
| **Azure Deployment** | Secure cloud deployment inside LionTree's Azure tenant | +1 week | $3,000 |

**Phase 2 total: $21,000**

Includes: full development, Azure deployment, analyst onboarding session, and 30 days of post-launch support.

---

## Why Not Claude Enterprise or Rogo?

Claude Enterprise and Rogo are horizontal tools. They cannot generate a slide that looks like it came from LionTree's design team. They cannot populate your specific DCF template. They do not know that your football field uses five WACC scenarios or that your cover slides carry a specific footer format.

The differentiation is not the AI — it is the integration with your exact workflow and your exact standards. That is what we build.

---

## Next Steps

1. Confirm priority features for Phase 2
2. Provide brand specs (hex codes, fonts, logo) for template calibration
3. Confirm Azure or API deployment preference with IT
4. Countersign engagement letter — kickoff within one week

---

*Prepared by Julien Gustinelli — LexAi*
*juliengustinelli@gmail.com*
