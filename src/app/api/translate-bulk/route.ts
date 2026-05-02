import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
    }

    const { words, context = '', sourceLang = 'Korean', targetLang = 'Indonesian' } = await request.json();

    if (!words || !Array.isArray(words) || words.length === 0) {
      return NextResponse.json({ error: 'words array is required' }, { status: 400 });
    }

    // Deduplicate and limit
    const unique = [...new Set(words.filter((w: string) => w && w.trim().length > 0))].slice(0, 200);

    const prompt = `You are a fast translator. Translate each word/token from ${sourceLang} to ${targetLang}.

Context (for disambiguation): "${context.slice(0, 300)}"

Words to translate:
${unique.join('\n')}

Rules:
- Give a SHORT translation (1-4 words max) for each word
- If a word is punctuation or a number, keep it as-is
- If a word appears multiple times, translate it the same way
- Return ONLY a valid JSON object, no explanation, no markdown
- Format: {"word1": "translation1", "word2": "translation2", ...}

JSON response:`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const groqData = await response.json();
    const raw = groqData.choices?.[0]?.message?.content ?? '{}';

    // Parse JSON — try several strategies
    let translations: Record<string, string> = {};
    try {
      translations = JSON.parse(raw.trim());
    } catch {
      // Try extracting JSON from markdown fences
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        try { translations = JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
      }
      // Try extracting first {...}
      if (Object.keys(translations).length === 0) {
        const braceMatch = raw.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          try { translations = JSON.parse(braceMatch[0]); } catch { /* continue */ }
        }
      }
    }

    return NextResponse.json({ translations });
  } catch (err) {
    console.error('[translate-bulk] error:', err);
    return NextResponse.json({ error: 'Translation failed', translations: {} }, { status: 500 });
  }
}
