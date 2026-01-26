# Supabase SQL Migration for Global Word Cache

Silakan jalankan perintah SQL berikut di **SQL Editor** dashboard Supabase Anda. Ini akan membuat tabel cache publik yang kita diskusikan.

```sql
-- 1. Create the global cache table
CREATE TABLE public.global_word_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    term TEXT NOT NULL,
    target_language TEXT NOT NULL DEFAULT 'Indonesian',
    data JSONB NOT NULL,
    frequency INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraint to prevent duplicate entries for same word+language
    CONSTRAINT unique_term_lang UNIQUE (term, target_language)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.global_word_cache ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Allow READ access to everyone (Public)
-- App needs to read cache even if user is not logged in yet (optional)
-- Or restrict to authenticated users only if you prefer.
CREATE POLICY "Enable read access for all users" 
ON public.global_word_cache FOR SELECT 
USING (true);

-- 4. Policy: Allow INSERT/UPDATE access only to Service Role (Backend)
-- We don't want users manipulating the global cache directly from frontend.
-- Our 'route.ts' will use the SERVICE_ROLE_KEY to write to this table.
-- So we don't strictly need a public insert policy, but RLS must be enabled.
```

### Penting: Environment Variables
Pastikan file `.env.local` Anda memiliki **Service Role Key** untuk mengizinkan backend menulis ke tabel ini (melewati RLS).

Tambahkan ini di `.env.local` jika belum ada:
```
SUPABASE_SERVICE_ROLE_KEY=eyJh... (Ambil dari Project Settings > API > service_role token)
```
Tanpa Service Role Key, backend (`route.ts`) mungkin akan gagal menyimpan cache karena aturan RLS.
