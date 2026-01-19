/**
 * Utility functions for word pronunciation audio
 * Hybrid approach: Web Speech API (offline) + Google TTS (online fallback)
 * Mobile-optimized: Prioritize Google voices, locked pitch & rate
 */

// Clean text from symbols and numbers
const cleanText = (text: string): string => {
  return text
    .replace(/[()[\]{}]/g, '')
    .replace(/\d+/g, '')
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ]/g, '')
    .trim();
};

// Get language code for TTS
const getLanguageCode = (text: string): string => {
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text)) {
    return 'ko-KR';
  }
  if (/\b(dan|yang|dengan|untuk|ini|itu|adalah|dari|ke|di)\b/i.test(text)) {
    return 'id-ID';
  }
  return 'en-US';
};

// =============================================
// LOCKED TTS SETTINGS - DO NOT LET SYSTEM OVERRIDE
// =============================================
const TTS_SETTINGS = {
  PITCH: 1.1,    // Slightly higher than default (1.0) for natural sound
  RATE: 1.0,     // Normal speed - locked
  VOLUME: 1.0    // Full volume
};

// Cache for voices
let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

/**
 * Initialize voices with Chrome mobile fix
 */
const initVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    if (voicesLoaded && cachedVoices.length > 0) {
      resolve(cachedVoices);
      return;
    }

    const loadVoices = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      if (cachedVoices.length > 0) {
        voicesLoaded = true;
        console.log(`🎙️ Loaded ${cachedVoices.length} voices`);
      }
    };

    loadVoices();

    // Chrome mobile fix: voices load asynchronously via onvoiceschanged
    if (!voicesLoaded) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
        resolve(cachedVoices);
      };
      
      // Timeout fallback
      setTimeout(() => {
        if (!voicesLoaded) {
          loadVoices();
        }
        resolve(cachedVoices);
      }, 500);
    } else {
      resolve(cachedVoices);
    }
  });
};

/**
 * Find Google voice for specific language
 * Priority: Google > Microsoft Female > Any Female > Default
 */
const findGoogleVoice = (voices: SpeechSynthesisVoice[], langCode: string): SpeechSynthesisVoice | null => {
  const langPrefix = langCode.toLowerCase().substring(0, 2);
  
  // Filter voices matching the language
  const matchingVoices = voices.filter(v => {
    const vLang = v.lang.toLowerCase();
    return vLang.startsWith(langPrefix) || vLang === langCode.toLowerCase();
  });

  if (matchingVoices.length === 0) {
    console.log(`⚠️ No voices for ${langCode}`);
    return null;
  }

  // Priority 1: Google voice (most stable on mobile)
  const googleVoice = matchingVoices.find(v => 
    v.name.toLowerCase().includes('google')
  );
  if (googleVoice) {
    console.log(`✅ Found Google voice: ${googleVoice.name}`);
    return googleVoice;
  }

  // Priority 2: Microsoft Female voice
  const msFemalelist = ['heami', 'sunhi', 'yuna', 'seoyeon', 'zira', 'hazel', 'susan'];
  const msFemale = matchingVoices.find(v => {
    const name = v.name.toLowerCase();
    return name.includes('microsoft') && msFemalelist.some(f => name.includes(f));
  });
  if (msFemale) {
    console.log(`✅ Found MS Female voice: ${msFemale.name}`);
    return msFemale;
  }

  // Priority 3: Any Female voice
  const femaleVoice = matchingVoices.find(v => {
    const name = v.name.toLowerCase();
    return name.includes('female') || name.includes('woman') || 
           name.includes('samantha') || name.includes('karen') ||
           name.includes('yuna') || name.includes('seoyeon');
  });
  if (femaleVoice) {
    console.log(`✅ Found Female voice: ${femaleVoice.name}`);
    return femaleVoice;
  }

  // Priority 4: Remote/Online voice (usually better quality)
  const remoteVoice = matchingVoices.find(v => !v.localService);
  if (remoteVoice) {
    console.log(`✅ Found Remote voice: ${remoteVoice.name}`);
    return remoteVoice;
  }

  // Fallback: first matching voice
  console.log(`⚠️ Using fallback voice: ${matchingVoices[0].name}`);
  return matchingVoices[0];
};

