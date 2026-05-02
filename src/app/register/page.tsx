'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { signUp, user } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak cocok.');
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(email, password);
      if (error) {
        if (error.message.includes('already registered')) {
          setError('Email sudah terdaftar. Silakan gunakan email lain atau masuk.');
        } else {
          setError(error.message);
        }
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError('Terjadi kesalahan. Silakan coba lagi.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[radial-gradient(120%_120%_at_50%_-20%,#fff4cc,transparent)] bg-[var(--lab-bg)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md lab-surface rounded-2xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--lab-ink)] mb-2">Pendaftaran Berhasil!</h2>
          <p className="text-[var(--lab-ink-muted)] mb-6">
            Kami telah mengirim email konfirmasi ke <strong>{email}</strong>. 
            Silakan cek inbox atau folder spam untuk memverifikasi akun Anda.
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-3 bg-[var(--lab-accent)] text-[#1f2328] rounded-xl font-semibold hover:bg-[var(--lab-accent-strong)] transition-all duration-200"
          >
            Kembali ke Halaman Masuk
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_50%_-20%,#fff4cc,transparent)] bg-[var(--lab-bg)] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-[var(--lab-ink)] mb-2 tracking-tight">Flip Reader 🧠</h1>
          <p className="text-[var(--lab-ink-muted)]">Daftar untuk menyimpan progres belajarmu</p>
        </div>

        {/* Register Card */}
        <div className="lab-surface rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-[var(--lab-ink)] mb-6">Buat Akun</h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-4 text-sm"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--lab-ink)] mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                required
                className="w-full px-4 py-3 border border-[var(--lab-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--lab-accent)] text-[var(--lab-ink)] text-sm transition-all duration-200 bg-[var(--lab-surface)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--lab-ink)] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  required
                className="w-full px-4 py-3 border border-[var(--lab-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--lab-accent)] text-[var(--lab-ink)] text-sm pr-12 transition-all duration-200 bg-[var(--lab-surface)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--lab-ink-muted)] hover:text-[var(--lab-ink)]"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--lab-ink)] mb-2">
                Konfirmasi Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password"
                required
                className="w-full px-4 py-3 border border-[var(--lab-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--lab-accent)] text-[var(--lab-ink)] text-sm transition-all duration-200 bg-[var(--lab-surface)]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[var(--lab-accent)] text-[#1f2328] rounded-xl font-semibold hover:bg-[var(--lab-accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_12px_24px_-18px_rgba(20,26,35,0.45)] transition-all duration-200 active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Memproses...
                </span>
              ) : (
                'Daftar'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-[var(--lab-ink-muted)]">
              Sudah punya akun?{' '}
              <Link href="/login" className="text-[var(--lab-accent-strong)] font-semibold hover:underline">
                Masuk
              </Link>
            </p>
          </div>
        </div>

        {/* Continue without login */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-[var(--lab-ink-muted)] hover:text-[var(--lab-ink)] transition-colors"
          >
            Lanjutkan tanpa masuk →
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
