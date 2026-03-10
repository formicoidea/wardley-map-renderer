import Anthropic from "@anthropic-ai/sdk";
import { WardleyMapSchema, sanitizeMap, type WardleyMap } from "./schema.js";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a Wardley Mapping expert. Given a business description, you produce a structured Wardley value chain as JSON.

RULES:
1. Identify the key USER/STAKEHOLDER as an "anchor" component (type: "anchor", nature: null)
2. Identify their NEEDS (type: "need", nature: "natural_need" or "technical_system_need")
3. Identify the CAPABILITIES that serve those needs (type: "capacity", nature: one of "activity", "practice", "data", "knowledge")
4. Auto-deduce dependency relations between components (edges flow from user needs down to underlying capabilities)
5. Assign evolution values (0-1 scale): 0-0.17 = genesis, 0.17-0.40 = custom, 0.40-0.70 = product, 0.70-1.0 = commodity
6. Assign visibility values (0-1 scale): 0 = most visible to user (top of chain), 1 = least visible (bottom infrastructure)
7. Generate 6-15 components for a useful map. Not too few, not overwhelming.
8. Each component needs a unique id (short kebab-case, e.g. "web-platform", "user-data")

EVOLUTION HEURISTICS:
- If many providers exist and it's interchangeable: commodity (0.7-1.0)
- If it's a recognized product/service with some differentiation: product (0.4-0.7)
- If it's custom-built for this context: custom (0.17-0.4)
- If it's novel/experimental/uncertain: genesis (0-0.17)

Respond with ONLY valid JSON matching this schema. No markdown, no explanation, just the JSON object:
{
  "title": "string - map title",
  "context": "string - brief context note",
  "components": [
    {
      "id": "string",
      "label": "string",
      "type": "anchor" | "need" | "capacity",
      "nature": null | "natural_need" | "technical_system_need" | "activity" | "practice" | "data" | "knowledge",
      "evolution": number (0-1),
      "visibility": number (0-1),
      "description": "string (optional)"
    }
  ],
  "relations": [
    { "from": "component-id", "to": "component-id", "type": "dependency" }
  ]
}`;

export async function generateMap(prompt: string): Promise<WardleyMap> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate a Wardley Map for this business context:\n\n${prompt}`,
      },
    ],
  });

  // Extract text from response
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON -- handle the case where Claude wraps it in markdown
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`LLM returned invalid JSON: ${(e as Error).message}\n\nRaw output:\n${text}`);
  }

  // Validate with Zod (Engine 3)
  const parsed = WardleyMapSchema.parse(raw);

  // Sanitize (Engine 3 - auto-fix)
  const map = sanitizeMap(parsed);

  return map;
}