const isLocalhost = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname === '';
};

/**
 * Play word audio - Mobile optimized
 * - Prioritizes Google voices (most stable on mobile)
 * - Locked pitch (1.1) and rate (1.0) 
 * - Falls back to Google TTS API if Web Speech fails
 */
export const playWordAudio = async (
  text: string,
  onPlaying?: () => void,
  onEnded?: () => void
): Promise<void> => {
  const cleanedText = cleanText(text);
  if (!cleanedText) return;

  const langCode = getLanguageCode(cleanedText);

  // Cancel any ongoing speech
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  let webSpeechSuccess = false;

  // Try Web Speech API first
  if ('speechSynthesis' in window) {
    try {
      const voices = await initVoices();
      const selectedVoice = findGoogleVoice(voices, langCode);

      const speechPromise = new Promise<boolean>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(cleanedText);
        
        // Apply selected voice
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        
        // LOCKED SETTINGS - prevents system override
        utterance.pitch = TTS_SETTINGS.PITCH;
        utterance.rate = TTS_SETTINGS.RATE;
        utterance.volume = TTS_SETTINGS.VOLUME;
        utterance.lang = langCode;

        console.log(`🔊 Speaking: "${cleanedText}"`);
        console.log(`   Voice: ${selectedVoice?.name || 'default'}`);
        console.log(`   Lang: ${langCode}, Pitch: ${TTS_SETTINGS.PITCH}, Rate: ${TTS_SETTINGS.RATE}`);

        let hasStarted = false;
        let isResolved = false;

        const resolveOnce = (success: boolean) => {
          if (!isResolved) {
            isResolved = true;
            resolve(success);
          }
        };

        utterance.onstart = () => {
          hasStarted = true;
          console.log(`▶️ Speech started`);
          if (onPlaying) onPlaying();
          resolveOnce(true);
        };

        utterance.onend = () => {
          console.log(`⏹️ Speech ended`);
          if (onEnded && hasStarted) onEnded();
          if (!hasStarted) resolveOnce(false);
        };

        utterance.onerror = (e) => {
          console.log(`❌ Speech error: ${e.error}`);
          if (onEnded && hasStarted) onEnded();
          resolveOnce(false);
        };

        window.speechSynthesis.speak(utterance);

        // Timeout: if no start in 500ms, consider failed
        setTimeout(() => {
          if (!hasStarted && !isResolved) {
            console.log(`⏰ Speech timeout`);
            resolveOnce(false);
          }
        }, 500);
      });

      webSpeechSuccess = await speechPromise;
    } catch (error) {
      console.log('Web Speech error:', error);
      webSpeechSuccess = false;
    }
  }

  // Fallback to Google TTS if Web Speech failed
  if (!webSpeechSuccess) {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      return;
    }

    try {
      console.log(`🌐 Fallback to Google TTS`);
      if (onPlaying) onPlaying();

      let googleLang = 'en';
      if (langCode.startsWith('ko')) googleLang = 'ko';
      else if (langCode.startsWith('id')) googleLang = 'id';

      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanedText)}&tl=${googleLang}&client=tw-ob`;
      
      const audio = new Audio(url);
      audio.playbackRate = TTS_SETTINGS.RATE; // Locked rate

      audio.onended = () => {
        console.log(`🌐 Google TTS ended`);
        if (onEnded) onEnded();
      };
      
      audio.onerror = () => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) return;
        if (!isLocalhost()) console.error('Google TTS failed');
        if (onEnded) onEnded();
      };

      await audio.play();
    } catch (error) {
      if (!isLocalhost()) console.error('TTS failed:', error);
      if (onEnded) onEnded();
    }
  }
};

/**
 * Debug: List all available voices
 */
export const listAvailableVoices = async (): Promise<void> => {
  const voices = await initVoices();
  console.log('🎙️ Available voices:');
  voices.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} [${v.lang}] ${v.localService ? 'local' : 'remote'}`);
  });
};
