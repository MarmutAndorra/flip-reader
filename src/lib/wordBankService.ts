import { supabase } from './supabase';

// Types matching the app's existing structure
export interface WordItem {
  term: string;
  definition: string;
  partOfSpeech: string;
  grammarNote?: string;
  example?: string;
  exampleTranslation?: string;
  originalSentence?: string;
  originalSentenceTranslation?: string;
  savedAt: string;
  setId?: string;  // Maps to folder_name in DB
  isFavorite?: boolean;
  memorizationStatus?: 'known' | 'unknown' | 'well-known' | 'mastered' | 'learning' | null;  // Maps to srs_level in DB
  interval?: number;
  easeFactor?: number;
  nextReview?: string;
  notes?: string;
}

export interface VocabSet {
  id: string;
  name: string;
}

// =============================================
// WORD BANK OPERATIONS
// =============================================
// SKEMA DATABASE SUPER LENGKAP:
// word, definition, part_of_speech, grammar_note, example, example_translation,
// original_sentence, original_sentence_translation, memorization_status, interval, 
// ease_factor, next_review, saved_at, is_favorite, folder_name, notes

// Fetch all words for the current user - returns [] if no data
export async function fetchWords(userId: string): Promise<WordItem[]> {
  try {
    const { data, error } = await supabase
      .from('word_bank')
      .select('*')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      // Only warn for unexpected errors
      if (error.code !== 'PGRST116') {
        console.warn('Note: Words fetch issue:', error.message);
      }
      return [];
    }

    // Return empty array if no data (normal for new users)
    if (!data || data.length === 0) {
      return [];
    }

    // Convert DB columns to app fields
    return data.map(row => ({
      term: row.word,                                     // DB: word → App: term
      definition: row.definition,
      partOfSpeech: row.part_of_speech || '',
      grammarNote: row.grammar_note || '',
      example: row.example || '',
      exampleTranslation: row.example_translation || '',
      originalSentence: row.original_sentence || '',
      originalSentenceTranslation: row.original_sentence_translation || '',
      savedAt: row.saved_at,
      setId: row.folder_name || 'uncategorized',          // DB: folder_name → App: setId
      isFavorite: row.is_favorite || false,
      memorizationStatus: row.memorization_status || null, // DB: memorization_status
      interval: row.interval || 0,
      easeFactor: row.ease_factor || 2.5,
      nextReview: row.next_review || undefined,
      notes: row.notes || '',
    }));
  } catch {
    // Silent fail - return empty array
    return [];
  }
}

