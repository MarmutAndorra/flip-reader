import { NextRequest, NextResponse } from 'next/server';

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

    const { word, sentence, targetLanguage = 'Indonesian' } = await request.json();

    if (!word || !sentence) {
      return NextResponse.json(
        { error: 'Word and sentence are required' },
        { status: 400 }
      );
    }

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
              content: `You are a professional Korean-${targetLanguage} translator and grammar expert. Analyze the Korean word carefully and provide a detailed grammar breakdown if the word contains affixes, conjugations, or grammatical endings. Return ONLY a JSON object with these keys: meaning, word_type, grammar_note, example_sentence, example_translation, and original_sentence_translation. Do not include any explanation or conversational text. 

CRITICAL: Semua penjelasan, definisi, dan contoh HARUS dalam bahasa ${targetLanguage}. Tidak boleh menggunakan bahasa lain.`
            },
            {
              role: 'user',
              content: `Analyze the Korean word '${word}' in the context of this sentence: '${sentence}'. 

IMPORTANT: All penjelasan, definisi, dan contoh harus dalam ${targetLanguage}.

If the word contains affixes, conjugations, or grammatical endings (like ~하다고, ~는, ~을, etc.), provide a detailed grammar breakdown in the grammar_note field showing:
- The base word (dictionary form) with its meaning in ${targetLanguage}
- The grammatical ending/affix with its function explained in ${targetLanguage}

Format: "BaseWord (Meaning in ${targetLanguage}) + ~Ending (Function/Explanation in ${targetLanguage})"

Example: If the word is '중요하다고' and target language is Indonesian, grammar_note should be: "중요하다 (Penting) + ~다고 (akhiran kutipan/penegasan)". If target language is English, it should be: "중요하다 (Important) + ~다고 (quotation/emphasis ending)".

If the word is a base word without affixes or conjugations, set grammar_note to the equivalent of "Bentuk dasar" in ${targetLanguage}.

Provide:
- meaning: The translation/definition in ${targetLanguage}
- word_type: The part of speech in ${targetLanguage}
- grammar_note: As described above, all explanations in ${targetLanguage}
- example_sentence: A simple example sentence in Korean that uses this word naturally
- example_translation: The translation of example_sentence in ${targetLanguage}
- original_sentence_translation: Translate the original sentence '${sentence}' into ${targetLanguage}. This is the sentence from the text where the word appears.`
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

    return NextResponse.json({
      definition: parsedData.meaning || 'Arti kata tidak ditemukan',
      partOfSpeech: parsedData.word_type || 'Unknown',
      grammarNote: parsedData.grammar_note || 'Bentuk dasar',
      example: parsedData.example_sentence || 'Contoh kalimat tidak tersedia',
      exampleTranslation: parsedData.example_translation || '',
      originalSentenceTranslation: parsedData.original_sentence_translation || '',
    });
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
