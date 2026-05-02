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
  createVocabSet,
  renameVocabSet,
  deleteVocabSet,
  moveWordsToSet,
  WordItem,
  VocabSet,
} from '@/lib/wordBankService';

const langFlag: Record<string, string> = {
  Korean: '🇰🇷', Japanese: '🇯🇵', English: '🇬🇧', Indonesian: '🇮🇩',
};

/* ─────────── Modal (bottom sheet) ─────────── */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480,
          padding: '24px 20px 40px',
        }}
      >
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--border)', margin: '0 auto 20px',
        }} />
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

/* ─────────── Confirm dialog ─────────── */
function Confirm({
  message,
  onCancel,
  onConfirm,
  loading,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          padding: '24px',
          width: '100%', maxWidth: 320,
          boxShadow: '0 8px 32px rgba(0,0,0,.15)',
        }}
      >
        <p style={{ fontSize: 15, color: 'var(--text-1)', marginBottom: 20, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px', borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1, padding: '10px', borderRadius: 'var(--r-md)',
              border: 'none', background: '#ef4444',
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Main Page ─────────── */
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

  // Folder panel
  const [showFolderPanel, setShowFolderPanel] = useState(false);

  // Modal state: 'create' | 'rename' | null
  const [folderModal, setFolderModal] = useState<null | 'create' | 'rename'>(null);
  const [modalInput, setModalInput] = useState('');
  const [modalTarget, setModalTarget] = useState<VocabSet | null>(null); // for rename
  const [modalLoading, setModalLoading] = useState(false);

  // Confirm delete folder
  const [confirmDelete, setConfirmDelete] = useState<VocabSet | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Move word to folder
  const [movingWord, setMovingWord] = useState<string | null>(null); // term being moved
  const [moveLoading, setMoveLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
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
    if (activeSet === 'fav') {
      result = result.filter(w => w.isFavorite);
    } else if (activeSet !== 'all') {
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

  /* ── Word actions ── */
  const handleDelete = async (term: string) => {
    if (!user) return;
    setDeletingWord(term);
    try {
      await deleteWord(user.id, term);
      setWords(prev => prev.filter(w => w.term !== term));
      if (expandedWord === term) setExpandedWord(null);
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
      console.error(err);
    }
  };

  const handleMoveWord = async (term: string, targetSetId: string) => {
    if (!user) return;
    setMoveLoading(true);
    try {
      await moveWordsToSet(user.id, [term], targetSetId);
      setWords(prev => prev.map(w => w.term === term ? { ...w, setId: targetSetId } : w));
      setMovingWord(null);
    } catch (err) {
      console.error(err);
    } finally {
      setMoveLoading(false);
    }
  };

  /* ── Folder actions ── */
  const handleCreateFolder = async () => {
    if (!user || !modalInput.trim()) return;
    setModalLoading(true);
    try {
      const id = `set_${Date.now()}`;
      await createVocabSet(user.id, id, modalInput.trim());
      setSets(prev => [...prev, { id, name: modalInput.trim() }]);
      setFolderModal(null);
      setModalInput('');
    } finally {
      setModalLoading(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!user || !modalTarget || !modalInput.trim()) return;
    setModalLoading(true);
    try {
      await renameVocabSet(user.id, modalTarget.id, modalInput.trim());
      setSets(prev => prev.map(s => s.id === modalTarget.id ? { ...s, name: modalInput.trim() } : s));
      setFolderModal(null);
      setModalInput('');
      setModalTarget(null);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!user || !confirmDelete) return;
    setConfirmLoading(true);
    try {
      // Move all words in this folder to uncategorized
      const affected = words.filter(w => w.setId === confirmDelete.id).map(w => w.term);
      if (affected.length > 0) {
        await moveWordsToSet(user.id, affected, 'uncategorized');
        setWords(prev => prev.map(w =>
          w.setId === confirmDelete.id ? { ...w, setId: 'uncategorized' } : w
        ));
      }
      await deleteVocabSet(user.id, confirmDelete.id);
      setSets(prev => prev.filter(s => s.id !== confirmDelete.id));
      if (activeSet === confirmDelete.id) setActiveSet('all');
      setConfirmDelete(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  if (loading || !user) return null;

  const tabs = [
    { id: 'all', name: 'Semua' },
    { id: 'fav', name: '⭐ Favorit' },
    ...sets,
  ];

  return (
    <div className="page" style={{ background: 'var(--cloud)' }}>

      {/* ─── Header ─── */}
      <header style={{ padding: '56px 20px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--green-900)', letterSpacing: -0.3 }}>
            Library
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
            {words.length} kata tersimpan
          </p>
        </div>
        <button
          onClick={() => setShowFolderPanel(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            borderRadius: 'var(--r-md)',
            border: showFolderPanel ? 'none' : '1px solid var(--border)',
            background: showFolderPanel ? 'var(--green-800)' : 'var(--surface)',
            color: showFolderPanel ? 'white' : 'var(--text-2)',
            fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Folder
        </button>
      </header>

      {/* ─── Folder Manager Panel ─── */}
      {showFolderPanel && (
        <div style={{
          margin: '0 20px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              📁 Kelola Folder
            </p>
            <button
              onClick={() => { setModalInput(''); setFolderModal('create'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 12px',
                borderRadius: 'var(--r-full)',
                border: 'none',
                background: 'var(--green-800)',
                color: 'white',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Buat Folder
            </button>
          </div>

          {sets.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              Belum ada folder. Buat folder untuk mengatur katamu.
            </div>
          ) : (
            <div>
              {sets.map(s => {
                const count = words.filter(w => w.setId === s.id).length;
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 16, marginRight: 10 }}>📁</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{count} kata</p>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => {
                          setModalTarget(s);
                          setModalInput(s.name);
                          setFolderModal('rename');
                        }}
                        style={{
                          padding: '5px 10px', borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border)', background: 'var(--cloud)',
                          color: 'var(--text-2)', fontSize: 13, cursor: 'pointer',
                        }}
                        title="Ubah nama"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setConfirmDelete(s)}
                        style={{
                          padding: '5px 10px', borderRadius: 'var(--r-sm)',
                          border: '1px solid #fca5a5', background: '#fff5f5',
                          color: '#ef4444', fontSize: 13, cursor: 'pointer',
                        }}
                        title="Hapus folder"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Search ─── */}
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

      {/* ─── Set Tabs ─── */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '0 20px 16px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {tabs.map(s => (
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

      {/* ─── Word List ─── */}
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
              const currentSetName = w.setId && w.setId !== 'uncategorized'
                ? sets.find(s => s.id === w.setId)?.name
                : null;
              const isMoving = movingWord === w.term;

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
                    onClick={() => {
                      setExpandedWord(isExpanded ? null : w.term);
                      setMovingWord(null);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: 12, padding: '14px 16px', cursor: 'pointer',
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
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleFavorite(w.term, w.isFavorite || false); }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: w.isFavorite ? '#f59e0b' : 'var(--text-3)',
                          padding: 4, display: 'flex', alignItems: 'center',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24"
                          fill={w.isFavorite ? 'currentColor' : 'none'}
                          stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
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
                      padding: '12px 16px 16px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      {w.partOfSpeech && (
                        <span style={{
                          display: 'inline-block', alignSelf: 'flex-start',
                          padding: '2px 10px', borderRadius: 'var(--r-full)',
                          background: 'var(--green-50)', color: 'var(--green-800)',
                          fontSize: 12, fontWeight: 500,
                        }}>
                          {w.partOfSpeech}
                        </span>
                      )}

                      {w.grammarNote && (
                        <div style={{
                          borderLeft: '3px solid var(--green-300)',
                          paddingLeft: 10,
                        }}>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Catatan Grammar</p>
                          <p style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic' }}>{w.grammarNote}</p>
                        </div>
                      )}

                      {w.example && (
                        <div style={{
                          background: 'var(--green-50)',
                          borderRadius: 'var(--r-sm)', padding: '10px 12px',
                        }}>
                          <p style={{ fontSize: 11, color: 'var(--green-800)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Contoh</p>
                          <p style={{ fontSize: 13, color: 'var(--green-900)', fontWeight: 500 }}>{w.example}</p>
                          {w.exampleTranslation && (
                            <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{w.exampleTranslation}</p>
                          )}
                        </div>
                      )}

                      {w.originalSentence && (
                        <div>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Kalimat Asli</p>
                          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{w.originalSentence}</p>
                          {w.originalSentenceTranslation && (
                            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{w.originalSentenceTranslation}</p>
                          )}
                        </div>
                      )}

                      {/* Folder assignment */}
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        gap: 8, flexWrap: 'wrap',
                        paddingTop: 4, borderTop: '1px solid var(--border)',
                      }}>
                        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                          Folder:
                        </span>
                        <span style={{
                          padding: '2px 10px', borderRadius: 'var(--r-full)',
                          background: 'var(--border)', color: 'var(--text-2)',
                          fontSize: 12, fontWeight: 500,
                        }}>
                          {currentSetName ? `📁 ${currentSetName}` : '📂 Umum'}
                        </span>
                        {sets.length > 0 && (
                          <button
                            onClick={() => setMovingWord(isMoving ? null : w.term)}
                            style={{
                              padding: '2px 10px', borderRadius: 'var(--r-full)',
                              border: '1px solid var(--green-300)',
                              background: isMoving ? 'var(--green-50)' : 'transparent',
                              color: 'var(--green-800)',
                              fontSize: 12, fontWeight: 500, cursor: 'pointer',
                            }}
                          >
                            {isMoving ? 'Tutup' : 'Pindahkan →'}
                          </button>
                        )}
                      </div>

                      {/* Folder picker */}
                      {isMoving && (
                        <div style={{
                          display: 'flex', flexWrap: 'wrap', gap: 6,
                          padding: '8px 0',
                        }}>
                          <button
                            onClick={() => handleMoveWord(w.term, 'uncategorized')}
                            disabled={moveLoading}
                            style={{
                              padding: '5px 12px', borderRadius: 'var(--r-full)',
                              border: '1px solid var(--border)',
                              background: (!w.setId || w.setId === 'uncategorized') ? 'var(--green-800)' : 'var(--surface)',
                              color: (!w.setId || w.setId === 'uncategorized') ? 'white' : 'var(--text-2)',
                              fontSize: 13, cursor: 'pointer',
                            }}
                          >
                            📂 Umum
                          </button>
                          {sets.map(s => (
                            <button
                              key={s.id}
                              onClick={() => handleMoveWord(w.term, s.id)}
                              disabled={moveLoading}
                              style={{
                                padding: '5px 12px', borderRadius: 'var(--r-full)',
                                border: '1px solid var(--border)',
                                background: w.setId === s.id ? 'var(--green-800)' : 'var(--surface)',
                                color: w.setId === s.id ? 'white' : 'var(--text-2)',
                                fontSize: 13, cursor: 'pointer',
                              }}
                            >
                              📁 {s.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={() => handleDelete(w.term)}
                        disabled={deletingWord === w.term}
                        style={{
                          alignSelf: 'flex-start',
                          padding: '6px 14px', borderRadius: 'var(--r-sm)',
                          border: '1px solid #fca5a5', background: '#fff5f5',
                          color: '#ef4444', fontSize: 13, fontWeight: 500,
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

      <div style={{ height: 'var(--nav-h)' }} />
      <BottomNav />

      {/* ─── Create Folder Modal ─── */}
      {folderModal === 'create' && (
        <Modal title="Buat Folder Baru" onClose={() => setFolderModal(null)}>
          <input
            autoFocus
            type="text"
            placeholder="Nama folder..."
            value={modalInput}
            onChange={e => setModalInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            style={{
              width: '100%', padding: '12px 14px',
              borderRadius: 'var(--r-md)',
              border: '1.5px solid var(--border)',
              background: 'var(--cloud)',
              fontSize: 15, color: 'var(--text-1)',
              outline: 'none', marginBottom: 16,
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setFolderModal(null)}
              style={{
                flex: 1, padding: '12px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              onClick={handleCreateFolder}
              disabled={!modalInput.trim() || modalLoading}
              style={{
                flex: 1, padding: '12px',
                borderRadius: 'var(--r-md)',
                border: 'none',
                background: modalInput.trim() ? 'var(--green-800)' : 'var(--border)',
                color: 'white', fontSize: 14, fontWeight: 600,
                cursor: modalInput.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {modalLoading ? 'Membuat...' : 'Buat'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Rename Folder Modal ─── */}
      {folderModal === 'rename' && modalTarget && (
        <Modal title={`Ubah nama "${modalTarget.name}"`} onClose={() => { setFolderModal(null); setModalTarget(null); }}>
          <input
            autoFocus
            type="text"
            value={modalInput}
            onChange={e => setModalInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRenameFolder()}
            style={{
              width: '100%', padding: '12px 14px',
              borderRadius: 'var(--r-md)',
              border: '1.5px solid var(--border)',
              background: 'var(--cloud)',
              fontSize: 15, color: 'var(--text-1)',
              outline: 'none', marginBottom: 16,
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setFolderModal(null); setModalTarget(null); }}
              style={{
                flex: 1, padding: '12px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              onClick={handleRenameFolder}
              disabled={!modalInput.trim() || modalLoading}
              style={{
                flex: 1, padding: '12px',
                borderRadius: 'var(--r-md)',
                border: 'none',
                background: modalInput.trim() ? 'var(--green-800)' : 'var(--border)',
                color: 'white', fontSize: 14, fontWeight: 600,
                cursor: modalInput.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {modalLoading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Confirm Delete Folder ─── */}
      {confirmDelete && (
        <Confirm
          message={`Hapus folder "${confirmDelete.name}"? Semua kata di folder ini akan dipindahkan ke Umum.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDeleteFolder}
          loading={confirmLoading}
        />
      )}
    </div>
  );
}