// Save a new word
export async function saveWord(userId: string, word: WordItem): Promise<void> {
  console.log('wordBankService.saveWord called with:', { userId, word: word.term });
  
  // Mapping App fields → DB columns (SKEMA SUPER LENGKAP)
  const insertData = {
    user_id: userId,
    word: word.term,                                    // App: term → DB: word
    definition: word.definition,
    part_of_speech: word.partOfSpeech || null,
    grammar_note: word.grammarNote || null,
    example: word.example || null,
    example_translation: word.exampleTranslation || null,
    original_sentence: word.originalSentence || null,
    original_sentence_translation: word.originalSentenceTranslation || null,
    saved_at: word.savedAt || new Date().toISOString(),
    folder_name: word.setId || 'uncategorized',         // App: setId → DB: folder_name
    is_favorite: word.isFavorite || false,
    memorization_status: word.memorizationStatus || null, // App: memorizationStatus → DB: memorization_status
    interval: word.interval || 0,
    ease_factor: word.easeFactor || 2.5,
    next_review: word.nextReview || null,
    notes: word.notes || null,
  };
  
  console.log('Inserting to Supabase:', insertData);
  
  const { data, error } = await supabase
    .from('word_bank')
    .upsert(insertData, {
      onConflict: 'user_id,word',  // Conflict key: user_id + word
    })
    .select();

  if (error) {
    console.error('Error dari Supabase (saveWord):', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw error;
  }
  
  console.log('Successfully saved to Supabase:', data);
}

// Update a word
export async function updateWord(userId: string, term: string, updates: Partial<WordItem>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  
  if (updates.definition !== undefined) updateData.definition = updates.definition;
  if (updates.partOfSpeech !== undefined) updateData.part_of_speech = updates.partOfSpeech;
  if (updates.grammarNote !== undefined) updateData.grammar_note = updates.grammarNote;
  if (updates.example !== undefined) updateData.example = updates.example;
  if (updates.exampleTranslation !== undefined) updateData.example_translation = updates.exampleTranslation;
  if (updates.originalSentence !== undefined) updateData.original_sentence = updates.originalSentence;
  if (updates.originalSentenceTranslation !== undefined) updateData.original_sentence_translation = updates.originalSentenceTranslation;
  if (updates.setId !== undefined) updateData.folder_name = updates.setId;       // DB: folder_name
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;
  if (updates.memorizationStatus !== undefined) updateData.memorization_status = updates.memorizationStatus;  // DB: memorization_status
  if (updates.easeFactor !== undefined) updateData.ease_factor = updates.easeFactor;
  if (updates.interval !== undefined) updateData.interval = updates.interval;
  if (updates.nextReview !== undefined) updateData.next_review = updates.nextReview;
  if (updates.notes !== undefined) updateData.notes = updates.notes;

  const { error } = await supabase
    .from('word_bank')
    .update(updateData)
    .eq('user_id', userId)
    .eq('word', term);  // DB: word

  if (error) {
    console.error('Error updating word:', error);
    throw error;
  }
}

// Delete a word
export async function deleteWord(userId: string, term: string): Promise<void> {
  const { error } = await supabase
    .from('word_bank')
    .delete()
    .eq('user_id', userId)
    .eq('word', term);  // DB: word

  if (error) {
    console.error('Error deleting word:', error);
    throw error;
  }
}

// Delete multiple words
export async function deleteWords(userId: string, terms: string[]): Promise<void> {
  const { error } = await supabase
    .from('word_bank')
    .delete()
    .eq('user_id', userId)
    .in('word', terms);  // DB: word

  if (error) {
    console.error('Error deleting words:', error);
    throw error;
  }
}

// Move words to a different folder
export async function moveWordsToSet(userId: string, terms: string[], setId: string): Promise<void> {
  const { error } = await supabase
    .from('word_bank')
    .update({ folder_name: setId })  // DB: folder_name
    .eq('user_id', userId)
    .in('word', terms);  // DB: word

  if (error) {
    console.error('Error moving words:', error);
    throw error;
  }
}

// Toggle favorite status
export async function toggleFavorite(userId: string, term: string, isFavorite: boolean): Promise<void> {
  const { error } = await supabase
    .from('word_bank')
    .update({ is_favorite: isFavorite })
    .eq('user_id', userId)
    .eq('word', term);  // DB: word

  if (error) {
    console.error('Error toggling favorite:', error);
    throw error;
  }
}

// Update SRS (Spaced Repetition System) data
export async function updateSRS(
  userId: string,
  term: string,
  interval: number,
  nextReview: string,
  memorizationStatus: string,
  easeFactor?: number
): Promise<void> {
  const { error } = await supabase
    .from('word_bank')
    .update({
      interval,
      next_review: nextReview,
      memorization_status: memorizationStatus,  // DB: memorization_status
      ease_factor: easeFactor || 2.5,
    })
    .eq('user_id', userId)
    .eq('word', term);  // DB: word

  if (error) {
    console.error('Error updating SRS:', error);
    throw error;
  }
}

// =============================================
// VOCAB SETS OPERATIONS
// =============================================

// Fetch all vocab sets for the current user - returns [] if no data
export async function fetchVocabSets(userId: string): Promise<VocabSet[]> {
  try {
    const { data, error } = await supabase
      .from('vocab_sets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      // Only warn for unexpected errors
      if (error.code !== 'PGRST116') {
        console.warn('Note: Vocab sets fetch issue:', error.message);
      }
      return [];
    }

    // Return empty array if no data (normal for new users)
    if (!data || data.length === 0) {
      return [];
    }

    return data.map(row => ({
      id: row.set_id,
      name: row.name,
    }));
  } catch {
    // Silent fail - return empty array
    return [];
  }
}

// Create a new vocab set - uses upsert to avoid duplicate errors
export async function createVocabSet(userId: string, setId: string, name: string): Promise<void> {
  try {
    // Use upsert to handle case where set already exists (no error on duplicate)
    const { error } = await supabase
      .from('vocab_sets')
      .upsert({
        user_id: userId,
        set_id: setId,
        name: name,
      }, {
        onConflict: 'user_id,set_id',
        ignoreDuplicates: true, // Don't update if already exists
      });

    if (error) {
      // Check if it's a duplicate error - that's okay, ignore it
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        // Silently ignore duplicate - set already exists
        return;
      }
      console.warn('Note: Vocab set creation issue:', error.message);
    }
  } catch {
    // Silent fail - vocab set might already exist
  }
}

