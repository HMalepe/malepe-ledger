import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export async function suggestCategoryWithAi(input: {
  description: string;
  categories: string[];
}): Promise<string | null> {
  const client = getClient();
  if (!client || input.categories.length === 0) return null;

  const categoryList = input.categories.join(", ");

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 32,
      messages: [
        {
          role: "user",
          content: `Transaction description: "${input.description.trim()}"
Available categories: ${categoryList}

Pick the single best matching category from the list, or reply NONE if no good match.
Reply with only the category name exactly as listed, or NONE.`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text.trim() : "";
    if (!text || text.toUpperCase() === "NONE") return null;

    const match = input.categories.find(
      (category) => category.toLowerCase() === text.toLowerCase()
    );
    return match ?? null;
  } catch {
    return null;
  }
}
