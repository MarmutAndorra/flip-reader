# Supabase Setup Guide for Flip Reader

## 1. Buat Project Supabase

1. Buka https://supabase.com dan buat akun (gratis)
2. Klik "New Project" dan isi:
   - Project Name: `flip-reader` (atau nama lain)
   - Database Password: (catat password ini)
   - Region: Pilih yang terdekat (Singapore untuk Indonesia)
3. Tunggu project selesai dibuat (~2 menit)

## 2. Dapatkan API Keys

1. Di dashboard Supabase, pergi ke **Settings** > **API**
2. Catat dua nilai ini:
   - **Project URL** (contoh: `https://xxxx.supabase.co`)
   - **anon public** key (mulai dengan `eyJ...`)

## 3. Setup Environment Variables

Buat atau edit file `.env.local` di root project:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# API Key untuk translation (sudah ada)
GOOGLE_TRANSLATE_API_KEY=your-existing-key
```

## 4. Setup Database

1. Di dashboard Supabase, pergi ke **SQL Editor**
2. Buka file `supabase/schema.sql` di project ini
3. Copy semua isi file dan paste ke SQL Editor
4. Klik **Run** untuk menjalankan

Ini akan membuat:
- Tabel `word_bank` untuk menyimpan kosakata
- Tabel `vocab_sets` untuk folder/kategori
- Tabel `daily_stats` untuk statistik harian
- Tabel `user_settings` untuk pengaturan user
- Row Level Security (RLS) agar data user aman

## 5. Setup Authentication

1. Pergi ke **Authentication** > **Providers**
2. Pastikan **Email** sudah enabled (default)
3. (Opsional) Atur **Site URL** di Settings jika sudah deploy:
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `https://your-domain.com/*`

## 6. Test

1. Jalankan `npm run dev`
2. Buka http://localhost:3000
3. Klik ikon Settings (gear) > "Masuk / Daftar"
4. Daftar akun baru dengan email
5. Cek email untuk verifikasi (cek folder Spam juga)
6. Login dan data akan tersimpan di cloud!

## Fitur yang Tersedia

### Untuk User yang Login:
- Data tersimpan di Supabase (cloud)
- Bisa akses dari device manapun
- Migrasi otomatis dari localStorage ke cloud
- Data aman dengan Row Level Security

### Untuk User yang Tidak Login:
- Bisa tetap pakai aplikasi
- Data tersimpan di localStorage (browser)
- Data tidak sync antar device

## Troubleshooting

### "Invalid API key"
- Pastikan environment variables sudah benar
- Restart development server (`npm run dev`)

### "User not found" saat login
- Cek apakah email sudah diverifikasi
- Cek folder Spam untuk email verifikasi

### Data tidak muncul setelah login
- Pastikan sudah menjalankan SQL schema
- Cek Console browser untuk error

### RLS Policy Error
- Pastikan sudah menjalankan semua SQL termasuk policy
- User harus authenticated untuk CRUD

## Struktur Database

```
word_bank
├── id (UUID, primary key)
├── user_id (UUID, foreign key ke auth.users)
├── term (text)
├── definition (text)
├── part_of_speech (text)
├── grammar_note (text)
├── example (text)
├── example_translation (text)
├── original_sentence (text)
├── original_sentence_translation (text)
├── saved_at (timestamp)
├── set_id (text, default: 'uncategorized')
├── is_favorite (boolean)
├── memorization_status (text)
├── interval (integer)
├── next_review (date)
├── created_at (timestamp)
└── updated_at (timestamp)

vocab_sets
├── id (UUID, primary key)
├── user_id (UUID)
├── set_id (text, unique per user)
├── name (text)
└── created_at (timestamp)

daily_stats
├── id (UUID, primary key)
├── user_id (UUID)
├── date (date, unique per user)
├── count (integer)
└── created_at (timestamp)

user_settings
├── id (UUID, primary key)
├── user_id (UUID, unique)
├── app_language (text)
├── target_language (text)
├── has_migrated_local_data (boolean)
├── created_at (timestamp)
└── updated_at (timestamp)
```
