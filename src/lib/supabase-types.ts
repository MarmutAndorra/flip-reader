// Database types for Supabase - SKEMA SUPER LENGKAP
// Kolom: word, definition, part_of_speech, grammar_note, example, example_translation,
// original_sentence, original_sentence_translation, memorization_status, interval, 
// ease_factor, next_review, saved_at, is_favorite, folder_name, notes

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      word_bank: {
        Row: {
          id: string;
          user_id: string;
          word: string;                        // Kata yang disimpan
          definition: string;
          part_of_speech: string | null;
          grammar_note: string | null;
          example: string | null;              // Contoh kalimat
          example_translation: string | null;
          original_sentence: string | null;
          original_sentence_translation: string | null;
          saved_at: string;
          folder_name: string | null;          // Nama folder
          is_favorite: boolean;
          memorization_status: string | null;  // Status hafalan
          interval: number;
          ease_factor: number;                 // Ease factor untuk SRS
          next_review: string | null;          // Tanggal review berikutnya
          notes: string | null;                // Catatan tambahan
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          word: string;
          definition: string;
          part_of_speech?: string | null;
          grammar_note?: string | null;
          example?: string | null;
          example_translation?: string | null;
          original_sentence?: string | null;
          original_sentence_translation?: string | null;
          saved_at?: string;
          folder_name?: string | null;
          is_favorite?: boolean;
          memorization_status?: string | null;
          interval?: number;
          ease_factor?: number;
          next_review?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          word?: string;
          definition?: string;
          part_of_speech?: string | null;
          grammar_note?: string | null;
          example?: string | null;
          example_translation?: string | null;
          original_sentence?: string | null;
          original_sentence_translation?: string | null;
          saved_at?: string;
          folder_name?: string | null;
          is_favorite?: boolean;
          memorization_status?: string | null;
          interval?: number;
          ease_factor?: number;
          next_review?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      vocab_sets: {
        Row: {
          id: string;
          user_id: string;
          set_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          set_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          set_id?: string;
          name?: string;
          created_at?: string;
        };
      };
      daily_stats: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          count?: number;
          created_at?: string;
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          app_language: string | null;
          target_language: string | null;
          has_migrated_local_data: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          app_language?: string | null;
          target_language?: string | null;
          has_migrated_local_data?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          app_language?: string | null;
          target_language?: string | null;
          has_migrated_local_data?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