// Delete a vocab set
export async function deleteVocabSet(userId: string, setId: string): Promise<void> {
  const { error } = await supabase
    .from('vocab_sets')
    .delete()
    .eq('user_id', userId)
    .eq('set_id', setId);

  if (error) {
    console.error('Error deleting vocab set:', error);
    throw error;
  }
}

// Rename a vocab set
export async function renameVocabSet(userId: string, setId: string, newName: string): Promise<void> {
  const { error } = await supabase
    .from('vocab_sets')
    .update({ name: newName })
    .eq('user_id', userId)
    .eq('set_id', setId);

  if (error) {
    console.error('Error renaming vocab set:', error);
    throw error;
  }
}

// =============================================
// DAILY STATS OPERATIONS
// =============================================

// Get daily stats - returns empty object {} if no data (no error)
export async function getDailyStats(userId: string): Promise<Record<string, number>> {
  try {
    console.log('[getDailyStats] Fetching for user:', userId);
    
    const { data, error } = await supabase
      .from('daily_stats')
      .select('date, words_learned')
      .eq('user_id', userId);

    console.log('[getDailyStats] Response:', { data, error });

    if (error) {
      if (error.code !== 'PGRST116') {
        console.warn('[getDailyStats] Fetch issue:', error.message);
      }
      return {};
    }

    if (!data || data.length === 0) {
      console.log('[getDailyStats] No data found');
      return {};
    }

    const stats: Record<string, number> = {};
    data.forEach(row => {
      // Format date ke YYYY-MM-DD string
      const dateStr = typeof row.date === 'string' ? row.date.split('T')[0] : row.date;
      stats[dateStr] = row.words_learned || 0;
    });
    console.log('[getDailyStats] Returning stats:', stats);
    return stats;
  } catch (err) {
    console.error('[getDailyStats] Exception:', err);
    return {};
  }
}

// Reset daily stats for today - untuk testing
export async function resetTodayStats(userId: string): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('[resetTodayStats] Resetting stats for date:', today);
    
    const { error } = await supabase
      .from('daily_stats')
      .upsert(
        {
          user_id: userId,
          date: today,
          words_learned: 0,  // Reset ke 0
        },
        {
          onConflict: 'user_id,date',
        }
      );

    if (error) {
      console.error('[resetTodayStats] Error:', error.message, error.details, error.hint);
      return false;
    }

    console.log('[resetTodayStats] SUCCESS! Stats reset to 0 for:', today);
    return true;
  } catch (err) {
    console.error('[resetTodayStats] Exception:', err);
    return false;
  }
}

