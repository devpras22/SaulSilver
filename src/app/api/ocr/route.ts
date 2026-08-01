import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { MedicineItem } from "@/lib/types";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * POST /api/ocr — extract medicine items from an uploaded prescription image.
 *
 * Uses gpt-4o vision. Falls back to a mock extraction if no API key is set,
 * returning a realistic demo basket so the flow is demonstrable end-to-end.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const mimeType = file.type || "image/jpeg";

    // ── Real OpenAI Vision path ──
    if (openai) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a medical OCR assistant for Kusushi, an AI pharmacy agent. Extract every medicine from the prescription image. Return JSON with an 'items' array. Each item: name (generic if possible), dosage (e.g. '500mg'), quantity (number), type (prescription|otc|supplement|device|personal_care), notes (instructions if legible). Be precise. If you can't read something, omit it. Return ONLY valid JSON, no markdown.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all medicines from this prescription.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      const items: MedicineItem[] = (parsed.items ?? []).map(
        (i: Record<string, unknown>, idx: number) => ({
          id: `ocr_${Date.now().toString(36)}_${idx}`,
          name: i.name as string,
          dosage: i.dosage as string | undefined,
          quantity: i.quantity as number,
          type: i.type as MedicineItem["type"],
          notes: i.notes as string | undefined,
        })
      );

      return NextResponse.json({ items, mock: false });
    }

    // ── Mock path ──
    await new Promise((r) => setTimeout(r, 1500));
    const mockItems: MedicineItem[] = [
      {
        id: `ocr_${Date.now().toString(36)}_0`,
        name: "Metformin",
        dosage: "500mg",
        quantity: 30,
        type: "prescription",
        notes: "Twice daily after meals",
      },
      {
        id: `ocr_${Date.now().toString(36)}_1`,
        name: "Atorvastatin",
        dosage: "10mg",
        quantity: 30,
        type: "prescription",
        notes: "At night",
      },
      {
        id: `ocr_${Date.now().toString(36)}_2`,
        name: "Vitamin D3",
        dosage: "60,000 IU",
        quantity: 4,
        type: "supplement",
        notes: "Once weekly",
      },
    ];
    return NextResponse.json({ items: mockItems, mock: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
