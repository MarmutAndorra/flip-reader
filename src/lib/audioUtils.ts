/**
 * Utility functions for word pronunciation audio
 * Hybrid approach: Web Speech API (offline) + Google TTS (online fallback)
 * Anti-Transformer Edition: Natural, human-like voices only!
 */

// Clean text from symbols and numbers
const cleanText = (text: string): string => {
  return text
    .replace(/[()[\]{}]/g, '') // Remove brackets and parentheses
    .replace(/\d+/g, '') // Remove numbers
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ]/g, '') // Keep only letters, spaces, and Korean characters
    .trim();
};

// Get language code for TTS
const getLanguageCode = (text: string): string => {
  // Check if text contains Korean characters
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text)) {
    return 'ko-KR';
  }
  // Check for Indonesian (common words)
  if (/\b(dan|yang|dengan|untuk|ini|itu|adalah|dari|ke|di)\b/i.test(text)) {
    return 'id-ID';
  }
  // Default to English
  return 'en-US';
};

// Cache for voices - Chrome mobile bug fix
let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

/**
 * Initialize voices with Chrome mobile fix
 * Must be called before speaking to ensure voices are loaded
 */
const initVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    // If already loaded, return cached
    if (voicesLoaded && cachedVoices.length > 0) {
      resolve(cachedVoices);
      return;
    }

    const loadVoices = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      if (cachedVoices.length > 0) {
        voicesLoaded = true;
        console.log(`🎙️ Loaded ${cachedVoices.length} voices`);
        resolve(cachedVoices);
      }
    };

    // Try immediate load
    loadVoices();

    // Chrome mobile bug fix: voices load asynchronously
    if (!voicesLoaded) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
      };
      
      // Timeout fallback
      setTimeout(() => {
        if (!voicesLoaded) {
          loadVoices();
          resolve(cachedVoices);
        }
      }, 500);
    }
  });
};

/**
 * Find the best natural voice for a language
 * Priority: Female > Google > Natural > Microsoft > Default
 * NEVER use deep/robotic male voices!
 */
const findBestVoice = (voices: SpeechSynthesisVoice[], langCode: string): SpeechSynthesisVoice | null => {
  const lang = langCode.toLowerCase();
  const isKorean = lang.startsWith('ko');
  const isIndonesian = lang.startsWith('id');
  const isEnglish = lang.startsWith('en');

  // Filter voices that match the language
  const matchingVoices = voices.filter(v => {
    const vLang = v.lang.toLowerCase();
    if (isKorean) return vLang.startsWith('ko');
    if (isIndonesian) return vLang.startsWith('id');
    if (isEnglish) return vLang.startsWith('en');
    return vLang.startsWith(lang.substring(0, 2));
  });

  if (matchingVoices.length === 0) {
    console.log(`⚠️ No voices found for ${langCode}`);
    return null;
  }

  console.log(`🔍 Found ${matchingVoices.length} voices for ${langCode}:`, 
    matchingVoices.map(v => v.name).join(', '));

  // Priority keywords for natural female voices
  const priorityKeywords = [
    'female', 'woman', 'girl',
    'google', 'natural', 
    'heami', 'sunhi', 'yuna', 'seoyeon', // Korean female names
    'samantha', 'karen', 'moira', 'tessa', // English female names
    'damayanti', 'winda', // Indonesian female names
    'premium', 'enhanced', 'neural'
  ];

  // Negative keywords to avoid (deep male voices)
  const avoidKeywords = [
    'male', 'man', 'boy',
    'daniel', 'thomas', 'fred', 'alex', 'bruce', 'lee',
    'junior', 'grandpa', 'old'
  ];

  // Score each voice
  const scoredVoices = matchingVoices.map(voice => {
    const nameLower = voice.name.toLowerCase();
    let score = 0;

    // Bonus for priority keywords
    for (const keyword of priorityKeywords) {
      if (nameLower.includes(keyword)) {
        score += 10;
      }
    }

    // Penalty for avoid keywords
    for (const keyword of avoidKeywords) {
      if (nameLower.includes(keyword)) {
        score -= 20;
      }
    }

    // Extra bonus for Google voices (usually high quality)
    if (nameLower.includes('google')) score += 15;
    
    // Extra bonus for Neural/Premium voices
    if (nameLower.includes('neural') || nameLower.includes('premium')) score += 12;

    // Bonus for remote/online voices (usually better quality)
    if (!voice.localService) score += 5;

    return { voice, score };
  });

  // Sort by score (highest first)
  scoredVoices.sort((a, b) => b.score - a.score);

  const bestVoice = scoredVoices[0]?.voice || matchingVoices[0];
  console.log(`✅ Selected voice: "${bestVoice.name}" (lang: ${bestVoice.lang})`);
  
  return bestVoice;
};

/**
 * Check if running in development/localhost
 */
const isLocalhost = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname === '';
};

