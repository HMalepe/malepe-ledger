import { readFileSync } from "node:fs";
import { join } from "node:path";

let cachedPrompt: string | null = null;

export function getInsightsSystemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  cachedPrompt = readFileSync(
    join(process.cwd(), "00_Appendix_A_AI_System_Prompt.md"),
    "utf-8"
  );
  return cachedPrompt;
}
