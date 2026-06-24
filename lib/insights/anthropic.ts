import Anthropic from "@anthropic-ai/sdk";

import { getInsightsSystemPrompt } from "./system-prompt";

const MODEL = "claude-sonnet-4-6";

const INPUT_COST_PER_MILLION = Number(
  process.env.ANTHROPIC_INPUT_COST_PER_MTOK ?? "3"
);
const OUTPUT_COST_PER_MILLION = Number(
  process.env.ANTHROPIC_OUTPUT_COST_PER_MTOK ?? "15"
);

export function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;
  return Math.ceil((inputCost + outputCost) * 100);
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey });
}

export type InsightAiResponse = {
  summary: string;
  flags: string[];
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

function parseAiJson(text: string): { summary: string; flags: string[] } {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      summary?: string;
      flags?: string[];
    };
    return {
      summary: parsed.summary?.trim() ?? "",
      flags: Array.isArray(parsed.flags)
        ? parsed.flags.map((flag) => String(flag).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return { summary: trimmed, flags: [] };
  }
}

export async function generateInsightNarrative(
  summaryJson: unknown
): Promise<InsightAiResponse> {
  const client = getClient();
  const system = getInsightsSystemPrompt();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [
      {
        role: "user",
        content: `Analyze this pre-computed household finance summary and respond with JSON only:\n\n${JSON.stringify(summaryJson)}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  const parsed = parseAiJson(text);
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;

  return {
    summary: parsed.summary,
    flags: parsed.flags,
    inputTokens,
    outputTokens,
    costCents: estimateCostCents(inputTokens, outputTokens),
  };
}

export async function askInsightQuestion(input: {
  summaryJson: unknown;
  question: string;
}): Promise<InsightAiResponse> {
  const client = getClient();
  const system = `${getInsightsSystemPrompt()}

You are now answering a follow-up question about the same month. Use only the JSON context provided. Keep answers concise (2-4 sentences). Do not compute new totals. Respond in plain text, not JSON.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    messages: [
      {
        role: "user",
        content: `Context JSON:\n${JSON.stringify(input.summaryJson)}\n\nQuestion: ${input.question}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text.trim() : "";
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;

  return {
    summary: text,
    flags: [],
    inputTokens,
    outputTokens,
    costCents: estimateCostCents(inputTokens, outputTokens),
  };
}
