import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database
export interface WordBankItem {
  id?: string;
  user_id: string;
  term: string;
  definition: string;
  part_of_speech?: string;
  grammar_note?: string;
  example?: string;
  example_translation?: string;
  original_sentence?: string;
  original_sentence_translation?: string;
  saved_at: string;
  set_id?: string;
  is_favorite?: boolean;
  memorization_status?: 'known' | 'unknown' | 'well-known' | 'mastered' | 'learning' | null;
  interval?: number;
  next_review?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VocabSetItem {
  id?: string;
  user_id: string;
  set_id: string;
  name: string;
  created_at?: string;
}

// Helper function to convert camelCase to snake_case for database
export const toSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = obj[key];
  }
  return result;
};

// Helper function to convert snake_case to camelCase for app
export const toCamelCase = (obj: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
};
