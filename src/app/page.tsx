'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function RootPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/home');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--cloud)',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '3px solid var(--green-100)',
          borderTopColor: 'var(--green-700)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (user) return null;

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--cloud)',
    }}>
      {/* Hero Section */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px 32px',
        gap: 0,
      }}>
        {/* Logo */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'linear-gradient(135deg, var(--green-800) 0%, var(--green-600) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          boxShadow: '0 8px 24px rgba(45,106,79,.3)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11z" />
            <line x1="6" y1="9" x2="18" y2="9" />
            <line x1="6" y1="13" x2="14" y2="13" />
          </svg>
        </div>

        {/* App name */}
        <h1 style={{
          fontSize: 32,
          fontWeight: 800,
          color: 'var(--green-900)',
          letterSpacing: -0.5,
          marginBottom: 8,
        }}>
          Flip Reader
        </h1>

        <p style={{
          fontSize: 16,
          color: 'var(--text-2)',
          textAlign: 'center',
          lineHeight: 1.6,
          maxWidth: 260,
          marginBottom: 48,
        }}>
          Baca, simpan kata, hafalkan — lebih cepat dari sebelumnya.
        </p>

        {/* Illustration pill badges */}
        <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: 48,
        }}>
          {['🇰🇷 Korea', '🇯🇵 Jepang', '🇬🇧 Inggris', '🇮🇩 Indonesia'].map((lang) => (
            <span key={lang} style={{
              padding: '6px 14px',
              background: 'var(--green-50)',
              border: '1px solid var(--green-100)',
              borderRadius: 'var(--r-full)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--green-800)',
            }}>
              {lang}
            </span>
          ))}
        </div>

        {/* Google Sign In Button */}
        <button
          onClick={signInWithGoogle}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '14px 24px',
            borderRadius: 'var(--r-md)',
            background: 'var(--green-800)',
            color: 'white',
            border: 'none',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: '0 4px 16px rgba(45,106,79,.3)',
          }}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="rgba(255,255,255,.85)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="rgba(255,255,255,.7)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="rgba(255,255,255,.9)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Masuk dengan Google
        </button>

        <p style={{
          marginTop: 16,
          fontSize: 12,
          color: 'var(--text-3)',
          textAlign: 'center',
        }}>
          Tidak perlu daftar. Langsung masuk dengan akun Google kamu.
        </p>
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 32px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Flip Reader © 2025
        </p>
      </div>
    </div>
  );
}
