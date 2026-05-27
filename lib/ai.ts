export interface AiMoveRequest {
  stateJson: string;
  dice: number[];
  legalMoves: string[];
  difficulty: "easy" | "medium" | "hard";
}

export async function askGroqForMove(payload: AiMoveRequest): Promise<number | null> {
  if (payload.difficulty !== "hard") {
    return null;
  }

  try {
    const response = await fetch("/api/groq-move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { index?: number | null };
    if (typeof data.index === "number" && Number.isFinite(data.index)) {
      return data.index;
    }
    return null;
  } catch {
    return null;
  }
}
