-- =============================================
-- Flip Reader - Supabase Database Schema
-- =============================================
-- Jalankan SQL ini di Supabase SQL Editor untuk membuat tabel dan RLS

-- 1. Buat tabel word_bank untuk menyimpan kosakata
-- SKEMA SUPER LENGKAP
CREATE TABLE IF NOT EXISTS public.word_bank (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word TEXT NOT NULL,                    -- Kata yang disimpan
    definition TEXT NOT NULL,
    part_of_speech TEXT,
    grammar_note TEXT,
    example TEXT,                          -- Contoh kalimat
    example_translation TEXT,
    original_sentence TEXT,
    original_sentence_translation TEXT,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    folder_name TEXT DEFAULT 'uncategorized',  -- Nama folder
    is_favorite BOOLEAN DEFAULT FALSE,
    memorization_status TEXT CHECK (memorization_status IN ('known', 'unknown', 'well-known', 'mastered', 'learning')),  -- Status hafalan
    interval INTEGER DEFAULT 0,
    ease_factor DECIMAL(3,2) DEFAULT 2.50,     -- Ease factor untuk SRS
    next_review DATE,                          -- Tanggal review berikutnya
    notes TEXT,                                -- Catatan tambahan
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: satu user tidak bisa punya kata yang sama
    UNIQUE(user_id, word)
);

-- 2. Buat tabel vocab_sets untuk menyimpan folder/set kosakata
CREATE TABLE IF NOT EXISTS public.vocab_sets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: satu user tidak bisa punya set_id yang sama
    UNIQUE(user_id, set_id)
);

-- 3. Buat tabel daily_stats untuk menyimpan statistik harian
CREATE TABLE IF NOT EXISTS public.daily_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: satu user hanya punya satu record per hari
    UNIQUE(user_id, date)
);

-- 4. Buat tabel user_settings untuk menyimpan pengaturan user
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    app_language TEXT DEFAULT 'Bahasa Indonesia',
    target_language TEXT DEFAULT 'Indonesian',
    has_migrated_local_data BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================
-- Aktifkan RLS untuk semua tabel

-- RLS untuk word_bank
ALTER TABLE public.word_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own words" ON public.word_bank
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own words" ON public.word_bank
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own words" ON public.word_bank
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own words" ON public.word_bank
    FOR DELETE USING (auth.uid() = user_id);

-- RLS untuk vocab_sets
ALTER TABLE public.vocab_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sets" ON public.vocab_sets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sets" ON public.vocab_sets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sets" ON public.vocab_sets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sets" ON public.vocab_sets
    FOR DELETE USING (auth.uid() = user_id);

-- RLS untuk daily_stats
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stats" ON public.daily_stats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stats" ON public.daily_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stats" ON public.daily_stats
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stats" ON public.daily_stats
    FOR DELETE USING (auth.uid() = user_id);

-- RLS untuk user_settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Function untuk auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger untuk word_bank
CREATE TRIGGER update_word_bank_updated_at
    BEFORE UPDATE ON public.word_bank
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger untuk user_settings
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INDEXES untuk performa query
-- =============================================

CREATE INDEX IF NOT EXISTS idx_word_bank_user_id ON public.word_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_word_bank_set_id ON public.word_bank(set_id);
CREATE INDEX IF NOT EXISTS idx_word_bank_next_review ON public.word_bank(next_review);
CREATE INDEX IF NOT EXISTS idx_vocab_sets_user_id ON public.vocab_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_id_date ON public.daily_stats(user_id, date);

-- =============================================
-- Catatan Setup Supabase:
-- =============================================
-- 1. Buka https://supabase.com dan buat project baru
-- 2. Pergi ke Settings > API untuk mendapatkan:
--    - Project URL (NEXT_PUBLIC_SUPABASE_URL)
--    - anon public key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
-- 3. Tambahkan ke file .env.local:
--    NEXT_PUBLIC_SUPABASE_URL=your_project_url
--    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
-- 4. Pergi ke SQL Editor dan jalankan script ini
-- 5. Pergi ke Authentication > Providers dan aktifkan Email
-- =============================================