// Update daily stats (increment words_learned) - SIMPLE UPSERT
// Format tanggal: YYYY-MM-DD string only
export async function incrementDailyStats(userId: string, count: number = 1): Promise<boolean> {
  try {
    // Format tanggal YYYY-MM-DD menggunakan toISOString
    const today = new Date().toISOString().split('T')[0];
    console.log('[incrementDailyStats] Date:', today, 'Count:', count, 'UserId:', userId);
    
    // Step 1: Cek apakah sudah ada data untuk hari ini
    const { data: existing, error: fetchError } = await supabase
      .from('daily_stats')
      .select('words_learned')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[incrementDailyStats] Fetch error:', fetchError.message, fetchError.details, fetchError.hint);
    }

    // Hitung total baru
    const currentCount = existing?.words_learned || 0;
    const newCount = currentCount + count;
    
    console.log('[incrementDailyStats] Current:', currentCount, '→ New:', newCount);

    // Step 2: Upsert ke Supabase
    const { error: upsertError } = await supabase
      .from('daily_stats')
      .upsert(
        {
          user_id: userId,
          date: today,  // Format: YYYY-MM-DD string
          words_learned: newCount,
        },
        {
          onConflict: 'user_id,date',  // Unique constraint
        }
      );

    if (upsertError) {
      console.error('[incrementDailyStats] Detail:', upsertError.message, upsertError.details, upsertError.hint);
      return false;
    }

    console.log('[incrementDailyStats] SUCCESS! Saved:', newCount, 'for date:', today);
    
    // Hapus localStorage untuk menghentikan pop-up migrasi
    if (typeof window !== 'undefined') {
      localStorage.removeItem('word_bank');
      localStorage.removeItem('my-word-bank');
      localStorage.removeItem('daily-stats');
    }
    
    return true;
  } catch (err) {
    console.error('[incrementDailyStats] Exception:', err);
    return false;
  }
}

// =============================================
// USER SETTINGS OPERATIONS
// =============================================

// Get user settings - returns null if no settings exist (normal for new users)
export async function getUserSettings(userId: string): Promise<{
  appLanguage: string;
  targetLanguage: string;
  hasMigratedLocalData: boolean;
} | null> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(); // Use maybeSingle() to avoid error when no row exists

    // If error (and not "no rows" error), silently return null
    if (error && error.code !== 'PGRST116') {
      // Don't log - just return null, caller will use defaults
      return null;
    }

    // If no data, return null (normal for new users)
    if (!data) return null;

    return {
      appLanguage: data.app_language || 'Bahasa Indonesia',
      targetLanguage: data.target_language || 'Indonesian',
      hasMigratedLocalData: data.has_migrated_local_data || false,
    };
  } catch {
    // Silent fail - return null, caller will use defaults
    return null;
  }
}

// Save user settings - UPSERT: update if exists, insert if not
export async function saveUserSettings(
  userId: string,
  settings: {
    appLanguage?: string;
    targetLanguage?: string;
    hasMigratedLocalData?: boolean;
  }
): Promise<void> {
  try {
    // First, check if settings already exist for this user
    const { data: existing, error: fetchError } = await supabase
      .from('user_settings')
      .select('app_language, target_language, has_migrated_local_data')
      .eq('user_id', userId)
      .maybeSingle(); // Use maybeSingle() to avoid error when no row exists

    // Ignore fetch errors - we'll just use defaults
    if (fetchError && fetchError.code !== 'PGRST116') {
      // Only log unexpected errors, not "no rows" errors
      console.warn('Note: Could not fetch existing settings, will create new:', fetchError.message);
    }

    // Build the data object - merge with existing or use defaults
    const upsertData = {
      user_id: userId,
      app_language: settings.appLanguage ?? existing?.app_language ?? 'Bahasa Indonesia',
      target_language: settings.targetLanguage ?? existing?.target_language ?? 'Indonesian',
      has_migrated_local_data: settings.hasMigratedLocalData ?? existing?.has_migrated_local_data ?? false,
    };

    // Perform upsert
    const { error: upsertError } = await supabase
      .from('user_settings')
      .upsert(upsertData, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      // Silent fail - don't break the app for settings errors
      console.warn('Note: Settings save issue:', upsertError.message);
    }
  } catch {
    // Silent fail - settings errors should not break the app
  }
}

