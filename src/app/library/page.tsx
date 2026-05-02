'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav from '@/components/BottomNav';
import {
  fetchWords,
  fetchVocabSets,
  deleteWord,
  toggleFavorite,
  WordItem,
  VocabSet,
} from '@/lib/wordBankService';

const langFlag: Record<string, string> = {
  Korean: '🇰🇷', Japanese: '🇯🇵', English: '🇬🇧', Indonesian: '🇮🇩',
};

export default function LibraryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [words, setWords] = useState<WordItem[]>([]);
  const [sets, setSets] = useState<VocabSet[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeSet, setActiveSet] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedWord, setExpandedWord] = useState<string | null>(null);
  const [deletingWord, setDeletingWord] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setDataLoading(true);
      const [fetchedWords, fetchedSets] = await Promise.all([
        fetchWords(user.id),
        fetchVocabSets(user.id),
      ]);
      setWords(fetchedWords);
      setSets(fetchedSets);
      setDataLoading(false);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    let result = words;
    if (activeSet !== 'all') {
      result = result.filter(w => w.setId === activeSet);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        w => w.term.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q)
      );
    }
    return result;
  }, [words, activeSet, search]);

  const handleDelete = async (term: string) => {
    if (!user) return;
    setDeletingWord(term);
    try {
      await deleteWord(user.id, term);
      setWords(prev => prev.filter(w => w.term !== term));
      if (expandedWord === term) setExpandedWord(null);
    } catch (err) {
      console.error('Error deleting word:', err);
    } finally {
      setDeletingWord(null);
    }
  };

  const handleToggleFavorite = async (term: string, current: boolean) => {
    if (!user) return;
    try {
      await toggleFavorite(user.id, term, !current);
      setWords(prev => prev.map(w => w.term === term ? { ...w, isFavorite: !current } : w));
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="page" style={{ background: 'var(--cloud)' }}>
      {/* Header */}
      <header style={{ padding: '56px 20px 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--green-900)', letterSpacing: -0.3 }}>
          Library
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
          {words.length} kata tersimpan
        </p>
      </header>

      {/* Search */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Cari kata..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: 14,
              color: 'var(--text-1)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Set Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '0 20px 16px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {[{ id: 'all', name: 'Semua' }, ...sets].map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSet(s.id)}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              borderRadius: 'var(--r-full)',
              border: activeSet === s.id ? 'none' : '1px solid var(--border)',
              background: activeSet === s.id ? 'var(--green-800)' : 'var(--surface)',
              color: activeSet === s.id ? 'white' : 'var(--text-2)',
              fontSize: 13,
              fontWeight: activeSet === s.id ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Word List */}
      <div style={{ padding: '0 20px' }}>
        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 14 }}>
            Memuat...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--r-lg)',
            padding: '40px 20px',
            textAlign: 'center',
            border: '1.5px dashed var(--border)',
          }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>📚</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
              {search ? 'Kata tidak ditemukan' : 'Belum ada kata tersimpan'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {search ? 'Coba kata pencarian lain' : 'Buka Reader untuk mulai belajar'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((w) => {
              const isExpanded = expandedWord === w.term;
              return (
                <div
                  key={w.term}
                  style={{
                    background: 'var(--surface)',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  {/* Word Row */}
                  <div
                    onClick={() => setExpandedWord(isExpanded ? null : w.term)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>
                      {langFlag[w.sourceLanguage || ''] || '🌍'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>
                        {w.term}
                      </p>
                      <p style={{
                        fontSize: 13, color: 'var(--text-2)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {w.definition}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {/* Favorite button */}
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleFavorite(w.term, w.isFavorite || false); }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: w.isFavorite ? '#f59e0b' : 'var(--text-3)',
                          padding: 4,
                          display: 'flex', alignItems: 'center',
                        }}
                        title={w.isFavorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24"
                          fill={w.isFavorite ? 'currentColor' : 'none'}
                          stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                      {/* Expand chevron */}
                      <svg
                        width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="var(--text-3)" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 16px 16px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}>
                      {w.partOfSpeech && (
                        <div style={{ marginTop: 12 }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-full)',
                            background: 'var(--green-50)',
                            color: 'var(--green-800)',
                            fontSize: 12,
                            fontWeight: 500,
                          }}>
                            {w.partOfSpeech}
                          </span>
                        </div>
                      )}
                      {w.grammarNote && (
                        <p style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic' }}>
                          {w.grammarNote}
                        </p>
                      )}
                      {w.example && (
                        <div style={{
                          background: 'var(--green-50)',
                          borderRadius: 'var(--r-sm)',
                          padding: '10px 12px',
                        }}>
                          <p style={{ fontSize: 13, color: 'var(--green-900)', fontWeight: 500 }}>{w.example}</p>
                          {w.exampleTranslation && (
                            <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{w.exampleTranslation}</p>
                          )}
                        </div>
                      )}
                      {w.originalSentence && (
                        <div>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Kalimat asli
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{w.originalSentence}</p>
                          {w.originalSentenceTranslation && (
                            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{w.originalSentenceTranslation}</p>
                          )}
                        </div>
                      )}
                      {w.notes && (
                        <div>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Catatan
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{w.notes}</p>
                        </div>
                      )}

                      {/* Set badge */}
                      {w.setId && w.setId !== 'uncategorized' && (
                        <div>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-full)',
                            background: 'var(--border)',
                            color: 'var(--text-2)',
                            fontSize: 11,
                          }}>
                            📁 {sets.find(s => s.id === w.setId)?.name || w.setId}
                          </span>
                        </div>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={() => handleDelete(w.term)}
                        disabled={deletingWord === w.term}
                        style={{
                          alignSelf: 'flex-start',
                          marginTop: 4,
                          padding: '6px 14px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid #fca5a5',
                          background: '#fff5f5',
                          color: '#ef4444',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                          opacity: deletingWord === w.term ? 0.5 : 1,
                        }}
                      >
                        {deletingWord === w.term ? 'Menghapus...' : 'Hapus kata'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
