import { NextRequest, NextResponse } from "next/server";
import { parseAiIndex } from "@/lib/backgammon";

interface RequestBody {
  stateJson?: string;
  dice?: number[];
  legalMoves?: string[];
  difficulty?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.legalMoves || body.legalMoves.length === 0) {
      return NextResponse.json({ index: null }, { status: 200 });
    }

    if (body.difficulty !== "hard") {
      return NextResponse.json({ index: null }, { status: 200 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ index: null }, { status: 200 });
    }

    const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

    const prompt = [
      "You are a backgammon move selector for black (AI).",
      "Choose exactly one legal option index.",
      "Respond ONLY with a single integer, no extra text.",
      `Dice: ${JSON.stringify(body.dice ?? [])}`,
      `State: ${body.stateJson ?? "{}"}`,
      "Legal options:",
      ...body.legalMoves.map((m, i) => `${i}: ${m}`)
    ].join("\n");

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "Return a single integer index from the provided legal options."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!groqResponse.ok) {
      return NextResponse.json({ index: null }, { status: 200 });
    }

    const data = (await groqResponse.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    const index = parseAiIndex(text, body.legalMoves.length);

    return NextResponse.json({ index }, { status: 200 });
  } catch {
    return NextResponse.json({ index: null }, { status: 200 });
  }
}