// =============================================
// MIGRATION FROM LOCALSTORAGE
// =============================================

// Check if there's local data to migrate
export function hasLocalData(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const wordBank = localStorage.getItem('my-word-bank');
    const vocabSets = localStorage.getItem('vocab-sets');
    
    const hasWords = wordBank ? JSON.parse(wordBank).length > 0 : false;
    const hasSets = vocabSets ? JSON.parse(vocabSets).length > 0 : false;
    
    return hasWords || hasSets;
  } catch {
    return false;
  }
}

// Get local data counts
export function getLocalDataCounts(): { words: number; sets: number } {
  if (typeof window === 'undefined') return { words: 0, sets: 0 };
  
  try {
    const wordBank = localStorage.getItem('my-word-bank');
    const vocabSets = localStorage.getItem('vocab-sets');
    
    return {
      words: wordBank ? JSON.parse(wordBank).length : 0,
      sets: vocabSets ? JSON.parse(vocabSets).length : 0,
    };
  } catch {
    return { words: 0, sets: 0 };
  }
}

// Migrate all local data to Supabase
export async function migrateLocalDataToSupabase(userId: string): Promise<{
  migratedWords: number;
  migratedSets: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let migratedWords = 0;
  let migratedSets = 0;

  try {
    // Migrate vocab sets first
    const vocabSetsJson = localStorage.getItem('vocab-sets');
    if (vocabSetsJson) {
      const localSets = JSON.parse(vocabSetsJson) as VocabSet[];
      for (const set of localSets) {
        try {
          await createVocabSet(userId, set.id, set.name);
          migratedSets++;
        } catch (err) {
          // Ignore duplicate errors
          if (!(err as Error).message?.includes('duplicate')) {
            errors.push(`Failed to migrate set "${set.name}": ${(err as Error).message}`);
          }
        }
      }
    }

    // Migrate words
    const wordBankJson = localStorage.getItem('my-word-bank');
    if (wordBankJson) {
      const localWords = JSON.parse(wordBankJson) as WordItem[];
      for (const word of localWords) {
        try {
          await saveWord(userId, word);
          migratedWords++;
        } catch (err) {
          // Ignore duplicate errors
          if (!(err as Error).message?.includes('duplicate')) {
            errors.push(`Failed to migrate word "${word.term}": ${(err as Error).message}`);
          }
        }
      }
    }

    // Migrate daily stats
    const dailyStatsJson = localStorage.getItem('daily-stats');
    if (dailyStatsJson) {
      const localStats = JSON.parse(dailyStatsJson) as Record<string, number>;
      for (const [date, count] of Object.entries(localStats)) {
        try {
          await supabase
            .from('daily_stats')
            .upsert({
              user_id: userId,
              date: date,
              count: count,
            }, {
              onConflict: 'user_id,date',
            });
        } catch (err) {
          errors.push(`Failed to migrate stats for ${date}: ${(err as Error).message}`);
        }
      }
    }

    // Mark migration as complete
    await saveUserSettings(userId, { hasMigratedLocalData: true });

  } catch (err) {
    errors.push(`Migration error: ${(err as Error).message}`);
  }

  return { migratedWords, migratedSets, errors };
}

// Clear local data after migration - IMPORTANT: This must remove all word/vocab data
export function clearLocalData(): void {
  if (typeof window === 'undefined') return;
  
  // Remove word bank and vocab data (critical for stopping migration popup)
  localStorage.removeItem('my-word-bank');
  localStorage.removeItem('vocab-sets');
  localStorage.removeItem('daily-stats');
  
  // Also clear any alternative key names that might exist
  localStorage.removeItem('word-bank');
  localStorage.removeItem('wordBank');
  localStorage.removeItem('vocabSets');
  
  // Keep app-language and preferred-target-language as they're UI preferences
  // These are stored in Supabase anyway, so keeping them local is fine
}
