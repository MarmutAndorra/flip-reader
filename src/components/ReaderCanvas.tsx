'use client';

import { useState, useEffect } from 'react';
import { t, translatePartOfSpeech } from '@/lib/translations';
import { playWordAudio } from '@/lib/audioUtils';
import { useAuth } from '@/contexts/AuthContext';
import * as wordBankService from '@/lib/wordBankService';

interface WordData {
  definition: string;
  partOfSpeech: string;
  grammarNote: string;
  example: string;
  exampleTranslation?: string;
  originalSentenceTranslation?: string;
}

interface TextHistory {
  id: string;
  text: string;
  savedAt: string;
}

interface ReaderCanvasProps {
  appLanguage?: string;
}

export default function ReaderCanvas({ appLanguage = 'Bahasa Indonesia' }: ReaderCanvasProps) {
  const { user } = useAuth();
  
  const [text, setText] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [originalSentence, setOriginalSentence] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [wordData, setWordData] = useState<WordData | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>('');  // Message for save feedback
  const [textHistory, setTextHistory] = useState<TextHistory[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<string>('Indonesian');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isPlayingExampleAudio, setIsPlayingExampleAudio] = useState(false);
  const [isPlayingOriginalAudio, setIsPlayingOriginalAudio] = useState(false);

  // Load text history from localStorage
  const loadTextHistory = () => {
    try {
      const history = JSON.parse(localStorage.getItem('reader-text-history') || '[]');
      setTextHistory(history);
    } catch (error) {
      console.error('Error loading text history:', error);
      setTextHistory([]);
    }
  };

  // Save text to history
  const saveToHistory = (textToSave: string) => {
    try {
      const history: TextHistory[] = JSON.parse(localStorage.getItem('reader-text-history') || '[]');
      
      // Check if text already exists (avoid duplicates)
      const exists = history.some(item => item.text === textToSave.trim());
      if (exists) {
        return;
      }

      const newHistoryItem: TextHistory = {
        id: Date.now().toString(),
        text: textToSave.trim(),
        savedAt: new Date().toISOString()
      };

      // Add to beginning of array (newest first)
      const updatedHistory = [newHistoryItem, ...history].slice(0, 20); // Keep only last 20 items
      localStorage.setItem('reader-text-history', JSON.stringify(updatedHistory));
      setTextHistory(updatedHistory);
    } catch (error) {
      console.error('Error saving to history:', error);
    }
  };

  // Load text from localStorage on component mount
  useEffect(() => {
    const savedText = localStorage.getItem('current-reader-text');
    if (savedText) {
      setText(savedText);
    }
    
    // Load target language preference
    const savedLanguage = localStorage.getItem('preferred-target-language');
    if (savedLanguage) {
      setTargetLanguage(savedLanguage);
    }
    
    // Load text history
    loadTextHistory();
  }, []);

  // Listen for target language changes (from Settings sidebar)
  useEffect(() => {
    const handleTargetLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.language) {
        setTargetLanguage(customEvent.detail.language);
      } else {
        // Fallback: check localStorage
        const savedLanguage = localStorage.getItem('preferred-target-language');
        if (savedLanguage) {
          setTargetLanguage(savedLanguage);
        }
      }
    };

    window.addEventListener('targetLanguageChanged', handleTargetLanguageChange);
    return () => window.removeEventListener('targetLanguageChanged', handleTargetLanguageChange);
  }, []);

  // Listen for app language changes (from Settings sidebar)
  useEffect(() => {
    const handleAppLanguageChange = () => {
      // This will trigger re-render when appLanguage prop changes
      // The parent component will pass the updated appLanguage
    };

    window.addEventListener('appLanguageChanged', handleAppLanguageChange);
    return () => window.removeEventListener('appLanguageChanged', handleAppLanguageChange);
  }, []);

  // Save text to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('current-reader-text', text);
  }, [text]);

  // Save target language to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('preferred-target-language', targetLanguage);
  }, [targetLanguage]);

  const handleStartReading = () => {
    if (text.trim()) {
      // Save to history before starting to read
      saveToHistory(text);
      setIsReading(true);
    }
  };

  const handleChangeText = () => {
    setIsReading(false);
    setSelectedWord(null);
    setOriginalSentence(null);
    setIsLoading(false);
    setWordData(null);
  };

  const handleClearText = () => {
    if (confirm(t('clearConfirm', appLanguage))) {
      setText('');
      localStorage.removeItem('current-reader-text');
    }
  };

  // Load text from history
  const handleLoadFromHistory = (historyItem: TextHistory) => {
    setText(historyItem.text);
    setIsReading(false);
    setSelectedWord(null);
    setOriginalSentence(null);
    setWordData(null);
  };

  // Delete history item
  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent loading text when clicking delete
    if (confirm(t('deleteHistoryConfirm', appLanguage))) {
      try {
        const updatedHistory = textHistory.filter(item => item.id !== id);
        localStorage.setItem('reader-text-history', JSON.stringify(updatedHistory));
        setTextHistory(updatedHistory);
      } catch (error) {
        console.error('Error deleting history item:', error);
        alert('Gagal menghapus riwayat. Silakan coba lagi.');
      }
    }
  };

  // Get preview text (first 30 characters)
  const getPreviewText = (fullText: string): string => {
    const preview = fullText.substring(0, 30).trim();
    return preview + (fullText.length > 30 ? '...' : '');
  };

  // Fungsi untuk mendeteksi kalimat utuh dari kata yang diklik
  const getSentenceFromWord = (wordIndex: number, words: string[]): string => {
    // Rebuild teks dari words array untuk mendapatkan posisi yang tepat
    let charIndex = 0;
    let currentWordIndex = 0;
    
    // Cari posisi karakter awal dari kata yang diklik
    for (let i = 0; i < wordIndex; i++) {
      charIndex += words[i].length + 1; // +1 untuk spasi
    }
    
    // Cari awal kalimat (tanda baca kalimat sebelumnya atau awal teks)
    let sentenceStart = 0;
    for (let i = charIndex - 1; i >= 0; i--) {
      if (/[.!?]\s*$/.test(text.substring(Math.max(0, i - 2), i + 1))) {
        sentenceStart = i + 1;
        break;
      }
      if (i === 0) {
        sentenceStart = 0;
        break;
      }
    }
    
    // Cari akhir kalimat (tanda baca kalimat berikutnya atau akhir teks)
    let sentenceEnd = text.length;
    for (let i = charIndex; i < text.length; i++) {
      if (/[.!?]\s*/.test(text.substring(i, Math.min(text.length, i + 3)))) {
        sentenceEnd = i + 1;
        // Skip spasi setelah tanda baca
        while (sentenceEnd < text.length && text[sentenceEnd] === ' ') {
          sentenceEnd++;
        }
        break;
      }
    }
    
    const sentence = text.substring(sentenceStart, sentenceEnd).trim();
    return sentence || words.slice(Math.max(0, wordIndex - 5), Math.min(words.length, wordIndex + 5)).join(' ');
  };

  const handleWordClick = async (word: string, wordIndex: number, words: string[]) => {
    setIsLoading(true);
    setSelectedWord(word);
    setWordData(null);
    
    // Deteksi kalimat utuh
    const sentence = getSentenceFromWord(wordIndex, words);
    setOriginalSentence(sentence);
    
    try {
      // Panggil API untuk mendapatkan data kata
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          word: word,
          sentence: sentence,
          targetLanguage: targetLanguage || 'Indonesian', // Ensure targetLanguage is always sent
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch word data');
      }

      const data = await response.json();
      setWordData(data);
    } catch (error) {
      console.error('Error fetching word data:', error);
      // Set default data jika error
      setWordData({
        definition: t('loadFailed', appLanguage),
        partOfSpeech: 'Unknown',
        grammarNote: 'Bentuk dasar',
        example: t('loadingExample', appLanguage),
        exampleTranslation: '',
        originalSentenceTranslation: '',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedWord(null);
    setOriginalSentence(null);
    setIsLoading(false);
    setWordData(null);
    setIsSaved(false);
    setIsPlayingAudio(false);
    setIsPlayingExampleAudio(false);
    setIsPlayingOriginalAudio(false);
    // Cancel any ongoing speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handleSaveWord = async () => {
    if (!selectedWord || !wordData) return;

    setIsSaving(true);
    
    try {
      // Create word object
      const wordObject = {
        term: selectedWord,
        definition: wordData.definition,
        partOfSpeech: wordData.partOfSpeech,
        grammarNote: wordData.grammarNote,
        example: wordData.example,
        exampleTranslation: wordData.exampleTranslation || '',
        originalSentence: originalSentence || '',
        originalSentenceTranslation: wordData.originalSentenceTranslation || '',
        savedAt: new Date().toISOString(),
        setId: 'uncategorized' // Default to uncategorized folder
      };

      if (user) {
        // User is logged in - save to Supabase
        console.log('Saving to Supabase with user_id:', user.id);
        console.log('Word data:', wordObject);
        
        try {
          await wordBankService.saveWord(user.id, wordObject);
          console.log('Successfully saved to Supabase');
          
          // Dispatch event to refresh word list di halaman utama
          window.dispatchEvent(new CustomEvent('wordSavedToCloud'));
          
          // Show feedback for cloud save
          setIsSaved(true);
          setSaveMessage('✓ Berhasil sinkronisasi dengan Cloud');
          setTimeout(() => {
            setIsSaved(false);
            setSaveMessage('');
          }, 2500);
        } catch (supabaseError: any) {
          console.error('Error dari Supabase:', supabaseError);
          console.error('Supabase error details:', {
            message: supabaseError.message,
            code: supabaseError.code,
            details: supabaseError.details,
            hint: supabaseError.hint
          });
          alert(`Gagal menyimpan ke database: ${supabaseError.message}`);
        }
      } else {
        // User not logged in - show message to login
        alert(appLanguage === 'Bahasa Indonesia' 
          ? 'Anda harus login untuk menyimpan kata ke Word Bank'
          : 'You must be logged in to save words to Word Bank');
        return;
      }
    } catch (error) {
      console.error('Error saving word:', error);
      alert('Gagal menyimpan kata. Silakan coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isReading) {
    // Mode Input
    return (
      <div className="min-h-screen bg-[#F8F9FA] pb-24">
        <div className="max-w-2xl mx-auto p-8">
          {/* Target Language Selector */}
          <div className="mb-4">
            <label htmlFor="targetLanguage" className="block text-sm font-medium text-[#1F2937] mb-2">
              {t('targetLanguage', appLanguage)}
            </label>
            <select
              id="targetLanguage"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm sm:text-base shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200"
            >
              <option value="Indonesian">Indonesian</option>
              <option value="English">English</option>
              <option value="Japanese">Japanese</option>
              <option value="Chinese">Chinese</option>
            </select>
          </div>
          
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full p-4 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] resize-y bg-white text-[#1F2937] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200 focus:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)]"
            placeholder={t('enterText', appLanguage)}
          />
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleStartReading}
              disabled={!text.trim()}
              className="px-6 py-2 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] active:scale-95 font-medium"
            >
              Mulai Membaca
            </button>
            <button
              onClick={handleClearText}
              disabled={!text.trim()}
              className="px-6 py-2 bg-gray-400 text-white rounded-xl hover:bg-gray-500 disabled:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400 transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] active:scale-95 font-medium"
            >
              Bersihkan Teks
            </button>
          </div>

          {/* Riwayat Belajar Section */}
          {textHistory.length > 0 && (
            <div className="mt-8 pt-8 border-t border-gray-200">
              <h2 className="text-xl font-bold text-[#1F2937] mb-4 app-title">{t('learningHistory', appLanguage)}</h2>
              <div className="space-y-2">
                {textHistory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleLoadFromHistory(item)}
                    className="flex items-center justify-between p-3 bg-white border border-[#E5E7EB] rounded-xl hover:bg-[#F8F9FA] hover:border-[#D1D5DB] cursor-pointer transition-all duration-200 group shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1F2937] truncate">
                        {getPreviewText(item.text)}
                      </p>
                      <p className="text-xs text-[#6B7280] mt-1">
                        {new Date(item.savedAt).toLocaleDateString('id-ID', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteHistory(item.id, e)}
                      className="ml-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      aria-label={t('delete', appLanguage)}
                      title={t('delete', appLanguage)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mode Membaca - Split text preserving line breaks
  // First split by newlines to get lines/paragraphs, then split each line by spaces
  const renderClickableText = () => {
    // Split by line breaks to preserve paragraph structure
    const lines = text.split('\n');
    
    return lines.map((line, lineIndex) => {
      if (line.trim() === '') {
        // Empty line = paragraph break
        return <br key={`br-${lineIndex}`} />;
      }
      
      const words = line.split(' ').filter(word => word.length > 0);
      
      return (
        <span key={`line-${lineIndex}`}>
          {words.map((word, wordIndex) => (
            <span
              key={`${lineIndex}-${wordIndex}`}
              onClick={() => handleWordClick(word, wordIndex, words)}
              className="hover:bg-yellow-200 cursor-pointer transition-colors rounded"
            >
              {word}
              {wordIndex < words.length - 1 && ' '}
            </span>
          ))}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] font-serif">
      <div className="max-w-2xl mx-auto p-8">
        <button
          onClick={handleChangeText}
          className="mb-6 px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          {t('changeText', appLanguage)}
        </button>
        <div 
          className="text-lg text-slate-800"
          style={{
            whiteSpace: 'pre-wrap',
            lineHeight: '1.8',
            wordBreak: 'break-word'
          }}
        >
          {renderClickableText()}
        </div>
      </div>

      {/* Modal */}
      {selectedWord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 p-4"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white rounded-xl border border-[#E5E7EB] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] max-w-md w-full transform transition-all duration-300 scale-100 opacity-100 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Fixed at top */}
            <div className="flex items-center justify-between p-6 border-b border-[#E5E7EB] flex-shrink-0">
              <h2 className="text-2xl font-bold text-[#1F2937] app-title">{t('wordDetails', appLanguage)}</h2>
              <button
                onClick={handleCloseModal}
                className="text-[#6B7280] hover:text-[#1F2937] transition-all duration-200 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F8F9FA] active:scale-95"
                aria-label={t('close', appLanguage)}
              >
                ×
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FFB800] mb-3"></div>
                  <p className="text-[#1F2937] text-sm">{t('processingWithAI', appLanguage)}</p>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide mb-1">
                      {t('term', appLanguage)}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-semibold text-[#1F2937]">{selectedWord}</p>
                      {/* Icon Speaker */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedWord) {
                            setIsPlayingAudio(true);
                            playWordAudio(
                              selectedWord,
                              () => setIsPlayingAudio(true),
                              () => setIsPlayingAudio(false)
                            );
                          }
                        }}
                        className={`p-2 rounded-full transition-all duration-200 ${
                          isPlayingAudio 
                            ? 'bg-blue-100 text-blue-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        aria-label={appLanguage === 'Bahasa Indonesia' ? 'Putar audio' : 'Play audio'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* DEFINITION */}
                  <div>
                    <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">DEFINITION</p>
                    <p className="text-sm text-[#1F2937]">{wordData?.definition || t('loadingDefinition', appLanguage)}</p>
                  </div>

                  {/* PART OF SPEECH */}
                  {wordData?.partOfSpeech && (
                    <div>
                      <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">PART OF SPEECH</p>
                      <span className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${
                        wordData.partOfSpeech === 'Noun' ? 'bg-[#E9D5FF] text-purple-800' :
                        wordData.partOfSpeech === 'Verb' ? 'bg-[#D1FAE5] text-green-800' :
                        wordData.partOfSpeech === 'Adverb' ? 'bg-[#DBEAFE] text-blue-800' :
                        wordData.partOfSpeech === 'Adjective' ? 'bg-[#FED7AA] text-orange-800' :
                        'bg-[#FCE7F3] text-pink-700'
                      }`}>
                        {translatePartOfSpeech(wordData.partOfSpeech, appLanguage)}
                      </span>
                    </div>
                  )}

                  {/* GRAMMAR & MORPHOLOGY */}
                  {wordData?.grammarNote && (
                    <div>
                      <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">GRAMMAR & MORPHOLOGY</p>
                      <p className="text-sm text-[#1F2937] italic bg-[#F8F9FA] border-l-4 border-[#FFB800] rounded-r-xl px-3 py-2 shadow-sm">{wordData.grammarNote}</p>
                    </div>
                  )}

                  {/* EXAMPLE SENTENCE */}
                  {wordData?.example && (
                    <div>
                      <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">EXAMPLE SENTENCE</p>
                      <div className="bg-[#F8F9FA] p-3 rounded-xl border border-[#E5E7EB] space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-[#1F2937] italic flex-1">"{wordData.example}"</p>
                          {/* Icon Speaker for Example Sentence */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsPlayingExampleAudio(true);
                              playWordAudio(
                                wordData.example,
                                () => setIsPlayingExampleAudio(true),
                                () => setIsPlayingExampleAudio(false)
                              );
                            }}
                            className={`p-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${
                              isPlayingExampleAudio 
                                ? 'bg-blue-100 text-blue-600' 
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            aria-label={appLanguage === 'Bahasa Indonesia' ? 'Putar audio kalimat contoh' : 'Play example sentence audio'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                          </button>
                        </div>
                        {wordData?.exampleTranslation && (
                          <p className="text-xs text-[#6B7280] italic">"{wordData.exampleTranslation}"</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ORIGINAL SENTENCE */}
                  {originalSentence && (
                    <div className="pt-2">
                      <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">ORIGINAL SENTENCE</p>
                      <div className="bg-[#F8F9FA] p-3 rounded-xl border border-[#E5E7EB] shadow-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-[#1F2937] italic leading-relaxed flex-1">"{originalSentence}"</p>
                          {/* Icon Speaker for Original Sentence */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsPlayingOriginalAudio(true);
                              playWordAudio(
                                originalSentence,
                                () => setIsPlayingOriginalAudio(true),
                                () => setIsPlayingOriginalAudio(false)
                              );
                            }}
                            className={`p-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${
                              isPlayingOriginalAudio 
                                ? 'bg-blue-100 text-blue-600' 
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            aria-label={appLanguage === 'Bahasa Indonesia' ? 'Putar audio kalimat asli' : 'Play original sentence audio'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                          </button>
                        </div>
                        {wordData?.originalSentenceTranslation && (
                          <p className="text-xs text-[#6B7280] italic">"{wordData.originalSentenceTranslation}"</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer - Fixed at bottom */}
            {!isLoading && (
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0 bg-white rounded-b-xl">
                <button
                  onClick={handleSaveWord}
                  disabled={isSaved || isSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] active:scale-95 font-medium ${
                    isSaved
                      ? 'bg-green-500 text-white cursor-not-allowed'
                      : isSaving
                        ? 'bg-gray-400 text-white cursor-wait'
                        : 'bg-[#FFB800] text-white hover:bg-[#E6A600]'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{appLanguage === 'Bahasa Indonesia' ? 'Menyimpan...' : 'Saving...'}</span>
                    </>
                  ) : isSaved ? (
                    <span className="text-sm">{saveMessage}</span>
                  ) : (
                    <>
                      <span>⭐</span>
                      <span>{t('saveToWordList', appLanguage)}</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-200 text-[#1F2937] rounded-xl hover:bg-gray-300 transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] active:scale-95 font-medium"
                >
                  {t('close', appLanguage)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}