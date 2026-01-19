/**
 * Utility functions for word pronunciation audio
 * Hybrid approach: Web Speech API (offline) + Google TTS (online fallback)
 */

// Clean text from symbols and numbers
const cleanText = (text: string): string => {
  return text
    .replace(/[()[\]{}]/g, '') // Remove brackets and parentheses
    .replace(/\d+/g, '') // Remove numbers
    .replace(/[^\w\s가-힣]/g, '') // Keep only letters, spaces, and Korean characters
    .trim();
};

// Count syllables (approximate for Korean and other languages)
const countSyllables = (text: string): number => {
  // For Korean: count characters (each character is roughly a syllable)
  // For other languages: count vowel groups
  const koreanChars = text.match(/[가-힣]/g);
  if (koreanChars && koreanChars.length > 0) {
    return koreanChars.length;
  }
  
  // For non-Korean: count vowel groups
  const vowels = text.match(/[aeiouAEIOU가-힣]/gi);
  return vowels ? vowels.length : text.length;
};

// Get language code for TTS
const getLanguageCode = (text: string): string => {
  // Check if text contains Korean characters
  if (/[가-힣]/.test(text)) {
    return 'ko'; // Korean
  }
  // Default to English (can be extended for other languages)
  return 'en';
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
 */
export const playWordAudio = async (
  text: string,
  onPlaying?: () => void,
  onEnded?: () => void
): Promise<void> => {
  const cleanedText = cleanText(text);
  if (!cleanedText) return;

  const langCode = getLanguageCode(cleanedText);
  const syllableCount = countSyllables(cleanedText);
  
  // Adjust rate for complex words (> 4 syllables)
  const baseRate = 0.8;
  const rate = syllableCount > 4 ? 0.6 : baseRate;

  // Reset speech synthesis before starting new audio
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // Try Web Speech API first (offline) - Waterfall Logic
  let webSpeechSuccess = false;
  
  if ('speechSynthesis' in window) {
    try {
      // Get voices - try multiple times if needed
      const getVoices = (): SpeechSynthesisVoice[] => {
        return window.speechSynthesis.getVoices();
      };

      let voices = getVoices();
      
      // If voices not loaded, try to trigger loading
      if (voices.length === 0) {
        // Trigger voice loading
        window.speechSynthesis.getVoices();
        // Try again after a short delay
        voices = getVoices();
      }

      // Find available voice for the language
      const availableVoice = voices.find(voice => {
        const voiceLang = voice.lang.toLowerCase();
        return voiceLang.startsWith(langCode.toLowerCase()) || 
               (langCode === 'ko' && (voiceLang.includes('korean') || voiceLang.includes('ko')));
      });

      // If no specific voice found, use default (will use system default)
      if (availableVoice || voices.length > 0) {
        // Use Promise to track if speech actually started
        const speechPromise = new Promise<boolean>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(cleanedText);
          if (availableVoice) {
            utterance.voice = availableVoice;
          }
          utterance.rate = rate;
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
            if (onPlaying) onPlaying();
            resolveOnce(true);
          };

          utterance.onend = () => {
            if (onEnded && hasStarted) onEnded();
            // If it ended without starting, it might have been very fast or failed
            if (!hasStarted && !hasErrored) {
              resolveOnce(false);
            }
          };

          utterance.onerror = (error) => {
            hasErrored = true;
            if (onEnded && hasStarted) onEnded();
            resolveOnce(false);
          };

          window.speechSynthesis.speak(utterance);

          // Timeout fallback: if speech doesn't start within 300ms, consider it failed
          setTimeout(() => {
            if (!hasStarted && !hasErrored && !isResolved) {
              resolveOnce(false);
            }
          }, 300);
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
      // Web Speech API is actually working, don't try Google TTS
      return;
    }

    // Fallback to Google TTS (online)
    try {
      if (onPlaying) onPlaying();
      
      const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanedText)}&tl=${langCode}&client=tw-ob`;
      
      const audio = new Audio(googleTTSUrl);
      audio.playbackRate = rate;
      
      if (onEnded) {
        audio.onended = onEnded;
        audio.onerror = () => {
          // Check if speechSynthesis is speaking before reporting error
          if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            // Web Speech API succeeded, this is a false error
            return;
          }

          // Only log error if we're not in localhost (CORS issues)
          if (isLocalhost()) {
            console.warn('Google TTS unavailable in localhost (CORS). Using Web Speech API instead.');
          } else {
            console.error('Google TTS failed');
          }
          
          if (onEnded) onEnded();
        };
      }

      await audio.play();
    } catch (error) {
      // Handle CORS/network errors gracefully
      if (isLocalhost()) {
        console.warn('Google TTS unavailable in localhost (CORS). Using Web Speech API instead.');
      } else {
        console.error('Audio playback failed:', error);
      }
      if (onEnded) onEnded();
    }
  }
};
