'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav from '@/components/BottomNav';
import {
  fetchWords,
  fetchVocabSets,
  toggleFavorite,
  WordItem,
  VocabSet,
} from '@/lib/wordBankService';

const langFlag: Record<string, string> = {
  Korean: '🇰🇷', Japanese: '🇯🇵', English: '🇬🇧', Indonesian: '🇮🇩', Chinese: '🇨🇳',
};

const posColor: Record<string, { bg: string; color: string }> = {
  Noun:      { bg: '#EDE9FE', color: '#5B21B6' },
  Verb:      { bg: '#D1FAE5', color: '#065F46' },
  Adjective: { bg: '#FED7AA', color: '#92400E' },
  Adverb:    { bg: '#DBEAFE', color: '#1E40AF' },
  Particle:  { bg: '#FCE7F3', color: '#9D174D' },
};
const defaultPos = { bg: '#F3F4F6', color: '#374151' };

// ── FlipCard component ──────────────────────────────────────────────────────
function FlipCard({
  word,
  onSwipeLeft,
  onSwipeRight,
  onToggleFav,
}: {
  word: WordItem;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onToggleFav: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState<'left' | 'right' | null>(null);
  const startX = useRef(0);
  const dragging = useRef(false);
  const THRESHOLD = 90;

  // Reset when word changes
  useEffect(() => {
    setFlipped(false);
    setDragX(0);
    setSwiping(null);
  }, [word.term]);

  const onStart = (x: number) => {
    dragging.current = true;
    startX.current = x;
  };
  const onMove = (x: number) => {
    if (!dragging.current) return;
    const dx = x - startX.current;
    setDragX(dx);
    setSwiping(Math.abs(dx) > 20 ? (dx > 0 ? 'right' : 'left') : null);
  };
  const onEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX > THRESHOLD) { onSwipeRight(); return; }
    if (dragX < -THRESHOLD) { onSwipeLeft(); return; }
    setDragX(0);
    setSwiping(null);
  };

  const pos = posColor[word.partOfSpeech] ?? defaultPos;

  return (
    <div
      style={{ perspective: 1000, userSelect: 'none' }}
      onTouchStart={e => onStart(e.touches[0].clientX)}
      onTouchMove={e => onMove(e.touches[0].clientX)}
      onTouchEnd={onEnd}
      onMouseDown={e => { e.preventDefault(); onStart(e.clientX); }}
      onMouseMove={e => onMove(e.clientX)}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
    >
      {/* Swipe hint overlay */}
      {swiping && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 'var(--r-lg)', zIndex: 5,
          background: swiping === 'right' ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: swiping === 'right' ? 'flex-start' : 'flex-end',
          padding: '0 24px',
        }}>
          <span style={{ fontSize: 32 }}>{swiping === 'right' ? '✅' : '🔄'}</span>
        </div>
      )}

      {/* Card wrapper — 3D flip */}
      <div
        onClick={() => { if (Math.abs(dragX) < 8) setFlipped(f => !f); }}
        style={{
          width: '100%',
          height: 420,
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg) rotateY(${flipped ? 180 : 0}deg)`,
          transition: dragging.current ? 'none' : 'transform 0.4s cubic-bezier(0.4,0,0.2,1)',
          cursor: 'pointer',
        }}
      >
        {/* ── FRONT ── */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(0,0,0,.10)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '32px 24px',
          gap: 16,
        }}>
          {/* Favorite */}
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(); }}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, lineHeight: 1, padding: 4,
            }}
          >
            {word.isFavorite ? '⭐' : '☆'}
          </button>

          {/* Language flag */}
          <span style={{ fontSize: 28 }}>
            {langFlag[word.sourceLanguage || ''] ?? '🌍'}
          </span>

          {/* The word */}
          <p style={{
            fontSize: word.term.length > 10 ? 36 : word.term.length > 6 ? 44 : 52,
            fontWeight: 800, color: 'var(--text-1)',
            textAlign: 'center', letterSpacing: -1,
            lineHeight: 1.1,
          }}>
            {word.term}
          </p>

          {/* Part of speech badge */}
          {word.partOfSpeech && (
            <span style={{
              padding: '4px 12px', borderRadius: 'var(--r-full)',
              background: pos.bg, color: pos.color,
              fontSize: 12, fontWeight: 600,
            }}>
              {word.partOfSpeech}
            </span>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
            Tap untuk lihat arti
          </p>
        </div>

        {/* ── BACK ── */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(0,0,0,.10)',
          display: 'flex', flexDirection: 'column',
          padding: '20px 22px',
          overflowY: 'auto',
        }}>
          {/* Favorite */}
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(); }}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 20, padding: 4,
            }}
          >
            {word.isFavorite ? '⭐' : '☆'}
          </button>

          {/* Word small */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>{langFlag[word.sourceLanguage || ''] ?? '🌍'}</span>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>{word.term}</p>
            {word.partOfSpeech && (
              <span style={{
                padding: '2px 8px', borderRadius: 'var(--r-full)',
                background: pos.bg, color: pos.color,
                fontSize: 11, fontWeight: 600, marginLeft: 2,
              }}>{word.partOfSpeech}</span>
            )}
          </div>

          {/* Definition */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
              Arti
            </p>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.4 }}>
              {word.definition}
            </p>
          </div>

          {/* Grammar note */}
          {word.grammarNote && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
                Catatan Grammar
              </p>
              <p style={{
                fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic',
                borderLeft: '3px solid var(--green-400)', paddingLeft: 10,
                lineHeight: 1.5,
              }}>
                {word.grammarNote}
              </p>
            </div>
          )}

          {/* Example */}
          {word.example && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
                Contoh Kalimat
              </p>
              <div style={{
                background: 'var(--green-50)',
                borderRadius: 'var(--r-sm)',
                padding: '10px 12px',
              }}>
                <p style={{ fontSize: 13, color: 'var(--text-1)', fontStyle: 'italic', marginBottom: word.exampleTranslation ? 4 : 0 }}>
                  "{word.example}"
                </p>
                {word.exampleTranslation && (
                  <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    "{word.exampleTranslation}"
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Original sentence */}
          {word.originalSentence && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
                Kalimat Asli
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                {word.originalSentence}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════════════════════════
export default function FlashcardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [words, setWords]   = useState<WordItem[]>([]);
  const [sets, setSets]     = useState<VocabSet[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeSet, setActiveSet]     = useState<string>('all');

  const [idx, setIdx]               = useState(0);
  const [knownIds, setKnownIds]     = useState<string[]>([]);
  const [unknownIds, setUnknownIds] = useState<string[]>([]);
  const [done, setDone]             = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setDataLoading(true);
      const [ws, ss] = await Promise.all([fetchWords(user.id), fetchVocabSets(user.id)]);
      setWords(ws);
      setSets(ss);
      setDataLoading(false);
    })();
  }, [user]);

  const deck = activeSet === 'all'
    ? words
    : activeSet === 'favorites'
    ? words.filter(w => w.isFavorite)
    : words.filter(w => w.setId === activeSet);

  const resetSession = useCallback(() => {
    setIdx(0); setKnownIds([]); setUnknownIds([]); setDone(false);
  }, []);

  useEffect(() => { resetSession(); }, [activeSet, resetSession]);

  const advance = () => {
    if (idx + 1 >= deck.length) setDone(true);
    else setIdx(i => i + 1);
  };

  const handleKnown = () => {
    setKnownIds(p => [...p, deck[idx].term]);
    advance();
  };
  const handleUnknown = () => {
    setUnknownIds(p => [...p, deck[idx].term]);
    advance();
  };
  const handleFav = async () => {
    if (!user) return;
    const w = deck[idx];
    const next = !w.isFavorite;
    await toggleFavorite(user.id, w.term, next);
    setWords(prev => prev.map(x => x.term === w.term ? { ...x, isFavorite: next } : x));
  };

  if (loading || !user) return null;

  const current = deck[idx];
  const progress = deck.length > 0 ? ((knownIds.length + unknownIds.length) / deck.length) * 100 : 0;

  // ── Filter tabs data ──────────────────────────────────────────────────────
  const filterTabs = [
    { id: 'all', label: '📚 Semua' },
    { id: 'favorites', label: '⭐ Favorit' },
    ...sets.map(s => ({ id: s.id, label: `📁 ${s.name}` })),
  ];

  return (
    <div className="page" style={{ background: 'var(--cloud)' }}>

      {/* Header */}
      <header style={{ padding: '56px 20px 12px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--green-900)', letterSpacing: -0.3 }}>
          Flashcard 🧠
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
          Geser kanan = hafal · kiri = ulangi · tap kartu = balik
        </p>
      </header>

      {/* Folder filter pills */}
      <div style={{
        display: 'flex', gap: 8,
        padding: '0 20px 16px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {filterTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSet(tab.id)}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              borderRadius: 'var(--r-full)',
              border: activeSet === tab.id ? 'none' : '1px solid var(--border)',
              background: activeSet === tab.id ? 'var(--green-800)' : 'var(--surface)',
              color: activeSet === tab.id ? 'white' : 'var(--text-2)',
              fontSize: 13, fontWeight: activeSet === tab.id ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 20px' }}>

        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)', fontSize: 14 }}>
            Memuat...
          </div>

        ) : deck.length === 0 ? (
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)',
            padding: '52px 24px', textAlign: 'center',
            border: '1.5px dashed var(--border)',
          }}>
            <p style={{ fontSize: 40, marginBottom: 14 }}>🃏</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
              {activeSet === 'favorites' ? 'Belum ada kata favorit' : 'Belum ada kata di sini'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {activeSet === 'favorites' ? 'Bintangi kata di Library' : 'Buka Reader untuk mulai simpan kata'}
            </p>
          </div>

        ) : done ? (
          /* Session complete */
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            padding: '40px 24px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 52, marginBottom: 12 }}>🎉</p>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>Sesi selesai!</h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 28 }}>
              {deck.length} kata sudah di-review
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 28 }}>
              <div style={{ background: '#D1FAE5', borderRadius: 'var(--r-md)', padding: '16px 24px', minWidth: 90 }}>
                <p style={{ fontSize: 34, fontWeight: 800, color: '#065F46', lineHeight: 1 }}>{knownIds.length}</p>
                <p style={{ fontSize: 12, color: '#065F46', fontWeight: 600, marginTop: 4 }}>✅ Hafal</p>
              </div>
              <div style={{ background: '#FEF3C7', borderRadius: 'var(--r-md)', padding: '16px 24px', minWidth: 90 }}>
                <p style={{ fontSize: 34, fontWeight: 800, color: '#92400E', lineHeight: 1 }}>{unknownIds.length}</p>
                <p style={{ fontSize: 12, color: '#92400E', fontWeight: 600, marginTop: 4 }}>🔄 Perlu ulangi</p>
              </div>
            </div>

            <button
              onClick={resetSession}
              style={{
                width: '100%', padding: '15px',
                borderRadius: 'var(--r-md)',
                background: 'var(--green-800)', color: 'white',
                border: 'none', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              🔁 Ulangi sesi
            </button>

            {unknownIds.length > 0 && (
              <button
                onClick={() => {
                  const retry = words.filter(w => unknownIds.includes(w.term));
                  setWords(prev => {
                    // reorder so unknowns are first — but actually we just reset
                    return prev;
                  });
                  setIdx(0);
                  setKnownIds([]);
                  setUnknownIds([]);
                  setDone(false);
                  // filter to only unknown
                  setActiveSet('__retry__');
                }}
                style={{
                  width: '100%', padding: '13px',
                  marginTop: 10,
                  borderRadius: 'var(--r-md)',
                  background: '#FEF3C7',
                  color: '#92400E',
                  border: '1px solid #FDE68A',
                  fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                🎯 Ulangi yang belum hafal ({unknownIds.length})
              </button>
            )}
          </div>

        ) : (
          /* Active session */
          <>
            {/* Progress */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
                <span>{idx + 1} / {deck.length}</span>
                <span style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: '#065F46', fontWeight: 600 }}>✅ {knownIds.length}</span>
                  <span style={{ color: '#92400E', fontWeight: 600 }}>🔄 {unknownIds.length}</span>
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, var(--green-600), var(--green-500))',
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            {/* Card */}
            <div style={{ position: 'relative' }}>
              {current && (
                <FlipCard
                  word={current}
                  onSwipeRight={handleKnown}
                  onSwipeLeft={handleUnknown}
                  onToggleFav={handleFav}
                />
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                onClick={handleUnknown}
                style={{
                  flex: 1, padding: '14px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid #FDE68A',
                  background: '#FFFBEB',
                  color: '#92400E',
                  fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                🔄 Belum hafal
              </button>
              <button
                onClick={handleKnown}
                style={{
                  flex: 1, padding: '14px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  background: 'var(--green-800)',
                  color: 'white',
                  fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ✅ Hafal!
              </button>
            </div>

            {/* Skip */}
            <button
              onClick={advance}
              style={{
                width: '100%', marginTop: 10,
                background: 'none', border: 'none',
                fontSize: 13, color: 'var(--text-3)',
                cursor: 'pointer', padding: '8px',
                fontFamily: 'inherit',
              }}
            >
              Lewati →
            </button>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
