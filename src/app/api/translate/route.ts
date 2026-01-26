import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Check API key with logging
    console.log('API Key check:', process.env.GROQ_API_KEY ? 'Present' : 'Missing');
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'GROQ_API_KEY is not configured',
          message: 'Please configure GROQ_API_KEY in your environment variables'
        },
        { status: 500 }
      );
    }

    const { word, sentence, targetLanguage = 'Indonesian', sourceLanguage = 'Auto-Detect' } = await request.json();

    if (!word || !sentence) {
      return NextResponse.json(
        { error: 'Word and sentence are required' },
        { status: 400 }
      );
    }

    // Construct language context string
    const langContext = sourceLanguage === 'Auto-Detect'
      ? "Detect the source language of the input automatically."
      : `The input text is in ${sourceLanguage}.`;

    // --- 1. SMART CACHING STRATEGY ---
    // Try to find the word in our Shared Global Cache first.
    // This saves AI tokens and speeds up response time significantly.

    // We use the Service Role Key if available to bypass RLS, otherwise fallback to Anon Key
    // Note: Ensure SUPABASE_SERVICE_ROLE_KEY is set in .env.local for write access to cache if RLS is strict
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Normalize cache key: lowercase trimmed + lang context
    // We should include source language in cache key implicitly via term uniqueness, 
    // but ideally we should have source_language col. 
    // For now, term + target_language is unique enough for strict matches.
    const cacheTerm = word.trim().toLowerCase();

    try {
      const { data: cacheData, error: cacheError } = await supabaseAdmin
        .from('global_word_cache')
        .select('id, data, frequency')
        .eq('term', cacheTerm)
        .eq('target_language', targetLanguage)
        .single();

      if (cacheData && !cacheError) {
        console.log(`[CACHE HIT] Found "${cacheTerm}" in global cache.`);

        // Asynchronously update frequency (fire and forget)
        supabaseAdmin.rpc('increment_cache_frequency', { row_id: cacheData.id }).then(() => { });
        // Or simple update if RPC not set:
        // supabaseAdmin.from('global_word_cache').update({ frequency: (cacheData.frequency || 1) + 1 }).eq('term', cacheTerm);

        // Return cached data immediately!
        return NextResponse.json({
          ...cacheData.data,
          _source: 'cache' // Debug flag
        });
      }
    } catch (e) {
      console.warn('[CACHE SKIP] Error checking cache:', e);
      // Generate AI response as fallback
    }

    // --- 2. AI GENERATION (Cache Miss) ---
    // Use Groq API with llama-3.3-70b-versatile (matching playground config)
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `You are a professional language expert and translator. Your task is to analyze the input text (which can be a single word, a phrase, or a full sentence) and provide a detailed explanation in ${targetLanguage}.
${langContext}

If the input is a single word:
- Provide its specific dictionary definition.
- Identify the part of speech.
- Analyze grammar/particles if present (especially for agglutinative languages like Korean/Japanese/Turkish).

If the input is a phrase or idiom:
- Provide the meaning of the WHOLE phrase/idiom.
- Identify it as "Phrase" or "Idiom".

If the input is a complete sentence:
- Provide the full translation of the sentence.
- Identify it as "Sentence".
- In the grammar note, explain the key grammatical structure of the sentence briefly.

Return ONLY a JSON object with these keys: detected_language, meaning, word_type, grammar_note, example_sentence, example_translation, original_sentence_translation, and learning_essence.

CRITICAL: All explanations, definitions, and translations MUST be in ${targetLanguage}.`
            },
            {
              role: 'user',
              content: `Analyze this input text: '${word}'.
Context sentence where it appears: '${sentence}'.
Source Language: ${sourceLanguage}.

IMPORTANT: 
- If '${word}' contains multiple words, treat it as a phrase/sentence to be translated together, DO NOT pick just one word to define.
- All output must be in ${targetLanguage}.

Specific Instructions for 'detected_language':
- Identify the language of '${word}'. Return ONLY the full name of the language (e.g. 'Korean', 'Japanese', 'English', etc).

Specific Instructions for 'grammar_note':
- A detailed structural breakdown of '${word}'.
- Break down the word/phrase into its constituent parts (conjugations, particles, stems, etc).
- Use the format: "Component -> Meaning/Role".
- List each component on a NEW LINE.

Specific Instructions for 'learning_essence':
- Provide deep insights for a learner. 
- Explain nuances (e.g. formal vs informal), cultural context, or an "aha!" moment about why it's used this way.
- Keep it concise but very helpful for memorization.

Provide:
- detected_language: The name of the language you detected.
- meaning: The translation of '${word}' in ${targetLanguage}.
- word_type: Part of speech (Noun, Verb, Phrase, Sentence, etc.) in ${targetLanguage}.
- grammar_note: Structured breakdown.
- learning_essence: Nuances/Insights.
- example_sentence: A NEW example sentence (different from context) using this word/phrase.
- example_translation: Translation of the example sentence in ${targetLanguage}.
- original_sentence_translation: Translate the full context sentence '${sentence}' into ${targetLanguage}.`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      }
    );

    console.log('Groq API Response Status:', response.status);
    console.log('Groq API Response OK:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error:', response.status, errorText);

      // Return clear error message for frontend
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      return NextResponse.json(
        {
          error: 'Groq API request failed',
          message: errorData.message || `HTTP ${response.status}: ${errorText}`,
          status: response.status
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Log full response for debugging
    console.log('Full Groq Response:', JSON.stringify(data, null, 2));

    // Property check: Verify response structure
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('Invalid response structure - missing choices array');
      return NextResponse.json(
        {
          error: 'Invalid response structure',
          message: 'Groq API returned invalid response: missing choices array',
          details: 'Response does not contain expected choices array'
        },
        { status: 500 }
      );
    }

    if (!data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error('Invalid response structure - missing message.content');
      console.error('Response structure:', {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        firstChoice: data.choices?.[0],
        hasMessage: !!data.choices?.[0]?.message,
        hasContent: !!data.choices?.[0]?.message?.content
      });
      return NextResponse.json(
        {
          error: 'Invalid response structure',
          message: 'Groq API returned invalid response: missing message content',
          details: 'Response does not contain expected message content'
        },
        { status: 500 }
      );
    }

    // Extract text from response (Groq uses OpenAI-compatible format)
    // Safe extraction with null check
    let text: string;
    try {
      text = data.choices[0].message.content;
      if (!text || typeof text !== 'string') {
        throw new Error('Content is not a valid string');
      }
      console.log('Extracted text from response:', text);
    } catch (extractError) {
      console.error('Failed to extract content from response:', extractError);
      return NextResponse.json(
        {
          error: 'Failed to extract response content',
          message: 'Unable to extract text content from Groq API response',
          details: extractError instanceof Error ? extractError.message : 'Unknown extraction error'
        },
        { status: 500 }
      );
    }

    // Safe JSON parsing with detailed error handling
    let parsedData: any;
    let jsonText = text.trim();

    try {
      // First attempt: Try parsing directly
      parsedData = JSON.parse(jsonText);
      console.log('Successfully parsed JSON directly');
    } catch (directParseError) {
      console.log('Direct parse failed, trying to clean and extract JSON...');
      console.log('Raw text before cleaning:', jsonText);

      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      jsonText = jsonText.replace(/^```\s*/i, '').replace(/```\s*$/, '');
      // Remove any leading/trailing whitespace or newlines
      jsonText = jsonText.trim();

      try {
        // Second attempt: Try parsing after cleaning
        parsedData = JSON.parse(jsonText);
        console.log('Successfully parsed JSON after cleaning');
      } catch (cleanedParseError) {
        console.log('Cleaned parse also failed, trying regex extraction...');

        // Third attempt: Extract JSON using regex to find {...}
        // Use non-greedy match to get the first complete JSON object
        const jsonMatch = jsonText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          try {
            parsedData = JSON.parse(jsonMatch[0]);
            console.log('Successfully parsed JSON from regex match');
          } catch (regexParseError) {
            console.error('Regex match found but parse failed:', regexParseError);
            console.error('Matched text:', jsonMatch[0]);

            // Try with greedy match as last resort
            const greedyMatch = jsonText.match(/\{[\s\S]*\}/);
            if (greedyMatch && greedyMatch[0] !== jsonMatch[0]) {
              try {
                parsedData = JSON.parse(greedyMatch[0]);
                console.log('Successfully parsed JSON from greedy regex match');
              } catch (greedyParseError) {
                return NextResponse.json(
                  {
                    error: 'Failed to parse JSON response',
                    message: 'AI response contains invalid JSON format',
                    details: `Could not parse JSON from response. Text preview: ${jsonText.substring(0, 200)}`
                  },
                  { status: 500 }
                );
              }
            } else {
              return NextResponse.json(
                {
                  error: 'Failed to parse JSON response',
                  message: 'AI response contains invalid JSON format',
                  details: `Could not parse JSON from response. Text preview: ${jsonText.substring(0, 200)}`
                },
                { status: 500 }
              );
            }
          }
        } else {
          console.error('No JSON object found in response text');
          console.error('Text that failed to parse:', jsonText);
          return NextResponse.json(
            {
              error: 'Failed to parse JSON response',
              message: 'AI response does not contain valid JSON',
              details: `No JSON object found in response. Text preview: ${jsonText.substring(0, 200)}`
            },
            { status: 500 }
          );
        }
      }
    }

    // Validate parsed data structure
    if (!parsedData || typeof parsedData !== 'object') {
      console.error('Parsed data is not a valid object:', parsedData);
      return NextResponse.json(
        {
          error: 'Invalid response format',
          message: 'Parsed JSON is not a valid object',
          details: 'The AI response did not return a valid JSON object'
        },
        { status: 500 }
      );
    }

    const resultData = {
      detectedLanguage: parsedData.detected_language || 'Unknown',
      definition: parsedData.meaning || 'Arti kata tidak ditemukan',
      partOfSpeech: parsedData.word_type || 'Unknown',
      grammarNote: parsedData.grammar_note || 'Bentuk dasar',
      example: parsedData.example_sentence || 'Contoh kalimat tidak tersedia',
      exampleTranslation: parsedData.example_translation || '',
      originalSentenceTranslation: parsedData.original_sentence_translation || '',
      learningEssence: parsedData.learning_essence || '',
    };

    // --- 3. SAVE TO CACHE (Async) ---
    // Save the new result to global cache for future users
    // We don't await this to keep response fast
    (async () => {
      try {
        const { error: insertError } = await supabaseAdmin
          .from('global_word_cache')
          .insert({
            term: cacheTerm,
            target_language: targetLanguage,
            data: resultData
            // frequency maps to default 1
          });

        if (insertError) {
          // Duplicate key error is fine (race condition), just ignore
          if (insertError.code !== '23505') {
            console.warn('[CACHE SAVE ERROR]', insertError);
          }
        } else {
          console.log(`[CACHE SAVED] Saved "${cacheTerm}" to global cache.`);
        }
      } catch (err) {
        console.warn('Cache save failed', err);
      }
    })();

    return NextResponse.json(resultData);
  } catch (error) {
    console.error('Error in translate API:', error);

    // Return clear error message for frontend to prevent crash
    return NextResponse.json(
      {
        error: 'Failed to translate word',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'An unexpected error occurred while processing the translation request'
      },
      { status: 500 }
    );
  }
}
