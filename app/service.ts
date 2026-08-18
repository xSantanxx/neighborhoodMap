const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const REQUEST_TIMEOUT_MS = 12_000;

const descriptionCache = new Map<string, string>();

const SYSTEM_PROMPT = `You are a fun, knowledgeable local guide. 
Write a short, engaging 2-4 sentence description of a neighborhood. 
Highlight its vibe, any known characteristics, or why it's interesting. 
Be positive and exciting.`;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateNeighborhoodDescription(
  neighborhoodName: string,
  city = "New York City"
): Promise<string | null> {
  const cacheKey = `${neighborhoodName}|${city}`;
  const cached = descriptionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!GROQ_API_KEY) {
    console.warn("Missing EXPO_PUBLIC_GROQ_API_KEY");
    return null;
  }

  try {
    const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Describe the neighborhood: ${neighborhoodName} in ${city}` },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      console.error("Groq API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return null;
    }

    descriptionCache.set(cacheKey, content);
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("Groq request timed out for", neighborhoodName);
    } else {
      console.error("AI Generation Error:", error);
    }
    return null;
  }
}
