# Migration: Add Source Language Column to Word Bank

Untuk mendukung aplikasi Polyglot, kita perlu kolom eksplisit yang mencatat bahasa asal dari kata yang disimpan (misal: "English", "Korean", "Japanese").

Silakan jalankan SQL ini di **SQL Editor** Supabase Anda:

```sql
-- 1. Tambahkan kolom source_language ke tabel word_bank
ALTER TABLE public.word_bank 
ADD COLUMN source_language TEXT DEFAULT 'Korean'; 
-- Default 'Korean' agar data lama tidak error/kosong. 
-- Anda bisa ganti 'Unknown' jika lebih suka.

-- 2. (Opsional) Indexing agar filtering per bahasa cepat
CREATE INDEX idx_word_bank_source_lang ON public.word_bank(user_id, source_language);
```

Setelah ini dijalankan, tabel `word_bank` siap menyimpan data bahasa!
