export type CategorySuggestion = {
  category: string;
  source: "mapping" | "history" | "ai";
  confidence: "high" | "medium" | "low";
  merchantKey: string;
};
