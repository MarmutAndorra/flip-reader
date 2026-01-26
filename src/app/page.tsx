'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReaderCanvas from '@/components/ReaderCanvas';
import BottomNavigationBar from '@/components/BottomNavigationBar';
import SwipeCard from '@/components/SwipeCard';
// Migration system disabled - all data goes to Supabase only
// import MigrationModal from '@/components/MigrationModal';
import { motion, AnimatePresence } from 'framer-motion';
import { t, translatePartOfSpeech, normalizeLanguage } from '@/lib/translations';
import { playWordAudio } from '@/lib/audioUtils';
import { exportToCSV, downloadCSV, importFromCSVWithMapping, getCSVHeaders, FieldMapping, stripHTML } from '@/lib/csvUtils';
import { useAuth } from '@/contexts/AuthContext';
import * as wordBankService from '@/lib/wordBankService';

interface WordItem {
  term: string;
  definition: string;
  sourceLanguage?: string; // New: Language of the term (e.g. 'Korean', 'English')
  partOfSpeech: string;
  grammarNote?: string;
  example?: string;
  exampleTranslation?: string;
  originalSentence?: string;
  originalSentenceTranslation?: string;
  savedAt: string;
  setId?: string;
  isFavorite?: boolean;
  memorizationStatus?: 'known' | 'unknown' | 'well-known' | 'mastered' | 'learning' | null;
  interval?: number; // Level hafalan: 0, 1, 2, 3 (0 = baru, 1 = 1 hari, 2 = 3 hari, 3 = 7 hari)
  nextReview?: string; // Format: YYYY-MM-DD, undefined jika belum pernah di-review
}

interface VocabSet {
  id: string;
  name: string;
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  // Hydration-safe mounting state
  const [isMounted, setIsMounted] = useState(false);

  // Loading states
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Migration system disabled - Supabase is the only data source
  // const [showMigrationModal, setShowMigrationModal] = useState(false);
  // const hasMigrationBeenChecked = useRef(false);