/**
 * Play word audio using hybrid approach with waterfall logic
 * Priority 1: Web Speech API (offline)
 * Priority 2: Google TTS (online fallback) - only if Web Speech API fails
 * 
 * Anti-Transformer settings:
 * - Pitch: 1.25 (higher = more natural, less robotic)
 * - Rate: 1.0 (normal speed)
 * - Voice: Female/Google/Natural preferred
 */
export const playWordAudio = async (
  text: string,
  onPlaying?: () => void,
  onEnded?: () => void
): Promise<void> => {
  const cleanedText = cleanText(text);
  if (!cleanedText) return;

  const langCode = getLanguageCode(cleanedText);
  
  // Anti-Transformer Voice Settings
  const PITCH = 1.25;  // Higher pitch = more natural, less robotic
  const RATE = 1.0;    // Normal speed

  // Reset speech synthesis before starting new audio
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // Try Web Speech API first (offline) - Waterfall Logic
  let webSpeechSuccess = false;
  
  if ('speechSynthesis' in window) {
    try {
      // Initialize voices with Chrome mobile fix
      const voices = await initVoices();
      
      // Find the best natural voice
      const selectedVoice = findBestVoice(voices, langCode);

      if (selectedVoice || voices.length > 0) {
        // Use Promise to track if speech actually started
        const speechPromise = new Promise<boolean>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(cleanedText);
          
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log(`🔊 Speaking "${cleanedText}" with voice: ${selectedVoice.name}`);
          } else {
            console.log(`🔊 Speaking "${cleanedText}" with default voice`);
          }
          
          // Anti-Transformer settings
          utterance.pitch = PITCH;
          utterance.rate = RATE;
          utterance.lang = langCode;
          utterance.volume = 1;

          let hasStarted = false;
          let hasErrored = false;
          let isResolved = false;

          const resolveOnce = (success: boolean) => {
            if (!isResolved) {
              isResolved = true;
              resolve(success);
            }
          };

          utterance.onstart = () => {
            hasStarted = true;
            console.log(`▶️ Speech started (pitch: ${PITCH}, rate: ${RATE})`);
            if (onPlaying) onPlaying();
            resolveOnce(true);
          };

          utterance.onend = () => {
            console.log(`⏹️ Speech ended`);
            if (onEnded && hasStarted) onEnded();
            if (!hasStarted && !hasErrored) {
              resolveOnce(false);
            }
          };

          utterance.onerror = (error) => {
            hasErrored = true;
            console.log(`❌ Speech error:`, error.error);
            if (onEnded && hasStarted) onEnded();
            resolveOnce(false);
          };

          window.speechSynthesis.speak(utterance);

          // Timeout fallback: if speech doesn't start within 500ms, consider it failed
          setTimeout(() => {
            if (!hasStarted && !hasErrored && !isResolved) {
              console.log(`⏰ Speech timeout - trying fallback`);
              resolveOnce(false);
            }
          }, 500);
        });

        webSpeechSuccess = await speechPromise;
      }
    } catch (error) {
      console.log('Web Speech API error:', error);
      webSpeechSuccess = false;
    }
  }

  // Only try Google TTS if Web Speech API failed (Waterfall Logic)
  if (!webSpeechSuccess) {
    // Check if speechSynthesis is actually speaking (avoid false errors)
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      return;
    }

    // Fallback to Google TTS (online)
    try {
      console.log(`🌐 Trying Google TTS fallback for "${cleanedText}"`);
      if (onPlaying) onPlaying();
      
      // Google TTS uses short language codes
      let googleLangCode = 'en';
      if (langCode.startsWith('ko')) googleLangCode = 'ko';
      else if (langCode.startsWith('id')) googleLangCode = 'id';
      
      const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanedText)}&tl=${googleLangCode}&client=tw-ob`;
      
      const audio = new Audio(googleTTSUrl);
      audio.playbackRate = 1.0;
      
      if (onEnded) {
        audio.onended = () => {
          console.log(`🌐 Google TTS ended`);
          onEnded();
        };
        audio.onerror = () => {
          if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            return;
          }

          if (isLocalhost()) {
            console.warn('Google TTS unavailable in localhost (CORS)');
          } else {
            console.error('Google TTS failed');
          }
          
          if (onEnded) onEnded();
        };
      }

      await audio.play();
      console.log(`🌐 Google TTS playing`);
    } catch (error) {
      if (isLocalhost()) {
        console.warn('Google TTS unavailable in localhost (CORS)');
      } else {
        console.error('Audio playback failed:', error);
      }
      if (onEnded) onEnded();
    }
  }
};

/**
 * List all available voices (for debugging)
 */
export const listAvailableVoices = async (): Promise<void> => {
  const voices = await initVoices();
  console.log('🎙️ Available voices:');
  voices.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} (${v.lang}) ${v.localService ? '[local]' : '[remote]'}`);
  });
};
