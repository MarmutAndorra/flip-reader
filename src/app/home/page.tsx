'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav from '@/components/BottomNav';
import { fetchWords } from '@/lib/wordBankService';
import Link from 'next/link';

export default function HomePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [wordCount, setWordCount] = useState(0);
  const [recentWords, setRecentWords] = useState<{ term: string; definition: string; sourceLanguage?: string }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setDataLoading(true);
      const words = await fetchWords(user.id);
      setWordCount(words.length);
      setRecentWords(words.slice(0, 4).map(w => ({
        term: w.term,
        definition: w.definition,
        sourceLanguage: w.sourceLanguage,
      })));
      setDataLoading(false);
    })();
  }, [user]);

  if (loading || !user) return null;

  const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Kamu';
  const avatarUrl = user.user_metadata?.avatar_url;

  const langFlag: Record<string, string> = {
    Korean: '🇰🇷', Japanese: '🇯🇵', English: '🇬🇧', Indonesian: '🇮🇩',
  };

  return (
    <div className="page" style={{ background: 'var(--cloud)' }}>
      {/* Header */}
      <header style={{
        padding: '56px 20px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2 }}>Selamat datang 👋</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--green-900)', letterSpacing: -0.3 }}>
            {firstName}
          </h1>
        </div>
        <button
          onClick={async () => { await signOut(); router.replace('/'); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 0, padding: 0,
          }}
          title="Keluar"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar"
              style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--green-200)' }}
            />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--green-100)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--green-800)',
              border: '2px solid var(--green-200)',
            }}>
              {firstName[0]?.toUpperCase()}
            </div>
          )}
        </button>
      </header>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats Card */}
        <div style={{
          background: 'linear-gradient(135deg, var(--green-800) 0%, var(--green-700) 100%)',
          borderRadius: 'var(--r-lg)',
          padding: '24px',
          color: 'white',
          boxShadow: '0 6px 24px rgba(45,106,79,.25)',
        }}>
          <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>Total kata tersimpan</p>
          <p style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
            {dataLoading ? '—' : wordCount}
          </p>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>kata di library kamu</p>

          <div style={{
            marginTop: 20,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,.15)',
            display: 'flex',
            gap: 24,
          }}>
            <div>
              <p style={{ fontSize: 11, opacity: 0.65, marginBottom: 2 }}>Hari ini</p>
              <p style={{ fontSize: 18, fontWeight: 700 }}>0</p>
            </div>
            <div>
              <p style={{ fontSize: 11, opacity: 0.65, marginBottom: 2 }}>Hafal</p>
              <p style={{ fontSize: 18, fontWeight: 700 }}>0</p>
            </div>
            <div>
              <p style={{ fontSize: 11, opacity: 0.65, marginBottom: 2 }}>Perlu review</p>
              <p style={{ fontSize: 18, fontWeight: 700 }}>0</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Link href="/reader" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)',
              borderRadius: 'var(--r-md)',
              padding: '20px 16px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--green-50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11z"/>
                  <line x1="6" y1="9" x2="18" y2="9"/>
                  <line x1="6" y1="13" x2="14" y2="13"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>Buka Reader</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Baca & simpan kata</p>
              </div>
            </div>
          </Link>

          <Link href="/flashcard" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)',
              borderRadius: 'var(--r-md)',
              padding: '20px 16px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--green-50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>
                🧠
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>Flashcard</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Review & hafal kata</p>
              </div>
            </div>
          </Link>

          <Link href="/library" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)',
              borderRadius: 'var(--r-md)',
              padding: '20px 16px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--green-50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="3" width="6" height="18" rx="1"/>
                  <rect x="14" y="3" width="6" height="18" rx="1"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>Library</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Koleksi kata kamu</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Words */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Kata Terbaru</h2>
            <Link href="/library" style={{ fontSize: 13, color: 'var(--green-700)', fontWeight: 500, textDecoration: 'none' }}>
              Lihat semua →
            </Link>
          </div>

          {dataLoading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-3)', fontSize: 14 }}>
              Memuat...
            </div>
          ) : recentWords.length === 0 ? (
            <div style={{
              background: 'var(--surface)', borderRadius: 'var(--r-md)',
              padding: '28px 20px', textAlign: 'center',
              border: '1.5px dashed var(--border)',
            }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📖</p>
              <p style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>Belum ada kata tersimpan</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Buka Reader untuk mulai belajar</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentWords.map((w, i) => (
                <div key={i} style={{
                  background: 'var(--surface)',
                  borderRadius: 'var(--r-md)',
                  padding: '14px 16px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 20 }}>
                    {langFlag[w.sourceLanguage || ''] || '🌍'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{w.term}</p>
                    <p style={{
                      fontSize: 13, color: 'var(--text-2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{w.definition}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <BottomNav />
    </div>
  );
}