  // Tab management
  const [activeTab, setActiveTab] = useState<'home' | 'reader' | 'wordBank'>('home');

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appLanguage, setAppLanguage] = useState<string>('Bahasa Indonesia');
  const [targetLanguage, setTargetLanguage] = useState<string>('Indonesian');

  // Word Bank
  const [words, setWords] = useState<WordItem[]>([]);
  const [vocabSets, setVocabSets] = useState<VocabSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [memorizationFilter, setMemorizationFilter] = useState<'all' | 'not-mastered' | 'mastered' | 'due-review'>('all');
  const [wordBankLanguageFilter, setWordBankLanguageFilter] = useState<string>('all'); // New filter state
  const [sortBy, setSortBy] = useState<'newest' | 'alphabetical' | 'status'>('newest');

  // Selection mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [moveNotification, setMoveNotification] = useState<string | null>(null);

  // Flashcard Mode
  const [isSwipeMode, setIsSwipeMode] = useState(false);
  const [swipeWords, setSwipeWords] = useState<WordItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sudahHafal, setSudahHafal] = useState<string[]>([]); // Array of word IDs (term)
  const [perluDiulang, setPerluDiulang] = useState<string[]>([]); // Array of word IDs (term)
  const [starredWords, setStarredWords] = useState<WordItem[]>([]);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [dailyStatsVersion, setDailyStatsVersion] = useState(0); // Untuk memicu re-render grafik
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null); // Track which word is playing audio

  // Hydration-safe states for client-only data
  const [last7DaysData, setLast7DaysData] = useState<{ date: string; count: number }[]>([]);
  const [wordOfTheDay, setWordOfTheDay] = useState<WordItem | null>(null);
  const [formattedDate, setFormattedDate] = useState<string>('');
  const [dueReviewCount, setDueReviewCount] = useState<number>(0);

  // Scroll visibility
  const [isSettingsVisible, setIsSettingsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // File input ref for CSV import
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Ref to hold latest loadDailyStats to avoid circular dependency in saveDailyActivity
  const loadDailyStatsRef = useRef<(() => Promise<void>) | null>(null);

  // CSV Import Modal State
  const [isCSVMappingModalOpen, setIsCSVMappingModalOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [fieldMapping, setFieldMapping] = useState<{
    term: string;
    definition: string;
    partOfSpeech?: string;
    grammarNote?: string;
    example?: string;
    exampleTranslation?: string;
    originalSentence?: string;
    originalSentenceTranslation?: string;
    folder?: string;
    dateAdded?: string;
    statusHafal?: string;
  }>({
    term: '',
    definition: '',
  });
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');
  const [stripHtml, setStripHtml] = useState(true);

  // Load data from Supabase - each operation has its own try-catch
  // so if one fails, the others can still work
  // NOTE: Migration check is handled separately in useEffect (runs only once)
  const loadDataFromSupabase = useCallback(async () => {
    if (!user) return;

    setIsDataLoading(true);

    // 1. Load words (independent operation)
    try {
      const fetchedWords = await wordBankService.fetchWords(user.id);
      setWords(fetchedWords);
    } catch {
      // Silent fail - words will stay as empty array
      setWords([]);
    }

    // 2. Load vocab sets (independent operation)
    try {
      console.log('[loadDataFromSupabase] Fetching vocab sets for user:', user.id);
      const fetchedSets = await wordBankService.fetchVocabSets(user.id);
      console.log('[loadDataFromSupabase] Fetched sets:', fetchedSets);

      if (fetchedSets.length === 0) {
        // Create default set if none exists
        console.log('[loadDataFromSupabase] No sets found, creating default...');
        const defaultSet: VocabSet = { id: 'uncategorized', name: 'Tidak Terkategori' };
        await wordBankService.createVocabSet(user.id, defaultSet.id, defaultSet.name);
        setVocabSets([defaultSet]);
      } else {
        setVocabSets(fetchedSets);
      }
    } catch (err) {
      console.error('[loadDataFromSupabase] Vocab sets load failed:', err);
      // If none loaded, preserve current or at least set default locally
      if (vocabSets.length === 0) {
        const defaultSet: VocabSet = { id: 'uncategorized', name: 'Tidak Terkategori' };
        setVocabSets([defaultSet]);
      }
    }

    // 3. Load user settings (independent operation)
    try {
      const settings = await wordBankService.getUserSettings(user.id);
      if (settings) {
        setAppLanguage(settings.appLanguage);
        setTargetLanguage(settings.targetLanguage);
      }
      // If no settings, keep using localStorage values (already loaded in useEffect)
    } catch {
      // Silent fail - keep using localStorage values
    }

    setIsDataLoading(false);
  }, [user]);

  // Load last 7 days stats from Supabase - SUPABASE ONLY
  // Format tanggal: YYYY-MM-DD (menggunakan toISOString sama seperti incrementDailyStats)
  const loadDailyStats = useCallback(async () => {
    // Helper to generate default empty data
    const getDefaultData = () => {
      const today = new Date();
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - (6 - i));
        return {
          date: date.toLocaleDateString('id-ID', { weekday: 'short' }),
          count: 0
        };
      });
    };

    if (!user) {
      setLast7DaysData(getDefaultData());
      return;
    }

    try {
      console.log('[loadDailyStats] Fetching from Supabase for user:', user.id);
      const dailyStats = await wordBankService.getDailyStats(user.id);
      console.log('[loadDailyStats] Got stats:', dailyStats);

      const today = new Date();
      const data = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - (6 - i));
        // Format YYYY-MM-DD menggunakan toISOString (sama seperti incrementDailyStats)
        const dateKey = date.toISOString().split('T')[0];
        const count = dailyStats[dateKey] || 0;
        console.log(`[loadDailyStats] ${dateKey}: ${count}`);
        return {
          date: date.toLocaleDateString('id-ID', { weekday: 'short' }),
          count: count
        };
      });

      console.log('[loadDailyStats] Setting data:', data);
      setLast7DaysData(data);
    } catch (err) {
      console.error('[loadDailyStats] Error:', err);
      setLast7DaysData(getDefaultData());
    }
  }, [user]);

  // Update ref whenever loadDailyStats changes
  loadDailyStatsRef.current = loadDailyStats;

  // Initialize on mount - CLEANUP localStorage and load only language preferences
  useEffect(() => {
    // ONE-TIME CLEANUP: Remove all word/vocab data from localStorage
    // This ensures no more migration popups and forces Supabase as single source of truth
    localStorage.removeItem('my-word-bank');
    localStorage.removeItem('word_bank');      // Key dengan underscore
    localStorage.removeItem('word-bank');      // Key dengan hyphen
    localStorage.removeItem('wordBank');       // Key camelCase
    localStorage.removeItem('vocab-sets');
    localStorage.removeItem('vocabSets');
    localStorage.removeItem('daily-stats');
    localStorage.removeItem('dailyStats');

    // Load UI preferences from localStorage (only language settings stay local)
    const savedAppLanguage = localStorage.getItem('app-language');
    if (savedAppLanguage) {
      setAppLanguage(savedAppLanguage);
    }

    const savedTargetLanguage = localStorage.getItem('preferred-target-language');
    if (savedTargetLanguage) {
      setTargetLanguage(savedTargetLanguage);
    }

    // Mark as mounted for hydration-safe rendering
    setIsMounted(true);
  }, []);

  // Load data when user is authenticated - SUPABASE ONLY
  useEffect(() => {
    if (!authLoading && user) {
      loadDataFromSupabase();
      loadDailyStats(); // Also load daily stats for dashboard
    } else if (!authLoading && !user) {
      // Not logged in - show empty state (no localStorage fallback)
      setIsDataLoading(false);
      setWords([]);
      const defaultSet: VocabSet = { id: 'uncategorized', name: 'Tidak Terkategori' };
      setVocabSets([defaultSet]);
    }
  }, [user, authLoading, loadDataFromSupabase, loadDailyStats]);

  // Migration system DISABLED - Supabase is the only data source
  // All word/vocab data is now stored only in Supabase

  // Listen for word saved event to refresh data
  useEffect(() => {
    const handleWordSaved = () => {
      console.log('Word saved event received, refreshing data...');
      if (user) {
        loadDataFromSupabase();
      }
    };

    window.addEventListener('wordSavedToCloud', handleWordSaved);
    return () => {
      window.removeEventListener('wordSavedToCloud', handleWordSaved);
    };
  }, [user, loadDataFromSupabase]);

  // Initialize client-only data after mounting (to avoid hydration mismatch)
  useEffect(() => {
    if (!isMounted) return;

    // Format date
    const today = new Date();
    const koreanDate = today.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    const indonesianDate = today.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    setFormattedDate(`${indonesianDate} | ${koreanDate}`);

    // Load daily stats - SUPABASE ONLY
    // If user is logged in, loadDailyStats will fetch from Supabase
    // If not logged in, loadDailyStats will set default empty data
    loadDailyStats();
  }, [isMounted, loadDailyStats]);

  // Update word of the day when words change (client-side only)
  useEffect(() => {
    if (!isMounted) return;

    if (words.length === 0) {
      setWordOfTheDay({
        term: '공부하다',
        definition: 'Belajar',
        partOfSpeech: 'Verb',
        example: '',
        savedAt: new Date().toISOString(),
      });
    } else {
      const today = new Date();
      const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
      const index = dayOfYear % words.length;
      setWordOfTheDay(words[index]);
    }
  }, [isMounted, words]);

  // Update due review count (client-side only)
  useEffect(() => {
    if (!isMounted) return;

    const today = new Date().toISOString().split('T')[0];
    const count = words.filter((word) => {
      if (!word.nextReview) return true;
      return word.nextReview <= today;
    }).length;
    setDueReviewCount(count);
  }, [isMounted, words]);

  // Save app language
  useEffect(() => {
    localStorage.setItem('app-language', appLanguage);
    window.dispatchEvent(new CustomEvent('appLanguageChanged', {
      detail: { language: appLanguage }
    }));

    // Also save to Supabase if logged in
    if (user && isMounted) {
      wordBankService.saveUserSettings(user.id, { appLanguage }).catch(console.error);
    }
  }, [appLanguage, user, isMounted]);

  // Save target language to localStorage and Supabase
  useEffect(() => {
    localStorage.setItem('preferred-target-language', targetLanguage);

    // Dispatch event for other components (e.g., ReaderCanvas)
    window.dispatchEvent(new CustomEvent('targetLanguageChanged', {
      detail: { language: targetLanguage }
    }));

    // Also save to Supabase if logged in
    if (user && isMounted) {
      wordBankService.saveUserSettings(user.id, { targetLanguage }).catch(console.error);
    }
  }, [targetLanguage, user, isMounted]);

  // Handle scroll for settings icon
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < lastScrollY || currentScrollY < 10) {
        setIsSettingsVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsSettingsVisible(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Load/refresh words when tab changes - SUPABASE ONLY
  useEffect(() => {
    if (activeTab === 'wordBank' || activeTab === 'home') {
      if (user) {
        loadDataFromSupabase();
      }
      // If not logged in, data stays empty (no localStorage fallback)
    }
  }, [activeTab, user, loadDataFromSupabase]);

  // Initialize swipe words when entering swipe mode - HANYA saat isSwipeMode berubah dari false ke true
  useEffect(() => {
    if (isSwipeMode && words.length > 0) {
      let wordsToSwipe = [...words];

      // Filter by favorites if enabled
      if (onlyFavorites) {
        wordsToSwipe = wordsToSwipe.filter(w => w.isFavorite);
      }

      // Filter by selected folder if any
      if (selectedSetId) {
        wordsToSwipe = wordsToSwipe.filter(w => w.setId === selectedSetId);
      }

      // Filter kata yang waktunya ditinjau (nextReview <= hari ini atau null)
      const today = new Date().toISOString().split('T')[0];
      const dueWords = wordsToSwipe.filter((word) => {
        if (!word.nextReview) return true; // Kata baru tanpa nextReview
        return word.nextReview <= today;
      });

      // Jika ada kata yang due, prioritaskan mereka. Jika tidak, gunakan semua kata
      const wordsToUse = dueWords.length > 0 ? dueWords : wordsToSwipe;

      // Shuffle array
      const shuffled = wordsToUse.sort(() => Math.random() - 0.5);
      setSwipeWords(shuffled);
      setCurrentIndex(0);
      setSudahHafal([]);
      setPerluDiulang([]);
      setStarredWords([]);
      setIsSessionComplete(false);
    } else if (!isSwipeMode) {
      // Reset all states when exiting swipe mode
      setCurrentIndex(0);
      setSudahHafal([]);
      setPerluDiulang([]);
      setStarredWords([]);
      setIsSessionComplete(false);
    }
    // Hanya pantau isSwipeMode untuk menghindari reset di tengah sesi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSwipeMode]);

  // Fungsi untuk menyimpan aktivitas harian - SUPABASE ONLY
  const saveDailyActivity = useCallback(async (count: number) => {
    if (!user) {
      console.log('[saveDailyActivity] No user, skipping');
      return;
    }

    console.log('[saveDailyActivity] Called with count:', count, 'for user:', user.id);

    try {
      // Save to Supabase ONLY
      const success = await wordBankService.incrementDailyStats(user.id, count);
      console.log('[saveDailyActivity] incrementDailyStats result:', success);

      if (success && loadDailyStatsRef.current) {
        // Reload daily stats to reflect the update immediately
        console.log('[saveDailyActivity] Reloading daily stats...');
        await loadDailyStatsRef.current();
      }
    } catch (err) {
      console.error('[saveDailyActivity] Error:', err);
    }
  }, [user]);

  // Fungsi untuk menghitung nextReview berdasarkan level
  const calculateNextReview = (currentInterval: number = 0, direction: 'right' | 'left'): { interval: number; nextReview: string } => {
    if (direction === 'left') {
      // Reset ke level 0, muncul lagi besok
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        interval: 0,
        nextReview: tomorrow.toISOString().split('T')[0]
      };
    } else {
      // Swipe kanan: naik level
      const newInterval = Math.min(currentInterval + 1, 3); // Max level 3
      let daysToAdd = 1;

      if (newInterval === 1) daysToAdd = 1;   // Level 1: 1 hari
      else if (newInterval === 2) daysToAdd = 3;  // Level 2: 3 hari
      else if (newInterval === 3) daysToAdd = 7;  // Level 3: 7 hari

      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + daysToAdd);

      return {
        interval: newInterval,
        nextReview: nextDate.toISOString().split('T')[0]
      };
    }
  };

  // Handler untuk navigasi kartu berikutnya
  const handleNextCard = (direction: 'right' | 'left') => {
    // Safety check: pastikan masih ada kartu yang bisa di-swipe
    if (currentIndex >= swipeWords.length || isSessionComplete) {
      return;
    }

    const currentWord = swipeWords[currentIndex];
    const wordId = currentWord.term;
    const currentInterval = currentWord.interval || 0;

    // Hitung interval dan nextReview baru
    const { interval: newInterval, nextReview: newNextReview } = calculateNextReview(currentInterval, direction);

    // Update memorization status dan scheduling
    const updatedWord = {
      ...currentWord,
      memorizationStatus: direction === 'right' ? 'known' as const : 'unknown' as const,
      interval: newInterval,
      nextReview: newNextReview
    };
    updateWordInStorage(updatedWord);

    // Masukkan ID ke array yang sesuai
    if (direction === 'right') {
      setSudahHafal(prev => [...prev, wordId]);
    } else {
      setPerluDiulang(prev => [...prev, wordId]);
    }

    // TIDAK panggil saveDailyActivity di sini - akan dipanggil saat sesi selesai

    // Update currentIndex - INCREMENT MANUAL
    const newIndex = currentIndex + 1;
    setCurrentIndex(prev => prev + 1);

    // Periksa jika sesi sudah selesai: newIndex sudah sama dengan swipeWords.length
    if (newIndex === swipeWords.length) {
      setIsSessionComplete(true);
    }
  };

  // Fungsi untuk highlight teks yang cocok dengan query
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-[#1F2937] px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Filter dan sort words
  const filteredWords = useMemo(() => {
    let filtered = words;

    // Filter berdasarkan folder
    if (selectedSetId) {
      filtered = filtered.filter((word) => word.setId === selectedSetId);
    }

    // Pencarian multi-bahasa: term, definition, grammarNote
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (word) =>
          word.term.toLowerCase().includes(query) ||
          word.definition.toLowerCase().includes(query) ||
          (word.grammarNote && word.grammarNote.toLowerCase().includes(query))
      );
    }

    // Filter berdasarkan status hafalan
    if (memorizationFilter === 'mastered') {
      filtered = filtered.filter((word) =>
        word.memorizationStatus === 'mastered' || word.memorizationStatus === 'well-known'
      );
    } else if (memorizationFilter === 'not-mastered') {
      filtered = filtered.filter((word) =>
        !word.memorizationStatus ||
        word.memorizationStatus === 'unknown' ||
        word.memorizationStatus === 'learning' ||
        word.memorizationStatus === 'known'
      );
    } else if (memorizationFilter === 'due-review') {
      // Filter "Waktunya Tinjau": kata yang nextReview <= hari ini
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter((word) => {
        if (!word.nextReview) return true; // Kata baru tanpa nextReview
        return word.nextReview <= today;
      });
    }

    // Filter berdasarkan Bahasa Sumber (Polyglot)
    if (wordBankLanguageFilter !== 'all') {
      filtered = filtered.filter((word) =>
        normalizeLanguage(word.sourceLanguage) === wordBankLanguageFilter
      );
    }

    // Sorting
    if (sortBy === 'newest') {
      filtered = [...filtered].sort((a, b) =>
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      );
    } else if (sortBy === 'alphabetical') {
      filtered = [...filtered].sort((a, b) => a.term.localeCompare(b.term));
    } else if (sortBy === 'status') {
      // Kelompokkan yang "Belum Hafal" di bagian atas
      filtered = [...filtered].sort((a, b) => {
        const aIsMastered = a.memorizationStatus === 'mastered' || a.memorizationStatus === 'well-known';
        const bIsMastered = b.memorizationStatus === 'mastered' || b.memorizationStatus === 'well-known';

        if (aIsMastered && !bIsMastered) return 1;
        if (!aIsMastered && bIsMastered) return -1;
        return 0;
      });
    }

    return filtered;
  }, [words, selectedSetId, searchQuery, memorizationFilter, wordBankLanguageFilter, sortBy]);

  // Toggle expand/collapse
  const toggleExpand = (term: string) => {
    setExpandedId(expandedId === term ? null : term);
  };

  // Selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedWords(new Set());
  };

  const toggleWordSelection = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedWords);
    if (newSelected.has(term)) {
      newSelected.delete(term);
    } else {
      newSelected.add(term);
    }
    setSelectedWords(newSelected);
  };

  // Move selected words to set
  const handleMoveToSet = async (setId: string) => {
    // Special case: open modal to create new folder
    if (setId === '__create_new__') {
      setIsCreateFolderModalOpen(true);
      return;
    }

    if (!user) return; // Must be logged in

    setIsSaving(true);
    try {
      const movedCount = selectedWords.size;
      const folderName = vocabSets.find(s => s.id === setId)?.name || setId;
      const termsToMove = Array.from(selectedWords);

      // Move in Supabase ONLY
      await wordBankService.moveWordsToSet(user.id, termsToMove, setId);

      // Update local state
      const updatedWords = words.map((word) =>
        selectedWords.has(word.term) ? { ...word, setId } : word
      );
      setWords(updatedWords);
      setSelectedWords(new Set());
      setIsSelectionMode(false);

      // Show success notification
      const message = appLanguage === 'Bahasa Indonesia'
        ? `Berhasil memindahkan ${movedCount} kata ke folder "${folderName}"`
        : `Successfully moved ${movedCount} words to folder "${folderName}"`;
      setMoveNotification(message);
      setTimeout(() => setMoveNotification(null), 3000);
    } catch (error) {
      console.error('Error moving words to set:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Create new folder and move selected words to it
  const handleCreateFolderAndMove = async () => {
    const trimmedName = newFolderName.trim();

    if (!trimmedName) {
      alert(t('folderNameRequired', appLanguage));
      return;
    }

    // Check if folder name already exists
    if (vocabSets.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert(t('folderExists', appLanguage));
      return;
    }

    if (!user) return; // Must be logged in

    setIsSaving(true);
    try {
      // Create new folder
      const newFolderId = `folder-${Date.now()}`;
      const newFolder: VocabSet = { id: newFolderId, name: trimmedName };

      // Create in Supabase ONLY
      await wordBankService.createVocabSet(user.id, newFolderId, trimmedName);
      // Move words in Supabase
      const termsToMove = Array.from(selectedWords);
      await wordBankService.moveWordsToSet(user.id, termsToMove, newFolderId);

      // Update local state
      const updatedSets = [...vocabSets, newFolder];
      setVocabSets(updatedSets);
      const movedCount = selectedWords.size;
      const updatedWords = words.map((word) =>
        selectedWords.has(word.term) ? { ...word, setId: newFolderId } : word
      );
      setWords(updatedWords);

      // Reset states
      setSelectedWords(new Set());
      setIsSelectionMode(false);
      setIsCreateFolderModalOpen(false);
      setNewFolderName('');

      // Show success notification
      const message = appLanguage === 'Bahasa Indonesia'
        ? `Berhasil memindahkan ${movedCount} kata ke folder "${trimmedName}"`
        : `Successfully moved ${movedCount} words to folder "${trimmedName}"`;
      setMoveNotification(message);
      setTimeout(() => setMoveNotification(null), 3000);
    } catch (error) {
      console.error('Error creating folder and moving words:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete word
  const handleDeleteWord = async (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return; // Must be logged in

    if (confirm(`Apakah Anda yakin ingin menghapus "${term}"?`)) {
      setIsSaving(true);
      try {
        // Delete from Supabase ONLY
        await wordBankService.deleteWord(user.id, term);

        const updatedWords = words.filter((word) => word.term !== term);
        setWords(updatedWords);
        if (expandedId === term) {
          setExpandedId(null);
        }
      } catch (error) {
        console.error('Error deleting word:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Delete selected words - SUPABASE ONLY
  const handleDeleteSelected = async () => {
    if (!user || selectedWords.size === 0) return;

    if (confirm(`Apakah Anda yakin ingin menghapus ${selectedWords.size} kata?`)) {
      setIsSaving(true);
      try {
        const termsToDelete = Array.from(selectedWords);

        // Delete from Supabase ONLY
        await wordBankService.deleteWords(user.id, termsToDelete);

        const updatedWords = words.filter((word) => !selectedWords.has(word.term));
        setWords(updatedWords);
        setSelectedWords(new Set());
        setIsSelectionMode(false);
      } catch (error) {
        console.error('Error deleting words:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Update word in storage (for swipe mode) - SUPABASE ONLY
  const updateWordInStorage = async (updatedWord: WordItem) => {
    if (!user) return; // Must be logged in

    try {
      // Save to Supabase ONLY
      await wordBankService.updateWord(user.id, updatedWord.term, {
        memorizationStatus: updatedWord.memorizationStatus,
        interval: updatedWord.interval,
        nextReview: updatedWord.nextReview,
        isFavorite: updatedWord.isFavorite,
        setId: updatedWord.setId,
      });

      // Update local state
      const updatedWords = words.map((word) =>
        word.term === updatedWord.term ? updatedWord : word
      );
      setWords(updatedWords);
    } catch (error) {
      console.error('Error updating word:', error);
    }
  };

  // Export data
  const handleExportData = () => {
    try {
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        wordBank: words,
        vocabSets: vocabSets,
        appLanguage: appLanguage,
        targetLanguage: targetLanguage,
        currentReaderText: localStorage.getItem('current-reader-text') || '',
        textHistory: JSON.parse(localStorage.getItem('reader-text-history') || '[]'),
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flip-reader-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(appLanguage === 'Bahasa Indonesia' ? 'Data berhasil diekspor!' : 'Data exported successfully!');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert(appLanguage === 'Bahasa Indonesia' ? 'Gagal mengekspor data' : 'Failed to export data');
    }
  };

  // Import data - SUPABASE ONLY
  const handleImportData = async () => {
    if (!user) {
      alert(appLanguage === 'Bahasa Indonesia'
        ? 'Anda harus login untuk mengimpor data'
        : 'You must be logged in to import data');
      return;
    }

    if (!confirm(appLanguage === 'Bahasa Indonesia'
      ? 'Mengimpor data akan menambah data ke akun Anda. Apakah Anda yakin?'
      : 'Importing data will add to your account. Are you sure?')) {
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const jsonString = event.target?.result as string;
          const importData = JSON.parse(jsonString);

          if (!importData || typeof importData !== 'object') {
            throw new Error('Invalid data format');
          }

          // Import words to Supabase
          if (importData.wordBank && Array.isArray(importData.wordBank)) {
            for (const word of importData.wordBank) {
              await wordBankService.saveWord(user.id, word);
            }
          }

          // Import vocab sets to Supabase
          if (importData.vocabSets && Array.isArray(importData.vocabSets)) {
            for (const set of importData.vocabSets) {
              await wordBankService.createVocabSet(user.id, set.id, set.name);
            }
          }

          // Only save language preferences to localStorage
          if (importData.appLanguage) {
            localStorage.setItem('app-language', importData.appLanguage);
            setAppLanguage(importData.appLanguage);
          }
          if (importData.targetLanguage) {
            localStorage.setItem('preferred-target-language', importData.targetLanguage);
            setTargetLanguage(importData.targetLanguage);
          }
          if (importData.currentReaderText) {
            localStorage.setItem('current-reader-text', importData.currentReaderText);
          }
          if (importData.textHistory) {
            localStorage.setItem('reader-text-history', JSON.stringify(importData.textHistory));
          }

          // Reload data from Supabase
          await loadDataFromSupabase();

          alert(appLanguage === 'Bahasa Indonesia' ? 'Data berhasil diimpor!' : 'Data imported successfully!');
          setIsSettingsOpen(false);
        } catch (error) {
          console.error('Error importing data:', error);
          alert(appLanguage === 'Bahasa Indonesia'
            ? 'Gagal mengimpor data. Pastikan file format JSON valid.'
            : 'Failed to import data. Please ensure the file is a valid JSON format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Handle CSV Export
  const handleExportCSV = () => {
    try {
      const csvContent = exportToCSV(words, vocabSets);
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '_');
      const filename = `FlipReader_Backup_${dateStr}.csv`;
      downloadCSV(csvContent, filename);

      alert(appLanguage === 'Bahasa Indonesia'
        ? `CSV berhasil diekspor! File: ${filename}`
        : `CSV exported successfully! File: ${filename}`);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert(appLanguage === 'Bahasa Indonesia'
        ? 'Gagal mengekspor CSV. Silakan coba lagi.'
        : 'Failed to export CSV. Please try again.');
    }
  };

  // Handle CSV Import - Step 1: Read headers and show mapping modal
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Read headers from CSV
      const headers = await getCSVHeaders(file);
      setCsvHeaders(headers);
      setCsvFile(file);

      // Auto-detect common column names
      const autoMapping: typeof fieldMapping = {
        term: '',
        definition: '',
      };

      headers.forEach(header => {
        const lowerHeader = header.toLowerCase();
        if (!autoMapping.term && (lowerHeader.includes('word') || lowerHeader.includes('term') || lowerHeader.includes('front') || lowerHeader.includes('kata'))) {
          autoMapping.term = header;
        }
        if (!autoMapping.definition && (lowerHeader.includes('definition') || lowerHeader.includes('translation') || lowerHeader.includes('meaning') || lowerHeader.includes('back') || lowerHeader.includes('arti'))) {
          autoMapping.definition = header;
        }
        if (!autoMapping.partOfSpeech && (lowerHeader.includes('part') || lowerHeader.includes('pos') || lowerHeader.includes('type'))) {
          autoMapping.partOfSpeech = header;
        }
        if (!autoMapping.example && (lowerHeader.includes('example') || lowerHeader.includes('contoh'))) {
          autoMapping.example = header;
        }
        if (!autoMapping.folder && (lowerHeader.includes('folder') || lowerHeader.includes('tag') || lowerHeader.includes('category'))) {
          autoMapping.folder = header;
        }
        if (!autoMapping.dateAdded && (lowerHeader.includes('date') || lowerHeader.includes('tanggal') || lowerHeader.includes('added') || lowerHeader.includes('saved'))) {
          autoMapping.dateAdded = header;
        }
        if (!autoMapping.statusHafal && (lowerHeader.includes('status') || lowerHeader.includes('hafal') || lowerHeader.includes('mastered'))) {
          autoMapping.statusHafal = header;
        }
      });

      setFieldMapping(autoMapping);
      setIsCSVMappingModalOpen(true);
    } catch (error) {
      console.error('Error reading CSV headers:', error);
      alert(appLanguage === 'Bahasa Indonesia'
        ? 'Gagal membaca file CSV. Pastikan format file benar.'
        : 'Failed to read CSV file. Please ensure the file format is correct.');
    }
  };

  // Handle CSV Import - Step 2: Process import with mapping - SUPABASE ONLY
  const handleConfirmCSVImport = async () => {
    if (!user) {
      alert(appLanguage === 'Bahasa Indonesia'
        ? 'Anda harus login untuk mengimpor data'
        : 'You must be logged in to import data');
      return;
    }

    if (!csvFile || !fieldMapping.term || !fieldMapping.definition) {
      alert(appLanguage === 'Bahasa Indonesia'
        ? 'Harap pilih kolom untuk Kata Utama dan Arti.'
        : 'Please select columns for Word and Definition.');
      return;
    }

    try {
      // Create a mutable copy of words for the import function
      const wordsToImport: WordItem[] = [];
      const result = await importFromCSVWithMapping(
        csvFile,
        wordsToImport, // Pass empty array, function will add imported words here
        vocabSets,
        fieldMapping as FieldMapping,
        duplicateAction,
        stripHtml
      );

      // Save all imported words to Supabase
      for (const word of wordsToImport) {
        try {
          await wordBankService.saveWord(user.id, word);
        } catch {
          // Ignore individual word errors
        }
      }

      // Reload data from Supabase
      await loadDataFromSupabase();

      // Show result message
      const totalAdded = result.imported + result.updated;
      const message = appLanguage === 'Bahasa Indonesia'
        ? totalAdded > 0
          ? `Berhasil menambahkan ${totalAdded} kata ke Word Bank kamu!\n\n- Diimpor: ${result.imported}\n- Diperbarui: ${result.updated}\n- Dilewati (duplikat): ${result.skipped}\n- Error: ${result.errors}`
          : `Tidak ada kata baru yang ditambahkan.\n\n- Dilewati (duplikat): ${result.skipped}\n- Error: ${result.errors}`
        : totalAdded > 0
          ? `Successfully added ${totalAdded} words to your Word Bank!\n\n- Imported: ${result.imported}\n- Updated: ${result.updated}\n- Skipped (duplicates): ${result.skipped}\n- Errors: ${result.errors}`
          : `No new words were added.\n\n- Skipped (duplicates): ${result.skipped}\n- Errors: ${result.errors}`;

      alert(message);

      // Close modal and reset
      setIsCSVMappingModalOpen(false);
      setCsvFile(null);
      setCsvHeaders([]);
      setFieldMapping({ term: '', definition: '' });

      // Reset file input
      if (csvFileInputRef.current) {
        csvFileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      alert(appLanguage === 'Bahasa Indonesia'
        ? 'Gagal mengimpor CSV. Pastikan format file benar.'
        : 'Failed to import CSV. Please ensure the file format is correct.');
    }
  };

  // Fungsi untuk membaca data aktivitas harian
  const getDailyStats = () => {
    try {
      const dailyStats = JSON.parse(localStorage.getItem('daily-stats') || '{}');
      return dailyStats;
    } catch (error) {
      console.error('Error reading daily stats:', error);
      return {};
    }
  };

  // Statistik - menggunakan useMemo untuk optimasi
  const statistics = useMemo(() => {
    const totalWords = words.length;
    const masteredWords = words.filter(w => w.memorizationStatus === 'mastered' || w.memorizationStatus === 'well-known').length;
    const learningWords = words.filter(w => w.memorizationStatus === 'learning').length;
    const vocabularyStrength = totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0;

    return { totalWords, masteredWords, learningWords, vocabularyStrength };
  }, [words]);

  // Folder colors (using primary amber for first, then pastel accents)
  const folderColors = [
    { bg: 'bg-[#FFB800]', badge: 'bg-[#E6A600]', border: 'border-[#E6A600]' },
    { bg: 'bg-blue-500', badge: 'bg-blue-600', border: 'border-blue-600' },
    { bg: 'bg-green-500', badge: 'bg-green-600', border: 'border-green-600' },
    { bg: 'bg-purple-500', badge: 'bg-purple-600', border: 'border-purple-600' },
    { bg: 'bg-pink-500', badge: 'bg-pink-600', border: 'border-pink-600' },
    { bg: 'bg-indigo-500', badge: 'bg-indigo-600', border: 'border-indigo-600' },
  ];

  // =============================================
  // AUTH GUARD: Show Welcome Screen if not logged in
  // =============================================
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FEF3C7] via-[#FDE68A] to-[#F59E0B] flex flex-col">
        {/* Header */}
        <nav className="bg-white/90 backdrop-blur-sm border-b border-[#E5E7EB] shadow-sm">
          <div className="max-w-md mx-auto px-4">
            <div className="flex items-center justify-between h-14">
              <h1 className="text-lg font-bold text-[#1F2937] font-serif">Flip Reader 🧠</h1>
              <button
                onClick={() => router.push('/login')}
                className="px-4 py-2 text-sm font-medium text-[#1F2937] hover:text-[#FFB800] transition-colors"
              >
                {appLanguage === 'Bahasa Indonesia' ? 'Masuk' : 'Login'}
              </button>
            </div>
          </div>
        </nav>

        {/* Welcome Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-md"
          >
            {/* Logo/Icon */}
            <div className="mb-8">
              <span className="text-8xl">📖</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-[#1F2937] mb-4 font-serif">
              Flip Reader
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-[#4B5563] mb-8 font-serif">
              {appLanguage === 'Bahasa Indonesia'
                ? 'Belajar kosakata Korea dengan cara yang menyenangkan dan efektif'
                : 'Learn Korean vocabulary in a fun and effective way'}
            </p>

            {/* Features */}
            <div className="grid grid-cols-1 gap-4 mb-10 text-left">
              <div className="flex items-start gap-3 bg-white/80 rounded-xl p-4 shadow-sm">
                <span className="text-2xl">📚</span>
                <div>
                  <h3 className="font-semibold text-[#1F2937] font-serif">
                    {appLanguage === 'Bahasa Indonesia' ? 'Baca & Simpan' : 'Read & Save'}
                  </h3>
                  <p className="text-sm text-[#6B7280]">
                    {appLanguage === 'Bahasa Indonesia'
                      ? 'Klik kata untuk melihat arti dan simpan ke Word Bank'
                      : 'Click words to see meaning and save to Word Bank'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white/80 rounded-xl p-4 shadow-sm">
                <span className="text-2xl">🎴</span>
                <div>
                  <h3 className="font-semibold text-[#1F2937] font-serif">
                    {appLanguage === 'Bahasa Indonesia' ? 'Flashcard Cerdas' : 'Smart Flashcards'}
                  </h3>
                  <p className="text-sm text-[#6B7280]">
                    {appLanguage === 'Bahasa Indonesia'
                      ? 'Sistem pengulangan berjarak untuk hafalan yang lebih awet'
                      : 'Spaced repetition system for lasting memorization'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white/80 rounded-xl p-4 shadow-sm">
                <span className="text-2xl">☁️</span>
                <div>
                  <h3 className="font-semibold text-[#1F2937] font-serif">
                    {appLanguage === 'Bahasa Indonesia' ? 'Sinkron Cloud' : 'Cloud Sync'}
                  </h3>
                  <p className="text-sm text-[#6B7280]">
                    {appLanguage === 'Bahasa Indonesia'
                      ? 'Data tersimpan aman dan bisa diakses dari mana saja'
                      : 'Data saved securely and accessible from anywhere'}
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push('/register')}
                className="w-full px-6 py-4 bg-[#1F2937] text-white rounded-xl font-semibold text-lg shadow-lg hover:bg-[#374151] transition-all duration-200 active:scale-95"
              >
                {appLanguage === 'Bahasa Indonesia' ? 'Daftar Gratis' : 'Sign Up Free'}
              </button>
              <button
                onClick={() => router.push('/login')}
                className="w-full px-6 py-4 bg-white text-[#1F2937] rounded-xl font-semibold text-lg shadow-md border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-all duration-200 active:scale-95"
              >
                {appLanguage === 'Bahasa Indonesia' ? 'Sudah Punya Akun? Masuk' : 'Already have an account? Login'}
              </button>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="text-center py-4 text-sm text-[#6B7280]">
          <p>Made with ❤️ for Korean learners</p>
        </div>
      </div>
    );
  }

  // =============================================
  // LOADING STATE
  // =============================================
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFB800] mx-auto mb-4"></div>
          <p className="text-[#6B7280] font-serif">Loading...</p>
        </div>
      </div>
    );
  }

  // =============================================
  // MAIN APP (Authenticated Users Only)
  // =============================================
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1F2937] pb-24">
      {/* Top Bar */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E5E7EB] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-bold text-[#1F2937] app-title">Flip Reader 🧠</h1>
            {/* Settings Icon */}
            <AnimatePresence>
              {isSettingsVisible && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F8F9FA] rounded-xl transition-all duration-200 active:scale-95"
                  aria-label={t('settings', appLanguage)}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      {/* Content Area */}
      <main className="max-w-md mx-auto px-4 py-6">
        {/* Home Tab */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* Greeting */}
            <div>
              <h2 className="text-xl font-bold text-[#1F2937] mb-2 app-title">
                {t('greeting', appLanguage)} 👋
              </h2>
              <p className="text-sm text-[#6B7280]">
                {isMounted ? formattedDate : (
                  <span className="inline-block h-4 w-48 bg-gray-200 rounded animate-pulse"></span>
                )}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5">
                <p className="text-xs text-[#6B7280] mb-1">{t('totalWordsInBank', appLanguage)}</p>
                <p className="text-2xl font-bold text-[#1F2937]">{words.length}</p>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5">
                <p className="text-xs text-[#6B7280] mb-1">{t('totalFolders', appLanguage)}</p>
                <p className="text-2xl font-bold text-[#1F2937]">{vocabSets.length}</p>
              </div>
            </div>

            {/* Notifikasi Kata yang Perlu Ditinjau - Hanya muncul jika >= 3 kata */}
            {isMounted && dueReviewCount >= 3 && (
              <div className="bg-white border border-purple-200 rounded-lg px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3 flex-1">
                  {/* Ikon Buku Terbuka */}
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <p className="text-sm text-[#1F2937] font-serif flex-1">
                    {appLanguage === 'Bahasa Indonesia'
                      ? dueReviewCount >= 10
                        ? `Sesi santai hari ini: Tinjau ${dueReviewCount} kata lama.`
                        : `Yuk, segarkan ingatanmu! ${dueReviewCount} kata ini sudah waktunya ditinjau agar tidak lupa.`
                      : dueReviewCount >= 10
                        ? `Relaxed session today: Review ${dueReviewCount} old words.`
                        : `Let's refresh your memory! ${dueReviewCount} words are ready for review.`}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('wordBank')}
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium underline ml-2 flex-shrink-0"
                >
                  {appLanguage === 'Bahasa Indonesia' ? 'Mulai' : 'Start'}
                </button>
              </div>
            )}

            {/* Statistik Saya */}
            {(() => {
              // Rekomendasi harian
              const getDailyRecommendation = () => {
                if (statistics.totalWords === 0) {
                  return appLanguage === 'Bahasa Indonesia'
                    ? 'Mulai tambahkan kata-kata baru untuk memulai perjalanan belajarmu!'
                    : 'Start adding new words to begin your learning journey!';
                }
                if (statistics.learningWords > 10) {
                  return appLanguage === 'Bahasa Indonesia'
                    ? `Ada ${statistics.learningWords} kata yang sedang dipelajari, ayo latihan lagi!`
                    : `You have ${statistics.learningWords} words in learning, let's practice again!`;
                }
                if (statistics.masteredWords > 0 && statistics.vocabularyStrength < 50) {
                  return appLanguage === 'Bahasa Indonesia'
                    ? `Kamu sudah hafal ${statistics.masteredWords} kata, terus semangat!`
                    : `You've mastered ${statistics.masteredWords} words, keep it up!`;
                }
                return appLanguage === 'Bahasa Indonesia'
                  ? 'Pertahankan konsistensi belajarmu setiap hari!'
                  : 'Maintain your daily learning consistency!';
              };

              return (
                <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]">
                  <h3 className="text-lg font-bold text-[#1F2937] mb-4 font-serif">
                    {appLanguage === 'Bahasa Indonesia' ? 'Statistik Saya' : 'My Statistics'}
                  </h3>

                  {/* Data Ringkasan - 3 Cards */}
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="text-center">
                      <p className="text-xs text-[#6B7280] mb-1 font-serif">{appLanguage === 'Bahasa Indonesia' ? 'Total Kosakata' : 'Total Words'}</p>
                      <p className="text-2xl font-bold text-[#1F2937] font-serif">{statistics.totalWords}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-[#6B7280] mb-1 font-serif">{appLanguage === 'Bahasa Indonesia' ? 'Sudah Dikuasai' : 'Mastered'}</p>
                      <p className="text-2xl font-bold text-green-600 font-serif">{statistics.masteredWords}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-[#6B7280] mb-1 font-serif">{appLanguage === 'Bahasa Indonesia' ? 'Sedang Dipelajari' : 'Learning'}</p>
                      <p className="text-2xl font-bold text-orange-600 font-serif">{statistics.learningWords}</p>
                    </div>
                  </div>

                  {/* Progress Bar - Kekuatan Kosakata */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-[#1F2937] font-serif">
                        {appLanguage === 'Bahasa Indonesia' ? 'Kekuatan Kosakata' : 'Vocabulary Strength'}
                      </p>
                      <p className="text-sm font-bold text-[#1F2937] font-serif">{statistics.vocabularyStrength}%</p>
                    </div>
                    <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(to right, #FFB800, #10B981)`,
                          width: `${statistics.vocabularyStrength}%`
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${statistics.vocabularyStrength}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </div>
                  </div>

                  {/* Grafik Batang Sederhana - 7 Hari Terakhir */}
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-[#1F2937] mb-3 font-serif">
                      {appLanguage === 'Bahasa Indonesia' ? 'Aktivitas 7 Hari Terakhir' : 'Last 7 Days Activity'}
                    </p>
                    <div className="flex items-end justify-between gap-1 h-32">
                      {isMounted && last7DaysData.length > 0 ? (
                        last7DaysData.map((day, idx) => {
                          const maxHeight = Math.max(...last7DaysData.map(d => d.count));
                          const height = maxHeight > 0 ? (day.count / maxHeight) * 100 : 0;
                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                              <div className="w-full flex items-end justify-center" style={{ height: '100px' }}>
                                <motion.div
                                  className="w-full bg-gradient-to-t from-[#FFB800] to-[#10B981] rounded-t"
                                  style={{ height: `${height}%` }}
                                  initial={{ height: 0 }}
                                  animate={{ height: `${height}%` }}
                                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                                />
                              </div>
                              <p className="text-xs text-[#6B7280] font-serif">{day.date}</p>
                              <p className="text-xs font-bold text-[#1F2937] font-serif">{day.count}</p>
                            </div>
                          );
                        })
                      ) : (
                        // Skeleton placeholder for chart
                        Array.from({ length: 7 }).map((_, idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex items-end justify-center" style={{ height: '100px' }}>
                              <div className="w-full h-8 bg-gray-200 rounded-t animate-pulse" />
                            </div>
                            <div className="h-3 w-6 bg-gray-200 rounded animate-pulse" />
                            <div className="h-3 w-4 bg-gray-200 rounded animate-pulse" />
                          </div>
                        ))
                      )}
                    </div>

                    {/* Reset Stats Today Button - untuk testing */}
                    {user && (
                      <button
                        onClick={async () => {
                          if (confirm(appLanguage === 'Bahasa Indonesia'
                            ? 'Reset statistik hari ini ke 0?'
                            : 'Reset today\'s stats to 0?')) {
                            const success = await wordBankService.resetTodayStats(user.id);
                            if (success) {
                              await loadDailyStats();
                              alert(appLanguage === 'Bahasa Indonesia'
                                ? 'Statistik hari ini berhasil di-reset!'
                                : 'Today\'s stats reset successfully!');
                            }
                          }
                        }}
                        className="mt-2 text-xs text-gray-500 hover:text-red-500 underline"
                      >
                        {appLanguage === 'Bahasa Indonesia' ? 'Reset Stats Hari Ini' : 'Reset Today\'s Stats'}
                      </button>
                    )}
                  </div>

                  {/* Rekomendasi Harian */}
                  <div className="bg-gradient-to-r from-[#FEF3C7] to-[#FDE68A] rounded-xl p-4 border border-[#FFB800]">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-[#FFB800] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <p className="text-sm text-[#1F2937] font-serif">{getDailyRecommendation()}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Word of the Day */}
            <div className="bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A] border border-[#E5E7EB] rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] transition-all duration-200">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-[#FFB800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-[#1F2937]">
                  {t('wordOfTheDay', appLanguage)}
                </h3>
              </div>
              {isMounted && wordOfTheDay ? (
                <>
                  <p className="text-2xl font-bold text-[#1F2937] mb-1">
                    {wordOfTheDay.term}
                  </p>
                  <p className="text-base text-[#1F2937]">
                    {wordOfTheDay.definition}
                  </p>
                  {wordOfTheDay.partOfSpeech && (
                    <span className={`inline-block mt-2 px-2 py-1 rounded-lg text-xs font-medium ${wordOfTheDay.partOfSpeech === 'Noun' ? 'bg-[#DBEAFE] text-blue-700' :
                      wordOfTheDay.partOfSpeech === 'Verb' ? 'bg-[#D1FAE5] text-green-700' :
                        'bg-[#E9D5FF] text-purple-700'
                      }`}>
                      {translatePartOfSpeech(wordOfTheDay.partOfSpeech, appLanguage)}
                    </span>
                  )}
                </>
              ) : (
                // Skeleton placeholder for Word of the Day
                <>
                  <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
                  <div className="h-6 w-16 bg-gray-200 rounded-lg animate-pulse mt-2" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Reader Tab */}
        {activeTab === 'reader' && (
          <div>
            <ReaderCanvas appLanguage={appLanguage} />
          </div>
        )}

        {/* Library/Word Bank Tab */}
        {activeTab === 'wordBank' && (
          <div className="space-y-4">
            {/* Swipe Mode Toggle */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1F2937] app-title">
                {isSwipeMode ? 'Flashcard' : t('vocabularySets', appLanguage)}
              </h2>
              {words.length > 0 && (
                <button
                  onClick={() => setIsSwipeMode(!isSwipeMode)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] active:scale-95 ${isSwipeMode
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-[#FFB800] text-white hover:bg-[#E6A600]'
                    }`}
                >
                  {isSwipeMode ? (appLanguage === 'Bahasa Indonesia' ? 'Keluar' : 'Exit') : (appLanguage === 'Bahasa Indonesia' ? 'Flashcard' : 'Flashcard')}
                </button>
              )}
            </div>

            {/* Swipe Mode Content */}
            {isSwipeMode && (
              <>
                {/* Progress Bar */}
                {swipeWords.length > 0 && !isSessionComplete && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-[#6B7280]">
                      <span>
                        {appLanguage === 'Bahasa Indonesia'
                          ? `Kartu ${currentIndex + 1} dari ${swipeWords.length}`
                          : `Card ${currentIndex + 1} of ${swipeWords.length}`}
                      </span>
                      <span>
                        {appLanguage === 'Bahasa Indonesia'
                          ? `${swipeWords.length - currentIndex} tersisa`
                          : `${swipeWords.length - currentIndex} remaining`}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-[#FFB800]"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentIndex + 1) / swipeWords.length) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}

                {/* Favorite Filter */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyFavorites}
                      onChange={(e) => setOnlyFavorites(e.target.checked)}
                      className="w-4 h-4 text-[#FFB800] border-gray-300 rounded focus:ring-[#FFB800]"
                    />
                    <span className="text-sm text-[#6B7280]">
                      {appLanguage === 'Bahasa Indonesia' ? 'Hanya Favorit' : 'Favorites Only'}
                    </span>
                  </label>
                </div>

                {/* Swipe Card Container */}
                <div className="flex items-center justify-center min-h-[500px] relative">
                  {swipeWords.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-[#6B7280] mb-4">
                        {appLanguage === 'Bahasa Indonesia'
                          ? 'Tidak ada kata untuk dihafal'
                          : 'No words to memorize'}
                      </p>
                      <button
                        onClick={() => setIsSwipeMode(false)}
                        className="px-4 py-2 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200 active:scale-95"
                      >
                        {appLanguage === 'Bahasa Indonesia' ? 'Kembali' : 'Back'}
                      </button>
                    </div>
                  ) : isSessionComplete ? (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key="summary"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="text-center py-12 w-full"
                      >
                        <div className="bg-white rounded-2xl p-8 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] border border-[#E5E7EB]">
                          {/* Icon Piala */}
                          <div className="mb-6">
                            <svg className="w-20 h-20 text-[#FFB800] mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                          </div>

                          <h3 className="text-2xl font-bold text-[#1F2937] mb-6 font-serif">
                            {appLanguage === 'Bahasa Indonesia' ? 'Sesi Selesai!' : 'Session Completed!'}
                          </h3>

                          {/* Statistik Ringkasan */}
                          <div className="mb-6">
                            <div className="grid grid-cols-2 gap-4">
                              {/* Sudah Hafal - Hijau */}
                              <div className="bg-green-50 rounded-2xl p-6 border-2 border-green-200">
                                <div className="flex flex-col items-center">
                                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-3">
                                    <span className="text-2xl font-bold text-white font-serif">
                                      {sudahHafal.length}
                                    </span>
                                  </div>
                                  <p className="text-sm font-semibold text-green-700 font-serif">
                                    {appLanguage === 'Bahasa Indonesia' ? 'Sudah Hafal' : 'Known'}
                                  </p>
                                </div>
                              </div>

                              {/* Perlu Diulang - Oranye */}
                              <div className="bg-orange-50 rounded-2xl p-6 border-2 border-orange-200">
                                <div className="flex flex-col items-center">
                                  <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mb-3">
                                    <span className="text-2xl font-bold text-white font-serif">
                                      {perluDiulang.length}
                                    </span>
                                  </div>
                                  <p className="text-sm font-semibold text-orange-700 font-serif">
                                    {appLanguage === 'Bahasa Indonesia' ? 'Perlu Diulang' : 'Need Review'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Daftar Kata Berbintang */}
                          {starredWords.length > 0 && (
                            <div className="mb-6">
                              <h4 className="text-lg font-semibold text-[#1F2937] mb-3 font-serif">
                                {appLanguage === 'Bahasa Indonesia' ? 'Kata Berbintang' : 'Starred Words'}
                              </h4>
                              <div className="bg-[#F8F9FA] rounded-xl p-4 border border-yellow-200 max-h-48 overflow-y-auto">
                                <div className="space-y-2">
                                  {starredWords.map((word, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-left p-2 bg-yellow-50 rounded-lg">
                                      <svg className="w-5 h-5 text-[#FFB800] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                      </svg>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-[#1F2937] truncate font-serif">{word.term}</p>
                                        <p className="text-xs text-[#6B7280] truncate font-serif">{word.definition}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tombol Aksi */}
                          <div className="flex flex-col gap-3 mt-6">
                            {perluDiulang.length > 0 && (
                              <button
                                onClick={() => {
                                  // Pelajari Lagi yang Sulit: swipeWords diisi hanya dengan kata-kata yang ada di perluDiulang
                                  const wordsToReview = swipeWords.filter(w => perluDiulang.includes(w.term));
                                  const shuffled = wordsToReview.sort(() => Math.random() - 0.5);
                                  setSwipeWords(shuffled);
                                  setCurrentIndex(0);
                                  setSudahHafal([]);
                                  setPerluDiulang([]); // Reset untuk tracking sesi baru
                                  setStarredWords([]);
                                  setIsSessionComplete(false);
                                }}
                                className="w-full px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-medium font-serif shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200 active:scale-95"
                              >
                                {appLanguage === 'Bahasa Indonesia' ? 'Pelajari Lagi yang Sulit' : 'Review Difficult Words'}
                              </button>
                            )}

                            <button
                              onClick={async () => {
                                // Selesai & Simpan: Update status di Supabase
                                if (user) {
                                  // Update mastered words
                                  for (const term of sudahHafal) {
                                    await wordBankService.updateWord(user.id, term, {
                                      memorizationStatus: 'mastered'
                                    });
                                  }
                                  // Update learning words
                                  for (const term of perluDiulang) {
                                    await wordBankService.updateWord(user.id, term, {
                                      memorizationStatus: 'learning'
                                    });
                                  }

                                  // SIMPAN STATISTIK HARIAN - satu kali saat sesi selesai
                                  // Total kartu yang direview = hafal + perlu diulang
                                  const totalReviewed = sudahHafal.length + perluDiulang.length;
                                  if (totalReviewed > 0) {
                                    console.log('[Selesai & Simpan] Saving daily stats:', totalReviewed, 'cards');
                                    await saveDailyActivity(totalReviewed);
                                  }

                                  // Reload data from Supabase
                                  await loadDataFromSupabase();
                                }

                                // Update local state
                                const updatedWords = words.map((word) => {
                                  if (sudahHafal.includes(word.term)) {
                                    return { ...word, memorizationStatus: 'mastered' as const };
                                  }
                                  if (perluDiulang.includes(word.term)) {
                                    return { ...word, memorizationStatus: 'learning' as const };
                                  }
                                  return word;
                                });
                                setWords(updatedWords);

                                // Reset state dan tutup mode flashcard
                                setCurrentIndex(0);
                                setSudahHafal([]);
                                setPerluDiulang([]);
                                setStarredWords([]);
                                setIsSessionComplete(false);
                                setIsSwipeMode(false);
                              }}
                              className="w-full px-6 py-3 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] font-medium font-serif shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200 active:scale-95"
                            >
                              {appLanguage === 'Bahasa Indonesia' ? 'Selesai & Simpan' : 'Done & Save'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  ) : currentIndex < swipeWords.length ? (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.3 }}
                        className="w-full"
                      >
                        <SwipeCard
                          word={swipeWords[currentIndex]}
                          appLanguage={appLanguage}
                          onSwipeRight={() => handleNextCard('right')}
                          onSwipeLeft={() => handleNextCard('left')}
                          onToggleFavorite={() => {
                            const currentWord = swipeWords[currentIndex];
                            const updatedWord = { ...currentWord, isFavorite: !currentWord.isFavorite };
                            updateWordInStorage(updatedWord);
                            setSwipeWords(prev => prev.map((w, i) => i === currentIndex ? updatedWord : w));

                            // Track starred words
                            if (updatedWord.isFavorite) {
                              setStarredWords(prev => {
                                if (!prev.find(w => w.term === updatedWord.term)) {
                                  return [...prev, updatedWord];
                                }
                                return prev;
                              });
                            } else {
                              setStarredWords(prev => prev.filter(w => w.term !== updatedWord.term));
                            }
                          }}
                        />
                      </motion.div>
                    </AnimatePresence>
                  ) : null}
                </div>
              </>
            )}

            {/* Regular Word Bank View */}
            {!isSwipeMode && (
              <>
                {/* Vocabulary Sets (Folders) */}
                {vocabSets.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-[#6B7280] mb-2">
                      {t('vocabularySets', appLanguage)}
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {vocabSets.map((set, index) => {
                        const wordCount = words.filter((word) => word.setId === set.id).length;
                        const color = folderColors[index % folderColors.length];
                        const isSelected = selectedSetId === set.id;

                        return (
                          <button
                            key={set.id}
                            onClick={() => {
                              setSelectedSetId(isSelected ? null : set.id);
                              setSearchQuery('');
                            }}
                            className={`p-3 rounded-xl border-2 text-left transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] ${isSelected
                              ? `${color.bg} text-white border-transparent shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)]`
                              : 'bg-white text-[#1F2937] border-[#E5E7EB] hover:border-[#D1D5DB] hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] hover:-translate-y-0.5'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{set.name} ({wordCount})</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isSelected ? `${color.badge} text-white` : 'bg-[#F8F9FA] text-[#6B7280] border border-[#E5E7EB]'
                                }`}>
                                {wordCount}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sticky Search Bar & Sort */}
                <div className="sticky top-14 z-30 bg-[#F8F9FA] py-3 -mx-4 px-4 border-b border-[#E5E7EB] mb-4">
                  <div className="space-y-3">

                    {/* Language Filters (Sticky) - Only show if mixed languages */}
                    {(() => {
                      const languages = Array.from(new Set(words.map(w => normalizeLanguage(w.sourceLanguage))));
                      if (languages.length > 1) {
                        return (
                          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                            <button
                              onClick={() => setWordBankLanguageFilter('all')}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex-shrink-0 ${wordBankLanguageFilter === 'all'
                                ? 'bg-[#1F2937] text-white shadow-md'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                              All
                            </button>
                            {languages.sort().map(lang => (
                              <button
                                key={lang}
                                onClick={() => setWordBankLanguageFilter(lang)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex-shrink-0 flex items-center gap-1.5 ${wordBankLanguageFilter === lang
                                  ? 'bg-[#1F2937] text-white shadow-md'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                  }`}
                              >
                                {lang === 'Korean' ? '🇰🇷' :
                                  lang === 'Japanese' ? '🇯🇵' :
                                    lang === 'English' ? '🇺🇸' :
                                      lang === 'Spanish' ? '🇪🇸' :
                                        lang === 'French' ? '🇫🇷' :
                                          lang === 'German' ? '🇩🇪' :
                                            lang === 'Chinese' ? '🇨🇳' :
                                              lang === 'Italian' ? '🇮🇹' :
                                                lang === 'Russian' ? '🇷🇺' :
                                                  lang === 'Arabic' ? '🇸🇦' :
                                                    lang === 'Portuguese' ? '🇧🇷' :
                                                      lang === 'Vietnamese' ? '🇻🇳' :
                                                        lang === 'Thai' ? '🇹🇭' :
                                                          lang === 'Unknown' ? '❓' : '🌐'}
                                <span>{lang}</span>
                              </button>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {/* Search Bar */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={appLanguage === 'Bahasa Indonesia'
                          ? 'Cari kata (Korea, Indonesia, atau tata bahasa)...'
                          : 'Search words (Korean, definition, or grammar)...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 pl-10 pr-24 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200 focus:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)]"
                      />
                      <svg
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>

                      {/* Sort Dropdown */}
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'newest' | 'alphabetical' | 'status')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1.5 text-xs border border-[#E5E7EB] rounded-lg bg-white text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#FFB800]"
                      >
                        <option value="newest">{appLanguage === 'Bahasa Indonesia' ? 'Terbaru' : 'Newest'}</option>
                        <option value="alphabetical">{appLanguage === 'Bahasa Indonesia' ? 'A-Z' : 'A-Z'}</option>
                        <option value="status">{appLanguage === 'Bahasa Indonesia' ? 'Status' : 'Status'}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Filter Bar */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setMemorizationFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${memorizationFilter === 'all'
                      ? 'bg-[#FFB800] text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]'
                      : 'bg-white text-[#6B7280] border border-[#E5E7EB] hover:bg-[#F8F9FA]'
                      }`}
                  >
                    {appLanguage === 'Bahasa Indonesia' ? 'Semua' : 'All'}
                  </button>
                  <button
                    onClick={() => setMemorizationFilter('due-review')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${memorizationFilter === 'due-review'
                      ? 'bg-orange-500 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]'
                      : 'bg-white text-[#6B7280] border border-[#E5E7EB] hover:bg-[#F8F9FA]'
                      }`}
                  >
                    {appLanguage === 'Bahasa Indonesia' ? 'Waktunya Tinjau' : 'Due Review'}
                  </button>
                  <button
                    onClick={() => setMemorizationFilter('not-mastered')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${memorizationFilter === 'not-mastered'
                      ? 'bg-[#FFB800] text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]'
                      : 'bg-white text-[#6B7280] border border-[#E5E7EB] hover:bg-[#F8F9FA]'
                      }`}
                  >
                    {appLanguage === 'Bahasa Indonesia' ? 'Belum Hafal' : 'Not Mastered'}
                  </button>
                  <button
                    onClick={() => setMemorizationFilter('mastered')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${memorizationFilter === 'mastered'
                      ? 'bg-[#FFB800] text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]'
                      : 'bg-white text-[#6B7280] border border-[#E5E7EB] hover:bg-[#F8F9FA]'
                      }`}
                  >
                    {appLanguage === 'Bahasa Indonesia' ? 'Sudah Hafal' : 'Mastered'}
                  </button>
                </div>

                {/* Word Count */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#6B7280]">
                    {selectedSetId
                      ? `${t('wordsInFolder', appLanguage)}: ${filteredWords.length}`
                      : `${t('totalWords', appLanguage)}: ${words.length}`
                    }
                  </p>
                  {words.length > 0 && (
                    <button
                      onClick={toggleSelectionMode}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] active:scale-95 ${isSelectionMode
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                    >
                      {isSelectionMode ? t('cancel', appLanguage) : t('select', appLanguage)}
                    </button>
                  )}
                </div>

                {/* Word List */}
                {words.length === 0 ? (
                  <div className="text-center py-12">
                    <svg
                      className="w-12 h-12 text-gray-300 mx-auto mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-[#6B7280] mb-4">{t('emptyWordBank', appLanguage)}</p>
                    <button
                      onClick={() => setActiveTab('reader')}
                      className="px-4 py-2 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-95"
                    >
                      {t('startReading', appLanguage)}
                    </button>
                  </div>
                ) : filteredWords.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="bg-white border border-[#E5E7EB] rounded-xl p-8 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]">
                      <svg
                        className="w-16 h-16 text-gray-300 mx-auto mb-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-lg font-semibold text-[#1F2937] mb-2 font-serif">
                        {appLanguage === 'Bahasa Indonesia'
                          ? 'Ups! Kata yang kamu cari belum ada'
                          : 'Oops! Word not found'}
                      </h3>
                      <p className="text-sm text-[#6B7280] mb-6 font-serif">
                        {appLanguage === 'Bahasa Indonesia'
                          ? 'Kata yang kamu cari belum ada di bank kosakata.'
                          : 'The word you\'re looking for is not in your vocabulary bank.'}
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setActiveTab('reader');
                        }}
                        className="px-6 py-3 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-95"
                      >
                        {appLanguage === 'Bahasa Indonesia' ? 'Tambah Kata Baru' : 'Add New Word'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pb-20">
                    {filteredWords.map((word, index) => {
                      const isExpanded = expandedId === word.term;
                      const isSelected = selectedWords.has(word.term);
                      const isMastered = word.memorizationStatus === 'mastered' || word.memorizationStatus === 'well-known';

                      return (
                        <div
                          key={index}
                          className={`bg-white border rounded-xl overflow-hidden shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200 relative ${isSelected ? 'border-blue-500 bg-blue-50 shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)]' : 'border-[#E5E7EB] hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)]'
                            } ${isMastered ? 'opacity-80' : ''}`}
                        >
                          {/* Indikator Visual - Icon Centang Hijau */}
                          {isMastered && (
                            <div className="absolute top-2 right-2 z-10">
                              <div className="bg-green-500 rounded-full p-1 shadow-sm">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            </div>
                          )}

                          <div
                            onClick={() => !isSelectionMode && toggleExpand(word.term)}
                            className={`flex items-center justify-between p-3 ${isSelectionMode ? 'cursor-default' : 'cursor-pointer hover:bg-[#F8F9FA] transition-colors duration-200'
                              }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {isSelectionMode && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => { }}
                                  onClick={(e) => toggleWordSelection(word.term, e)}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-base font-bold text-[#1F2937]">
                                    {searchQuery.trim() ? highlightText(word.term, searchQuery) : word.term}
                                  </p>
                                  {/* Language Icon Badge */}
                                  <span title={normalizeLanguage(word.sourceLanguage)} className="text-base">
                                    {normalizeLanguage(word.sourceLanguage) === 'Korean' ? '🇰🇷' :
                                      normalizeLanguage(word.sourceLanguage) === 'Japanese' ? '🇯🇵' :
                                        normalizeLanguage(word.sourceLanguage) === 'English' ? '🇺🇸' :
                                          normalizeLanguage(word.sourceLanguage) === 'Spanish' ? '🇪🇸' :
                                            normalizeLanguage(word.sourceLanguage) === 'French' ? '🇫🇷' :
                                              normalizeLanguage(word.sourceLanguage) === 'German' ? '🇩🇪' :
                                                normalizeLanguage(word.sourceLanguage) === 'Chinese' ? '🇨🇳' :
                                                  normalizeLanguage(word.sourceLanguage) === 'Italian' ? '🇮🇹' :
                                                    normalizeLanguage(word.sourceLanguage) === 'Russian' ? '🇷🇺' :
                                                      normalizeLanguage(word.sourceLanguage) === 'Arabic' ? '🇸🇦' :
                                                        normalizeLanguage(word.sourceLanguage) === 'Portuguese' ? '🇧🇷' :
                                                          normalizeLanguage(word.sourceLanguage) === 'Vietnamese' ? '🇻🇳' :
                                                            normalizeLanguage(word.sourceLanguage) === 'Thai' ? '🇹🇭' :
                                                              normalizeLanguage(word.sourceLanguage) === 'Indonesian' ? '🇮🇩' :
                                                                normalizeLanguage(word.sourceLanguage) === 'Unknown' ? '❓' : '🌐'}
                                  </span>
                                  {/* Icon Speaker */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPlayingAudioId(word.term);
                                      playWordAudio(
                                        word.term,
                                        () => setPlayingAudioId(word.term),
                                        () => setPlayingAudioId(null)
                                      );
                                    }}
                                    className={`p-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${playingAudioId === word.term
                                      ? 'bg-blue-100 text-blue-600'
                                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                      }`}
                                    aria-label={appLanguage === 'Bahasa Indonesia' ? 'Putar audio' : 'Play audio'}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    </svg>
                                  </button>
                                  {isMastered && (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                      {appLanguage === 'Bahasa Indonesia' ? 'Hafal' : 'Mastered'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-[#6B7280] truncate">
                                  {searchQuery.trim() ? highlightText(word.definition, searchQuery) : word.definition}
                                </p>

                                {/* Progress Bar Visual - 3 Titik */}
                                <div className="flex items-center gap-1 mt-2">
                                  {[0, 1, 2].map((level) => {
                                    const wordInterval = word.interval || 0;
                                    const isFilled = level < wordInterval;
                                    return (
                                      <div
                                        key={level}
                                        className={`w-2 h-2 rounded-full transition-colors ${isFilled ? 'bg-green-500' : 'bg-gray-300'
                                          }`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            {!isSelectionMode && (
                              <div className="flex items-center gap-2">
                                <svg
                                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''
                                    }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                <button
                                  onClick={(e) => handleDeleteWord(word.term, e)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="px-3 pb-3">
                              <div className="bg-[#F8F9FA] rounded-xl p-4 space-y-4 border border-[#E5E7EB] shadow-sm">
                                {/* DEFINITION */}
                                <div>
                                  <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">DEFINITION</p>
                                  <p className="text-sm text-[#1F2937]">
                                    {searchQuery.trim() ? highlightText(word.definition, searchQuery) : word.definition}
                                  </p>
                                </div>

                                {/* PART OF SPEECH */}
                                {word.partOfSpeech && (
                                  <div>
                                    <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">PART OF SPEECH</p>
                                    <span className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${word.partOfSpeech === 'Noun' ? 'bg-[#E9D5FF] text-purple-800' :
                                      word.partOfSpeech === 'Verb' ? 'bg-[#D1FAE5] text-green-800' :
                                        word.partOfSpeech === 'Adverb' ? 'bg-[#DBEAFE] text-blue-800' :
                                          word.partOfSpeech === 'Adjective' ? 'bg-[#FED7AA] text-orange-800' :
                                            'bg-[#FCE7F3] text-pink-700'
                                      }`}>
                                      {translatePartOfSpeech(word.partOfSpeech, appLanguage)}
                                    </span>
                                  </div>
                                )}

                                {/* GRAMMAR & MORPHOLOGY */}
                                {word.grammarNote && (
                                  <div>
                                    <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">GRAMMAR & MORPHOLOGY</p>
                                    <p className="text-sm text-[#1F2937] italic bg-white p-3 rounded-xl border border-[#E5E7EB]">
                                      {searchQuery.trim() ? highlightText(word.grammarNote, searchQuery) : word.grammarNote}
                                    </p>
                                  </div>
                                )}

                                {/* EXAMPLE SENTENCE */}
                                {word.example && (
                                  <div>
                                    <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">EXAMPLE SENTENCE</p>
                                    <div className="bg-white p-3 rounded-xl border border-[#E5E7EB] space-y-2">
                                      <p className="text-sm text-[#1F2937] italic">
                                        "{word.example}"
                                      </p>
                                      {word.exampleTranslation && (
                                        <p className="text-xs text-[#6B7280] italic">
                                          "{word.exampleTranslation}"
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* ORIGINAL SENTENCE */}
                                {word.originalSentence && (
                                  <div>
                                    <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">ORIGINAL SENTENCE</p>
                                    <div className="bg-white p-3 rounded-xl border border-[#E5E7EB] space-y-2">
                                      <p className="text-sm text-[#1F2937] italic leading-relaxed">
                                        "{word.originalSentence}"
                                      </p>
                                      {word.originalSentenceTranslation && (
                                        <p className="text-xs text-[#6B7280] italic">
                                          "{word.originalSentenceTranslation}"
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Saved Date */}
                                <div className="pt-3 border-t border-[#E5E7EB]">
                                  <p className="text-xs text-[#6B7280]">
                                    Disimpan: {new Date(word.savedAt).toLocaleDateString('id-ID', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Floating Action Bar - z-[60] above BottomNav but below modals */}
      {isSelectionMode && selectedWords.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-white border-t border-[#E5E7EB] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1),0_-2px_4px_-1px_rgba(0,0,0,0.06)] pb-safe">
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[#1F2937]">
                <span className="font-semibold text-blue-600">{selectedWords.size}</span> {t('selectedWords', appLanguage)}
              </p>
              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMoveToSet(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-3 py-1.5 border border-[#E5E7EB] rounded-xl text-sm bg-white text-[#1F2937] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-[#FFB800] transition-all duration-200"
                  defaultValue=""
                >
                  <option value="" disabled>{t('moveToSet', appLanguage)}</option>
                  {vocabSets.map((set) => (
                    <option key={set.id} value={set.id}>{set.name}</option>
                  ))}
                  <option value="__create_new__" className="font-semibold text-[#FFB800]">
                    {t('createNewFolder', appLanguage)}
                  </option>
                </select>
                <button
                  onClick={handleDeleteSelected}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-95"
                >
                  {t('deleteSelected', appLanguage)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Folder Modal */}
      {isCreateFolderModalOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black bg-opacity-50"
            onClick={() => {
              setIsCreateFolderModalOpen(false);
              setNewFolderName('');
            }}
          />
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)] w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-[#1F2937] mb-4 font-serif">
                  {t('newFolderName', appLanguage)}
                </h3>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={t('enterFolderName', appLanguage)}
                  className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] text-[#1F2937] text-sm mb-4"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateFolderAndMove();
                    }
                  }}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsCreateFolderModalOpen(false);
                      setNewFolderName('');
                    }}
                    className="flex-1 px-4 py-2.5 border border-[#E5E7EB] text-[#6B7280] rounded-xl hover:bg-[#F8F9FA] text-sm font-medium transition-all duration-200"
                  >
                    {t('cancel', appLanguage)}
                  </button>
                  <button
                    onClick={handleCreateFolderAndMove}
                    className="flex-1 px-4 py-2.5 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200 active:scale-95"
                  >
                    {t('create', appLanguage)}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* Move Success Notification Toast */}
      <AnimatePresence>
        {moveNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[120] bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {moveNotification}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Sidebar */}
      {isSettingsOpen && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black bg-opacity-50"
            onClick={() => setIsSettingsOpen(false)}
          />
          <div
            className="fixed top-0 right-0 z-[90] h-full w-full sm:w-96 bg-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
                <h2 className="text-lg font-bold text-[#1F2937] app-title">{t('settings', appLanguage)}</h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F8F9FA] rounded-lg transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Account Section */}
                <div className="bg-gradient-to-r from-[#FEF3C7] to-[#FDE68A] rounded-xl p-4 border border-[#FFB800]">
                  <h3 className="text-sm font-semibold text-[#1F2937] mb-3">
                    {appLanguage === 'Bahasa Indonesia' ? 'Akun' : 'Account'}
                  </h3>
                  {/* Controls: Search, Sort, Filter */}
                  <div className="space-y-4 mb-6">
                    {user ? (
                      <>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="w-10 h-10 bg-[#FFB800] rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-lg">
                              {user.email?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#1F2937] truncate">{user.email}</p>
                            <p className="text-xs text-[#6B7280]">
                              {appLanguage === 'Bahasa Indonesia' ? 'Data tersimpan di cloud' : 'Data saved to cloud'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await signOut();
                            setIsSettingsOpen(false);
                            router.push('/login');
                          }}
                          className="w-full px-4 py-2 bg-white border border-[#E5E7EB] text-[#6B7280] rounded-xl hover:bg-[#F8F9FA] text-sm font-medium transition-all duration-200"
                        >
                          {appLanguage === 'Bahasa Indonesia' ? 'Keluar' : 'Sign Out'}
                        </button>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-[#6B7280] mb-3">
                          {appLanguage === 'Bahasa Indonesia'
                            ? 'Masuk untuk menyimpan data ke cloud dan akses dari perangkat manapun.'
                            : 'Sign in to save data to cloud and access from any device.'}
                        </p>
                        <button
                          onClick={() => router.push('/login')}
                          className="w-full px-4 py-2 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] text-sm font-semibold shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] transition-all duration-200 active:scale-95"
                        >
                          {appLanguage === 'Bahasa Indonesia' ? 'Masuk / Daftar' : 'Sign In / Register'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia' ? 'Pilihan Bahasa Aplikasi' : 'App Language'}
                    </label>
                    <select
                      value={appLanguage}
                      onChange={(e) => setAppLanguage(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200"
                    >
                      <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                      <option value="English">English</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia'
                        ? 'Pilihan Bahasa Tujuan Transmisi (AI Target Language)'
                        : 'Target Language for Translation (AI)'}
                    </label>
                    <select
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-all duration-200"
                    >
                      <option value="Indonesian">Bahasa Indonesia</option>
                      <option value="English">English</option>
                      <option value="Japanese">Japanese</option>
                      <option value="Chinese">Chinese</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-[#E5E7EB] p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-[#1F2937] mb-3">
                    {appLanguage === 'Bahasa Indonesia' ? 'Manajemen Data' : 'Data Management'}
                  </h3>
                  <button
                    onClick={handleExportData}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-95"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>{appLanguage === 'Bahasa Indonesia' ? 'Ekspor Data (JSON)' : 'Export Data (JSON)'}</span>
                  </button>
                  <button
                    onClick={handleImportData}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-95"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>{appLanguage === 'Bahasa Indonesia' ? 'Impor Data' : 'Import Data'}</span>
                  </button>

                  {/* CSV Export/Import Section */}
                  <div className="pt-2 border-t border-[#E5E7EB] mt-2">
                    <h4 className="text-xs font-semibold text-[#6B7280] mb-2 uppercase tracking-wider">
                      {appLanguage === 'Bahasa Indonesia' ? 'CSV (Excel/Anki)' : 'CSV (Excel/Anki)'}
                    </h4>
                    <button
                      onClick={handleExportCSV}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#FFB800] hover:bg-[#E6A600] text-white rounded-xl text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-95 mb-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{appLanguage === 'Bahasa Indonesia' ? 'Cadangkan ke CSV (Excel/Anki)' : 'Backup to CSV (Excel/Anki)'}</span>
                    </button>
                    <button
                      onClick={() => csvFileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_5px_-1px_rgba(0,0,0,0.08)] transition-all duration-200 active:scale-95"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span>{appLanguage === 'Bahasa Indonesia' ? 'Pulihkan dari CSV' : 'Restore from CSV'}</span>
                    </button>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleImportCSV}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )
      }

      {isCSVMappingModalOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black bg-opacity-50"
            onClick={() => setIsCSVMappingModalOpen(false)}
          />
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E5E7EB] p-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1F2937] app-title">
                  {appLanguage === 'Bahasa Indonesia' ? 'Pemetaan Kolom CSV' : 'CSV Column Mapping'}
                </h2>
                <button
                  onClick={() => setIsCSVMappingModalOpen(false)}
                  className="p-2 text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F8F9FA] rounded-lg transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    {appLanguage === 'Bahasa Indonesia'
                      ? 'Pilih kolom dari file CSV yang sesuai dengan field di Flip Reader. Kolom dengan tanda * wajib diisi.'
                      : 'Select CSV columns that match Flip Reader fields. Fields marked with * are required.'}
                  </p>
                </div>

                {/* Required Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia' ? 'Kata Utama *' : 'Word *'}
                    </label>
                    <select
                      value={fieldMapping.term}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, term: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm"
                      required
                    >
                      <option value="">{appLanguage === 'Bahasa Indonesia' ? 'Pilih kolom...' : 'Select column...'}</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia' ? 'Arti/Definisi *' : 'Definition/Translation *'}
                    </label>
                    <select
                      value={fieldMapping.definition}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, definition: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm"
                      required
                    >
                      <option value="">{appLanguage === 'Bahasa Indonesia' ? 'Pilih kolom...' : 'Select column...'}</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Optional Fields */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wider">
                    {appLanguage === 'Bahasa Indonesia' ? 'Field Opsional' : 'Optional Fields'}
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia' ? 'Jenis Kata (Part of Speech)' : 'Part of Speech'}
                    </label>
                    <select
                      value={fieldMapping.partOfSpeech || ''}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, partOfSpeech: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm"
                    >
                      <option value="">{appLanguage === 'Bahasa Indonesia' ? 'Tidak ada' : 'None'}</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia' ? 'Kalimat Contoh' : 'Example Sentence'}
                    </label>
                    <select
                      value={fieldMapping.example || ''}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, example: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm"
                    >
                      <option value="">{appLanguage === 'Bahasa Indonesia' ? 'Tidak ada' : 'None'}</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia' ? 'Folder/Kategori' : 'Folder/Category'}
                    </label>
                    <select
                      value={fieldMapping.folder || ''}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, folder: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm"
                    >
                      <option value="">{appLanguage === 'Bahasa Indonesia' ? 'Tidak ada' : 'None'}</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Import Options */}
                <div className="space-y-4 pt-4 border-t border-[#E5E7EB]">
                  <h3 className="text-sm font-semibold text-[#1F2937]">
                    {appLanguage === 'Bahasa Indonesia' ? 'Opsi Import' : 'Import Options'}
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-2">
                      {appLanguage === 'Bahasa Indonesia' ? 'Jika kata sudah ada:' : 'If word already exists:'}
                    </label>
                    <select
                      value={duplicateAction}
                      onChange={(e) => setDuplicateAction(e.target.value as 'skip' | 'update')}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFB800] bg-white text-[#1F2937] text-sm"
                    >
                      <option value="skip">{appLanguage === 'Bahasa Indonesia' ? 'Lewati (Skip)' : 'Skip'}</option>
                      <option value="update">{appLanguage === 'Bahasa Indonesia' ? 'Perbarui dengan data baru' : 'Update with new data'}</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="stripHtml"
                      checked={stripHtml}
                      onChange={(e) => setStripHtml(e.target.checked)}
                      className="w-4 h-4 text-[#FFB800] border-gray-300 rounded focus:ring-[#FFB800]"
                    />
                    <label htmlFor="stripHtml" className="text-sm text-[#1F2937]">
                      {appLanguage === 'Bahasa Indonesia'
                        ? 'Bersihkan tag HTML (untuk file dari Anki)'
                        : 'Strip HTML tags (for Anki files)'}
                    </label>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsCSVMappingModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-[#E5E7EB] text-[#1F2937] rounded-xl hover:bg-[#F8F9FA] transition-all duration-200 text-sm font-medium"
                  >
                    {appLanguage === 'Bahasa Indonesia' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleConfirmCSVImport}
                    className="flex-1 px-4 py-2 bg-[#FFB800] hover:bg-[#E6A600] text-white rounded-xl transition-all duration-200 text-sm font-medium shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]"
                  >
                    {appLanguage === 'Bahasa Indonesia' ? 'Impor' : 'Import'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Migration Modal - DISABLED (Supabase is the only data source now) */}

      {/* Bottom Navigation */}
      <BottomNavigationBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        appLanguage={appLanguage}
        dueReviewCount={dueReviewCount}
      />
    </div >
  );
}

// End of file
