'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t, translatePartOfSpeech, normalizeLanguage } from '@/lib/translations';
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
  detectedLanguage?: string;
  learningEssence?: string;
  originalSentence?: string; // Added for context snapshot
}

interface TextHistory {
  id: string;
  text: string;
  savedAt: string;
}

interface Highlight {
  id: string;
  start: number;
  end: number;
  text: string;
  color: string;
  createdAt: string;
  data?: WordData; // Store the full word definition snapshot
}

// Highlighter Colors Palette
const HIGHLIGHT_COLORS = [
  { id: 'yellow', value: '#FEF08A', label: 'Yellow' }, // yellow-200
  { id: 'green', value: '#BBF7D0', label: 'Green' },   // green-200
  { id: 'blue', value: '#BFDBFE', label: 'Blue' },     // blue-200
  { id: 'pink', value: '#FBCFE8', label: 'Pink' },     // pink-200
  { id: 'orange', value: '#FED7AA', label: 'Orange' }, // orange-200
];

interface ReaderCanvasProps {
  appLanguage?: string;
}

export default function ReaderCanvas({ appLanguage = 'Bahasa Indonesia' }: ReaderCanvasProps) {
  const { user } = useAuth();

  const [text, setText] = useState('');
  const [isReading, setIsReading] = useState(false);

  // Selection & UI States
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect; start: number; end: number } | null>(null);
  const [showTopSheet, setShowTopSheet] = useState(false);
  const [selectedPhrase, setSelectedPhrase] = useState<string | null>(null);
  const [contextSentence, setContextSentence] = useState<string | null>(null);

  // Highlight States
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>(HIGHLIGHT_COLORS[0].value);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [wordData, setWordData] = useState<WordData | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [textHistory, setTextHistory] = useState<TextHistory[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<string>('Indonesian');
  const [sourceLanguage, setSourceLanguage] = useState<string>('Auto-Detect'); // New State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isPlayingExampleAudio, setIsPlayingExampleAudio] = useState(false);
  const [isPlayingOriginalAudio, setIsPlayingOriginalAudio] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'analysis' | 'examples' | 'insights'>('analysis');

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
      // Auto-start reading mode if there is saved text
      if (savedText.trim().length > 0) {
        setIsReading(true);
      }
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

  // Save source language preference
  useEffect(() => {
    localStorage.setItem('preferred-source-language', sourceLanguage);
  }, [sourceLanguage]);

  // Load source language on mount
  useEffect(() => {
    const savedSource = localStorage.getItem('preferred-source-language');
    if (savedSource) setSourceLanguage(savedSource);
  }, []);

  // Load highlights from localStorage specific to this text
  useEffect(() => {
    if (!text) return;

    // Create a simple hash of the text to use as key, or just use the first 20 chars if simple
    // Ideally we should use a proper ID, but for now we'll key it by the text content prefix + length to be reasonably unique locally
    const textKey = `highlights-${text.substring(0, 20)}-${text.length}`;
    try {
      const savedHighlights = JSON.parse(localStorage.getItem(textKey) || '[]');
      setHighlights(savedHighlights);
    } catch (e) {
      console.error('Error loading highlights', e);
      setHighlights([]);
    }
  }, [text]);

  // Save highlights whenever they change
  useEffect(() => {
    if (!text) return;
    const textKey = `highlights-${text.substring(0, 20)}-${text.length}`;
    localStorage.setItem(textKey, JSON.stringify(highlights));
  }, [highlights, text]);

  const handleStartReading = () => {
    if (text.trim()) {
      // Save to history before starting to read
      saveToHistory(text);
      setIsReading(true);
    }
  };

  const handleChangeText = () => {
    setIsReading(false);
    setSelection(null);
    setShowTopSheet(false);
    setSelectedPhrase(null);
    setContextSentence(null);
    setActiveHighlightId(null);
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
    setSelection(null);
    setShowTopSheet(false);
    setSelectedPhrase(null);
    setContextSentence(null);
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

  // Handle Text Selection
  const handleTextSelection = () => {
    const windowSelection = window.getSelection();
    if (!windowSelection || windowSelection.isCollapsed || !windowSelection.toString().trim()) {
      return;
    }

    const textContent = windowSelection.toString().trim();
    if (textContent) {
      const range = windowSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Calculate absolute start/end relative to the container text
      // Note: This matches against the *current rendered text content*
      // Since our main text is in a div, we need to be careful.
      // A simple approach for this prototype: use the whole text state and string matching if direct index is hard to get.
      // But getRangeAt gives us offset. 

      // Improve Native Selection Index Finding:
      // We need to find where this selection is relative to our main `text` state.
      // This is tricky because the rendered DOM might contain other elements (breaks).
      // However, our render logic is specific. 
      // Let's try a heuristic: match the selected text in the full text.
      // If there are duplicates, this is ambiguous. 

      // Better approach: Rely on the fact that we render the text mostly as-is.
      // We can try to get the 'global' offset if we can.
      // For now, let's store the text and we'll try to find its index in the `handleExplainSelection` or via simple search.

      setSelection({
        text: textContent,
        rect,
        start: -1, // Placeholder, calculated later or if we can get valid offset
        end: -1
      });
    }
  };

  // Clear selection when clicking elsewhere
  const handleContainerClick = (e: React.MouseEvent) => {
    // If click is not on the tooltip
    const target = e.target as HTMLElement;
    if (!target.closest('#selection-tooltip')) {
      const windowSelection = window.getSelection();
      if (!windowSelection || windowSelection.isCollapsed) {
        setSelection(null);
      }
    }
  };

  const handleExplainSelection = async () => {
    if (!selection) return;

    const phrase = selection.text;
    setIsLoading(true);
    setSelectedPhrase(phrase);
    setShowTopSheet(true);
    setSelection(null); // Clear selection UI after activating
    setWordData(null);
    setActiveHighlightId(null); // Reset ID since this is a new selection

    // Get context (approximate sentence) using the selection
    // Note: This is an approximation. For exact sentence, we'd need more complex DOM traversal
    // or we can pass the whole text and let backend find it, but for now we'll try to find a sentence in the raw text
    // that contains our phrase.

    // Approximate context finding
    const fullText = text;
    // Try to find the exact position of this selection in the text
    // We search for the selected phrase. If multiple exist, we might just take the first one or try to match context.
    // For this prototype, taking the first match or user's provided selection reference is acceptable.
    let index = fullText.indexOf(phrase);

    // If we can improve index finding from DOM selection later, we will. 
    // For now, if there are multiple occurrences, this finds the first one. 
    // Improving this requires traversing the DOM to count characters up to the selection anchor.

    let sentence = phrase;

    if (index !== -1) {
      // Expand to find sentence boundaries with support for CJK punctuation and newlines
      const isSentenceEnd = (char: string) => /[.!?\n。！？]/.test(char);

      let start = index;
      while (start > 0 && !isSentenceEnd(fullText[start - 1])) {
        start--;
      }

      let end = index + phrase.length;
      while (end < fullText.length && !isSentenceEnd(fullText[end])) {
        end++;
      }
      // Include ending punctuation
      if (end < fullText.length) end++;

      // Safety cap for very long sentences
      if (end - start > 500) {
        const padding = 100;
        start = Math.max(0, index - padding);
        end = Math.min(fullText.length, index + phrase.length + padding);
        sentence = (start > 0 ? "..." : "") + fullText.substring(start, end).trim() + (end < fullText.length ? "..." : "");
      } else {
        sentence = fullText.substring(start, end).trim();
      }

      setSelection(prev => prev ? { ...prev, start: index, end: index + phrase.length } : null);
    }

    setContextSentence(sentence);

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          word: phrase, // Sending phrase as "word" to reuse API
          sentence: sentence,
          targetLanguage: targetLanguage || 'Indonesian',
          sourceLanguage: sourceLanguage // Send source language
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const data = await response.json();
      setWordData(data);
    } catch (error) {
      console.error('Error fetching data:', error);
      setWordData({
        definition: t('loadFailed', appLanguage),
        partOfSpeech: 'Phrase',
        grammarNote: 'Frasa / Kalimat',
        example: t('loadingExample', appLanguage),
        exampleTranslation: '',
        originalSentenceTranslation: '',
        detectedLanguage: sourceLanguage === 'Auto-Detect' ? 'Unknown' : sourceLanguage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClosePanel = () => {
    setShowTopSheet(false);
    setSelectedPhrase(null);
    setContextSentence(null);
    setIsLoading(false);
    setWordData(null);
    setIsSaved(false);
    setActiveHighlightId(null);
    setIsPlayingAudio(false);
    setIsPlayingExampleAudio(false);
    setIsPlayingOriginalAudio(false);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveAnalysisTab('analysis'); // Reset tab on close
  };

  const handleSaveWord = async () => {
    // Note: We use 'selection' state or cached values because 'selection' is cleared when TopSheet opens?
    // Actually, we cleared 'selection' in handleExplain. 
    // We need the index information to save the highlight. 
    // Let's re-calculate index from text if we lost it, or store it in a temp state.
    // Ideally, we should have kept the 'index' when opening the top sheet.

    // Let's assume we find the index of 'selectedPhrase' in 'text' again for now.
    // This assumes the first occurrence. 
    // TODO: Improve robust index passing.
    const startIndex = text.indexOf(selectedPhrase || '');
    const endIndex = startIndex + (selectedPhrase?.length || 0);

    if (!selectedPhrase || !wordData) return;

    setIsSaving(true);

    try {
      // 1. Save Highlight Locally
      if (startIndex !== -1) {
        const newHighlight: Highlight = {
          id: Date.now().toString(),
          start: startIndex,
          end: endIndex,
          text: selectedPhrase,
          color: selectedColor,
          createdAt: new Date().toISOString(),
          data: wordData // Save the word data snapshot!
        };

        // Avoid overlapping/duplicate highlights (simple check)
        const isOverlapping = highlights.some(h =>
          (startIndex >= h.start && startIndex < h.end) ||
          (endIndex > h.start && endIndex <= h.end)
        );

        if (!isOverlapping) {
          setHighlights(prev => [...prev, newHighlight]);
        }
      }

      // 2. Save word object to Cloud (Supabase)
      const wordObject = {
        term: selectedPhrase,
        definition: wordData.definition,
        partOfSpeech: wordData.partOfSpeech,
        grammarNote: wordData.grammarNote,
        example: wordData.example,
        exampleTranslation: wordData.exampleTranslation || '',
        originalSentence: contextSentence || '',
        originalSentenceTranslation: wordData.originalSentenceTranslation || '',
        savedAt: new Date().toISOString(),
        setId: 'uncategorized', // Default to uncategorized folder
        sourceLanguage: sourceLanguage === 'Auto-Detect'
          ? normalizeLanguage(wordData.detectedLanguage)
          : normalizeLanguage(sourceLanguage) // Save detected lang
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
          setSaveMessage('✓ Tersimpan');

          // Close panel after short delay if strictly saving new word
          // But maybe user wants to see it. Let's keep it open but updated state.
          // setTimeout(() => handleClosePanel(), 1500); 
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
        // Local only fallback or prompt login
        setIsSaved(true);
        setSaveMessage('✓ Tersimpan (Lokal)');
      }
    } catch (error) {
      console.error('Error saving word:', error);
      alert('Gagal menyimpan kata. Silakan coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHighlight = () => {
    if (!activeHighlightId) return;

    // Remove from local highlights
    setHighlights(prev => prev.filter(h => h.id !== activeHighlightId));

    // Also remove from Supabase? 
    // Ideally yes, but we need the Supabase ID. Our local highlight ID is just timestamp.
    // For now, removing the visual marking locally is the primary goal of this "Delete Marking" button.
    // User can manage the actual Word Bank entry in the Word Bank page.
    // (Or we can try to find and delete it if we stored the Supabase ID).

    handleClosePanel();
  };

  if (!isReading) {
    // Mode Input
    return (
      <div className="min-h-screen bg-[#F8F9FA] pb-24">
        <div className="max-w-2xl mx-auto p-8">
          {/* Target Language Selector */}
          {/* Language Selectors Row */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            {/* Source Language */}
            <div className="flex-1">
              <label htmlFor="sourceLanguage" className="block text-sm font-medium text-[#1F2937] mb-2">
                Input Language (Source)
              </label>
              <select
                id="sourceLanguage"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="w-full px-4 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] shadow-sm"
              >
                <option value="Auto-Detect">✨ Auto-Detect</option>
                <option value="Korean">🇰🇷 Korean</option>
                <option value="Japanese">🇯🇵 Japanese</option>
                <option value="English">🇺🇸 English</option>
                <option value="Chinese">🇨🇳 Chinese</option>
                <option value="Spanish">🇪🇸 Spanish</option>
                <option value="French">🇫🇷 French</option>
                <option value="German">🇩🇪 German</option>
                <option value="Italian">🇮🇹 Italian</option>
                <option value="Russian">🇷🇺 Russian</option>
                <option value="Arabic">🇸🇦 Arabic</option>
                <option value="Portuguese">🇧🇷 Portuguese</option>
                <option value="Vietnamese">🇻🇳 Vietnamese</option>
                <option value="Thai">🇹🇭 Thai</option>
              </select>
            </div>

            {/* Target Language */}
            <div className="flex-1">
              <label htmlFor="targetLanguage" className="block text-sm font-medium text-[#1F2937] mb-2">
                {t('targetLanguage', appLanguage)}
              </label>
              <select
                id="targetLanguage"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full px-4 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] shadow-sm"
              >
                <option value="Indonesian">🇮🇩 Indonesian</option>
                <option value="English">🇺🇸 English</option>
                <option value="Japanese">🇯🇵 Japanese</option>
                <option value="Korean">🇰🇷 Korean</option>
                <option value="Chinese">🇨🇳 Chinese</option>
                <option value="Spanish">🇪🇸 Spanish</option>
                <option value="French">🇫🇷 French</option>
                <option value="German">🇩🇪 German</option>
              </select>
            </div>
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

  // Render Text with Highlights
  // This function reconstructs the text by interleaving raw text chunks and highlight spans
  const renderHighlightedText = () => {
    if (highlights.length === 0) {
      return text;
    }

    // Sort highlights by start position
    const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

    const elements = [];
    let lastIndex = 0;

    sortedHighlights.forEach((h, i) => {
      // Text before highlight
      if (h.start > lastIndex) {
        elements.push(<span key={`text-${i}`}>{text.substring(lastIndex, h.start)}</span>);
      }

      // Highlighted text
      elements.push(
        <mark
          key={`mark-${h.id}`}
          style={{ backgroundColor: h.color, color: 'inherit', padding: '0 2px', borderRadius: '4px' }}
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={(e) => {
            e.stopPropagation(); // Stop standard selection logic
            // Re-open explanation for this saved word
            setSelection({
              text: h.text,
              rect: (e.target as HTMLElement).getBoundingClientRect(),
              start: h.start,
              end: h.end
            });

            setSelectedPhrase(h.text);
            setContextSentence(h.data?.originalSentence || null); // Restore context if available
            setActiveHighlightId(h.id); // Track which highlight is open

            // Instant Load if data exists!
            if (h.data) {
              setWordData(h.data);
              setIsSaved(true); // It's already saved
              setShowTopSheet(true);
            } else {
              // Fallback if old highlight data without snapshot
              handleExplainSelection();
            }
          }}
        >
          {text.substring(h.start, h.end)}
        </mark>
      );

      lastIndex = h.end;
    });

    // Remaining text
    if (lastIndex < text.length) {
      elements.push(<span key={`text-end`}>{text.substring(lastIndex)}</span>);
    }

    return elements;
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] font-serif transition-colors duration-300">

      {/* Tooltip / Floating Menu for Selection */}
      {selection && !showTopSheet && (
        <div
          id="selection-tooltip"
          className="fixed z-[60] bg-[#1F2937] text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 cursor-pointer hover:bg-black transition-all transform -translate-x-1/2 hover:scale-105 active:scale-95"
          style={{
            top: `${selection.rect.top - 50}px`,
            left: `${selection.rect.left + selection.rect.width / 2}px`,
          }}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent clearing selection
            e.stopPropagation();
            handleExplainSelection();
          }}
        >
          <span className="text-sm font-medium">✨ Jelaskan</span>
          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>

          {/* Arrow pointing down */}
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[#1F2937]"></div>
        </div>
      )}

      {/* Top Sheet Panel - Sliding from Top */}
      <div
        className={`fixed top-0 left-0 right-0 z-[100] bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] transform transition-transform duration-300 ease-in-out ${showTopSheet ? 'translate-y-0' : '-translate-y-full'
          } max-h-[85vh] overflow-y-auto rounded-b-3xl border-b border-gray-100`}
      >
        <div className="max-w-3xl mx-auto">
          {/* Drag Handle (Visual indicator) */}
          <div className="w-16 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 mb-2"></div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <span className="bg-[#FFF8E1] p-2 rounded-lg text-2xl">💡</span>
              <div>
                <h2 className="text-xl font-bold text-[#1F2937] app-title">Analysis Result</h2>
                <p className="text-xs text-gray-500">AI-powered explanation</p>
              </div>
            </div>
            <button
              onClick={handleClosePanel}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <span className="sr-only">{t('close', appLanguage)}</span>
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 sm:p-8 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FFB800] mb-4"></div>
                <p className="text-gray-500 animate-pulse">{t('processingWithAI', appLanguage)}</p>
              </div>
            ) : (
              <>
                {/* Selected Term Header */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-3xl font-bold text-[#1F2937] mb-1">{selectedPhrase}</h3>
                      {wordData?.partOfSpeech && (
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase ${wordData.partOfSpeech === 'Noun' ? 'bg-[#E9D5FF] text-purple-800' :
                            wordData.partOfSpeech === 'Verb' ? 'bg-[#D1FAE5] text-green-800' :
                              wordData.partOfSpeech === 'Adverb' ? 'bg-[#DBEAFE] text-blue-800' :
                                wordData.partOfSpeech === 'Adjective' ? 'bg-[#FED7AA] text-orange-800' :
                                  'bg-gray-100 text-gray-700'
                            }`}>
                            {translatePartOfSpeech(wordData.partOfSpeech, appLanguage)}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        if (selectedPhrase) {
                          setIsPlayingAudio(true);
                          playWordAudio(
                            selectedPhrase,
                            () => setIsPlayingAudio(true),
                            () => setIsPlayingAudio(false)
                          );
                        }
                      }}
                      className={`p-3 rounded-xl transition-all ${isPlayingAudio
                        ? 'bg-[#FFB800] text-white shadow-lg scale-110'
                        : 'bg-gray-100 text-gray-600 hover:bg-[#FFB800] hover:text-white'
                        }`}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </button>
                  </div>

                  {/* Color Picker for Highlighting */}
                  <div className="flex items-center gap-3 py-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Marking Color:</span>
                    <div className="flex gap-2">
                      {HIGHLIGHT_COLORS.map((color) => (
                        <button
                          key={color.id}
                          onClick={() => setSelectedColor(color.value)}
                          className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ${selectedColor === color.value
                            ? 'border-gray-500 scale-110 shadow-md'
                            : 'border-transparent hover:scale-110'
                            }`}
                          style={{ backgroundColor: color.value }}
                          title={color.label}
                          aria-label={`Select ${color.label} highlight`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                  <button
                    onClick={() => setActiveAnalysisTab('analysis')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeAnalysisTab === 'analysis'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Analysis</span>
                  </button>
                  <button
                    onClick={() => setActiveAnalysisTab('examples')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeAnalysisTab === 'examples'
                      ? 'bg-white text-green-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <span>Examples</span>
                  </button>
                  <button
                    onClick={() => setActiveAnalysisTab('insights')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeAnalysisTab === 'insights'
                      ? 'bg-white text-purple-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Insights</span>
                  </button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[250px]">
                  {activeAnalysisTab === 'analysis' && (
                    <div className="space-y-6">
                      {/* DEFINITION Card */}
                      <div className="bg-[#FFFDF5] p-6 rounded-2xl border border-[#FFE082]">
                        <p className="text-xs font-bold text-[#F59E0B] uppercase tracking-wider mb-2">
                          {t('definition', appLanguage) || 'DEFINITION'}
                        </p>
                        <p className="text-lg text-[#374151] leading-relaxed">
                          {wordData?.definition || t('loadingDefinition', appLanguage)}
                        </p>
                      </div>

                      {/* GRAMMAR Note */}
                      {wordData?.grammarNote && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Grammar Breakdown</p>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{wordData.grammarNote}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAnalysisTab === 'examples' && (
                    <div className="space-y-6">
                      {/* Example Sentence Card */}
                      {wordData?.example && (
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 bg-green-50 rounded-lg text-green-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                              </span>
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Learning Example</p>
                            </div>
                            <button
                              onClick={() => {
                                setIsPlayingExampleAudio(true);
                                playWordAudio(wordData.example, () => setIsPlayingExampleAudio(true), () => setIsPlayingExampleAudio(false));
                              }}
                              className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full text-gray-600 hover:bg-[#FFB800] hover:text-white transition-all shadow-sm active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                            </button>
                          </div>
                          <p className="text-xl text-[#1F2937] font-serif leading-relaxed mb-4">"{wordData.example}"</p>
                          {wordData?.exampleTranslation && (
                            <div className="pt-4 border-t border-gray-50">
                              <p className="text-gray-500 italic text-base">"{wordData.exampleTranslation}"</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Original context recap if available */}
                      {contextSentence && (
                        <div className="bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-200">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Source Context</p>
                          <p className="text-sm text-gray-600 italic">"{contextSentence}"</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAnalysisTab === 'insights' && (
                    <div className="space-y-6">
                      {/* Learning Essence Card */}
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-6 rounded-2xl border border-purple-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="p-1.5 bg-white rounded-lg text-purple-600 shadow-sm border border-purple-100">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </span>
                          <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Learning Essence & Nuance</p>
                        </div>
                        {wordData?.learningEssence ? (
                          <p className="text-gray-700 leading-relaxed whitespace-pre-line">{wordData.learningEssence}</p>
                        ) : (
                          <div className="py-8 text-center bg-white/50 rounded-xl border border-purple-50">
                            <p className="text-sm text-purple-400 italic">Deep insights being processed...</p>
                          </div>
                        )}
                      </div>

                      {/* Tip Box */}
                      <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                        <span className="text-xl">💡</span>
                        <div>
                          <p className="text-xs font-bold text-amber-800 uppercase tracking-tighter mb-1">Quick Tip</p>
                          <p className="text-xs text-amber-900/70 leading-normal">
                            Try thinking about the cultural context mentioned above when you see this word again in your flashcards.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
          {!isLoading && (
            <div className="p-6 bg-gray-50 rounded-b-3xl border-t border-gray-100 flex justify-between gap-3 sticky bottom-0 z-20" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
              {isSaved && activeHighlightId ? (
                <>
                  <button
                    onClick={handleDeleteHighlight}
                    className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Hapus</span>
                  </button>
                  <button
                    onClick={handleClosePanel}
                    className="px-6 py-2.5 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-all flex-1 shadow-lg"
                  >
                    Tutup
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleClosePanel}
                    className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-white hover:border-gray-300 transition-all"
                  >
                    {t('close', appLanguage)}
                  </button>
                  <button
                    onClick={handleSaveWord}
                    disabled={isSaved || isSaving}
                    className={`px-6 py-2.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center gap-2 ${isSaved ? 'bg-green-500' : 'bg-[#FFB800] hover:bg-[#E6A600]'
                      }`}
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                        Saving...
                      </span>
                    ) : isSaved ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Saved!
                      </span>
                    ) : (
                      <>
                        <span>⭐</span>
                        <span>{t('saveToWordList', appLanguage)}</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Overlay for Top Sheet */}
      {showTopSheet && (
        <div
          className="fixed inset-0 bg-black/30 z-[90] backdrop-blur-[1px] transition-opacity duration-300"
          onClick={handleClosePanel}
        ></div>
      )}

      {/* Main Text Content */}
      <div className="max-w-2xl mx-auto p-8 relative z-10">
        <button
          onClick={handleChangeText}
          className="mb-8 flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </div>
          <span className="text-sm font-medium">{t('changeText', appLanguage)}</span>
        </button>

        <div
          onMouseUp={handleTextSelection}
          onTouchEnd={handleTextSelection}
          onClick={handleContainerClick}
          className="prose prose-lg prose-slate max-w-none"
        >
          <div
            className="text-lg sm:text-xl text-[#374151] leading-loose whitespace-pre-wrap font-serif selection:bg-gray-300 selection:text-black"
            style={{
              lineHeight: '2',
              wordBreak: 'break-word'
            }}
          >
            {renderHighlightedText()}
          </div>
        </div>

        {/* Helper Hint */}
        <div className="mt-12 text-center text-gray-400 text-sm italic">
          <p>💡 {appLanguage === 'Bahasa Indonesia' ? 'Sorot teks/kata untuk menerjemahkan' : 'Highlight text/word to translate'}</p>
        </div>
      </div>
    </div>
  );
}