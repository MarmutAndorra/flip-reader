'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav from '@/components/BottomNav';
import SwipeCard from '@/components/SwipeCard';
import { fetchWords, toggleFavorite, WordItem } from '@/lib/wordBankService';

type Filter = 'all' | 'favorites';

export default function FlashcardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [words, setWords] = useState<WordItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [knownIds, setKnownIds] = useState<string[]>([]);
  const [unknownIds, setUnknownIds] = useState<string[]>([]);
  const [sessionDone, setSessionDone] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setDataLoading(true);
      const all = await fetchWords(user.id);
      setWords(all);
      setDataLoading(false);
    })();
  }, [user]);

  const deck = filter === 'favorites'
    ? words.filter(w => w.isFavorite)
    : words;

  const resetSession = useCallback(() => {
    setCurrentIndex(0);
    setKnownIds([]);
    setUnknownIds([]);
    setSessionDone(false);
  }, []);

  const handleSwipeRight = () => {
    const w = deck[currentIndex];
    if (!w) return;
    setKnownIds(prev => [...prev, w.term]);
    advance();
  };

  const handleSwipeLeft = () => {
    const w = deck[currentIndex];
    if (!w) return;
    setUnknownIds(prev => [...prev, w.term]);
    advance();
  };

  const advance = () => {
    if (currentIndex + 1 >= deck.length) {
      setSessionDone(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const handleToggleFavorite = async () => {
    if (!user) return;
    const w = deck[currentIndex];
    if (!w) return;
    const newVal = !w.isFavorite;
    await toggleFavorite(user.id, w.term, newVal);
    setWords(prev => prev.map(x => x.term === w.term ? { ...x, isFavorite: newVal } : x));
  };

  if (loading || !user) return null;

  const currentWord = deck[currentIndex];
  const progress = deck.length > 0 ? ((knownIds.length + unknownIds.length) / deck.length) * 100 : 0;

  return (
    <div className="page" style={{ background: 'var(--cloud)' }}>
      {/* Header */}
      <header style={{ padding: '56px 20px 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--green-900)', letterSpacing: -0.3 }}>
          Flashcard 🧠
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
          {deck.length} kata · geser kanan = hafal, kiri = ulangi
        </p>
      </header>

      <div style={{ padding: '0 20px' }}>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['all', 'favorites'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); resetSession(); }}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--r-full)',
                border: filter === f ? 'none' : '1px solid var(--border)',
                background: filter === f ? 'var(--green-800)' : 'var(--surface)',
                color: filter === f ? 'white' : 'var(--text-2)',
                fontSize: 13, fontWeight: filter === f ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? '📚 Semua' : '⭐ Favorit'}
            </button>
          ))}
        </div>

        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)', fontSize: 14 }}>
            Memuat...
          </div>
        ) : deck.length === 0 ? (
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)',
            padding: '48px 24px', textAlign: 'center',
            border: '1.5px dashed var(--border)',
          }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>🃏</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
              {filter === 'favorites' ? 'Belum ada kata favorit' : 'Belum ada kata tersimpan'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {filter === 'favorites' ? 'Bintangi kata di Library untuk mulai' : 'Buka Reader untuk simpan kata dulu'}
            </p>
          </div>
        ) : sessionDone ? (
          /* Session complete */
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)',
            padding: '40px 24px', textAlign: 'center',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <p style={{ fontSize: 48, marginBottom: 16 }}>🎉</p>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
              Sesi selesai!
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 28 }}>
              {deck.length} kata telah di-review
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 32 }}>
              <div style={{
                background: '#D1FAE5', borderRadius: 'var(--r-md)',
                padding: '14px 24px', textAlign: 'center',
              }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#065F46' }}>{knownIds.length}</p>
                <p style={{ fontSize: 12, color: '#065F46', fontWeight: 600 }}>✅ Hafal</p>
              </div>
              <div style={{
                background: '#FEF3C7', borderRadius: 'var(--r-md)',
                padding: '14px 24px', textAlign: 'center',
              }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#92400E' }}>{unknownIds.length}</p>
                <p style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>🔄 Perlu diulang</p>
              </div>
            </div>

            <button
              onClick={resetSession}
              style={{
                width: '100%', padding: '14px',
                borderRadius: 'var(--r-md)',
                background: 'var(--green-800)', color: 'white',
                border: 'none', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              🔁 Ulangi sesi
            </button>
          </div>
        ) : (
          /* Active session */
          <div>
            {/* Progress bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-3)' }}>
                <span>{currentIndex + 1} / {deck.length}</span>
                <span>{knownIds.length} hafal · {unknownIds.length} ulangi</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 4 }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'var(--green-600)',
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            {/* SwipeCard */}
            {currentWord && (
              <SwipeCard
                word={currentWord}
                appLanguage="Bahasa Indonesia"
                onSwipeRight={handleSwipeRight}
                onSwipeLeft={handleSwipeLeft}
                onToggleFavorite={handleToggleFavorite}
              />
            )}

            {/* Manual buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                onClick={handleSwipeLeft}
                style={{
                  flex: 1, padding: '13px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid #FDE68A',
                  background: '#FFFBEB',
                  color: '#92400E',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                🔄 Ulangi
              </button>
              <button
                onClick={handleSwipeRight}
                style={{
                  flex: 1, padding: '13px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  background: 'var(--green-800)',
                  color: 'white',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✅ Hafal
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
