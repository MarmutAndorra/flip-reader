'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav from '@/components/BottomNav';
import { saveWord } from '@/lib/wordBankService';

// ── Language config ────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'Korean',     label: 'Korean',     flag: '🇰🇷' },
  { code: 'Japanese',   label: 'Japanese',   flag: '🇯🇵' },
  { code: 'English',    label: 'English',    flag: '🇬🇧' },
  { code: 'Indonesian', label: 'Indonesian', flag: '🇮🇩' },
  { code: 'Chinese',    label: 'Chinese',    flag: '🇨🇳' },
];
const TARGET_LANGS = [
  { code: 'Indonesian', label: 'Indonesian', flag: '🇮🇩' },
  { code: 'English',    label: 'English',    flag: '🇬🇧' },
];

// ── Token types ────────────────────────────────────────────────────────────────
interface Token {
  id: string;
  text: string;
  isPunct: boolean;
}

// ── Mode ───────────────────────────────────────────────────────────────────────
type Mode = 'input' | 'translating' | 'reading';

// ── Tokenize text ─────────────────────────────────────────────────────────────
function tokenize(text: string): Token[][] {
  // Split into paragraphs
  const paragraphs = text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  // If no double-newlines, just use the whole text as one para
  const paras = paragraphs.length >= 2 ? paragraphs : [text.trim()];

  let id = 0;
  return paras.map(para => {
    const parts = para.split(/(\s+)/).filter(p => !/^\s+$/.test(p));
    return parts.map(t => ({
      id: String(++id),
      text: t,
      isPunct: /^[.!?,;:。！？、；：…\-–—()[\]"'«»]+$/.test(t.trim()),
    }));
  });
}

// ── Session storage ────────────────────────────────────────────────────────────
const SESSION_KEY = 'flipreader_session_v1';

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════
export default function ReaderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [user, loading, router]);

  // ── Mode + input state ─────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('input');
  const [inputText, setInputText] = useState('');
  const [sourceLang, setSourceLang] = useState('Korean');
  const [targetLang, setTargetLang] = useState('Indonesian');
  const [translateMsg, setTranslateMsg] = useState('');

  // ── Reading state ──────────────────────────────────────────────────────────
  const [paragraphs, setParagraphs] = useState<Token[][]>([]);
  const [transMap, setTransMap] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'fail' | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const allTokens = useMemo(() => paragraphs.flat(), [paragraphs]);
  const selectedToken = useMemo(
    () => allTokens.find(t => t.id === selectedId) ?? null,
    [allTokens, selectedId]
  );
  const selectedTranslation = selectedToken ? (transMap[selectedToken.text] ?? '') : '';

  // ── Restore session ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.inputText) setInputText(s.inputText);
      if (s.sourceLang) setSourceLang(s.sourceLang);
      if (s.targetLang) setTargetLang(s.targetLang);
      if (s.mode === 'reading' && s.paragraphs && s.transMap) {
        setParagraphs(s.paragraphs);
        setTransMap(s.transMap);
        setSavedIds(new Set(s.savedIds ?? []));
        setMode('reading');
      }
    } catch { /* ignore */ }
  }, []);

  // ── Persist session ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (mode === 'reading') {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          mode, inputText, sourceLang, targetLang,
          paragraphs, transMap,
          savedIds: [...savedIds],
        }));
      } else if (mode === 'input') {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch { /* quota */ }
  }, [mode, inputText, sourceLang, targetLang, paragraphs, transMap, savedIds]);

  // ── Start reading ──────────────────────────────────────────────────────────
  const handleStartReading = async () => {
    if (!inputText.trim()) return;

    const paras = tokenize(inputText);
    const allToks = paras.flat();
    const uniqueWords = [...new Set(
      allToks.filter(t => !t.isPunct && t.text.trim().length > 0).map(t => t.text)
    )];

    setParagraphs(paras);
    setSavedIds(new Set());
    setSelectedId(null);
    setMode('translating');
    setTranslateMsg(`Menerjemahkan ${uniqueWords.length} kata…`);

    try {
      const res = await fetch('/api/translate-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: uniqueWords,
          context: inputText.slice(0, 400),
          sourceLang,
          targetLang,
        }),
      });
      const data = await res.json();
      setTransMap(data.translations ?? {});
    } catch {
      setTransMap({});
    }

    setMode('reading');
  };

  // ── Tap word ───────────────────────────────────────────────────────────────
  const handleWordTap = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
    setSaveResult(null);
  }, []);

  // ── Save word (fetch detail → save) ───────────────────────────────────────
  const handleSave = async () => {
    if (!selectedToken || !user || saving) return;
    setSaving(true);
    setSaveResult(null);

    try {
      // Fetch detailed translation from Groq
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: selectedToken.text,
          sentence: inputText.slice(0, 500),
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
        }),
      });
      const detail = await res.json();

      await saveWord(user.id, {
        term: selectedToken.text,
        definition: detail.definition || selectedTranslation,
        sourceLanguage: detail.detectedLanguage || sourceLang,
        partOfSpeech: detail.partOfSpeech || '',
        grammarNote: detail.grammarNote || '',
        example: detail.example || '',
        exampleTranslation: detail.exampleTranslation || '',
        originalSentence: inputText.slice(0, 300),
        originalSentenceTranslation: detail.originalSentenceTranslation || '',
        savedAt: new Date().toISOString(),
      });

      setSavedIds(prev => new Set(prev).add(selectedId!));
      setSaveResult('ok');
      // Auto-close card after short delay
      setTimeout(() => {
        setSelectedId(null);
        setSaveResult(null);
      }, 1200);
    } catch {
      setSaveResult('fail');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  // ══════════════════════════════════════════════════════════════════════════
  // INPUT MODE
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'input') {
    return (
      <div className="page" style={{ background: 'var(--cloud)' }}>
        <header style={{ padding: '56px 20px 16px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--green-900)', letterSpacing: -0.3, marginBottom: 4 }}>
            Reader
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Paste teks, lalu tap kata untuk melihat artinya
          </p>
        </header>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Language selector */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--r-md)',
            padding: '14px 16px',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <select
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value)}
              style={{
                flex: 1, padding: '8px 10px',
                borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                background: 'var(--green-50)', fontSize: 13, fontWeight: 600,
                color: 'var(--green-800)', outline: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>

            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>

            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              style={{
                flex: 1, padding: '8px 10px',
                borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                background: 'var(--green-50)', fontSize: 13, fontWeight: 600,
                color: 'var(--green-800)', outline: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {TARGET_LANGS.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>

          {/* Textarea */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Paste teks ${LANGUAGES.find(l => l.code === sourceLang)?.label ?? ''} di sini…\n\nSetelah itu tekan "Mulai Membaca" dan tap kata yang ingin kamu ketahui artinya.`}
              style={{
                width: '100%', minHeight: 240,
                padding: '16px', border: 'none', outline: 'none',
                resize: 'none', fontSize: 15, lineHeight: 1.8,
                color: 'var(--text-1)', background: 'transparent',
                fontFamily: 'inherit',
              }}
            />
            {inputText.length > 0 && (
              <span style={{
                position: 'absolute', bottom: 10, right: 14,
                fontSize: 11, color: 'var(--text-3)', userSelect: 'none',
              }}>
                {inputText.length} karakter
              </span>
            )}
          </div>

          {/* Start button */}
          <button
            onClick={handleStartReading}
            disabled={!inputText.trim()}
            style={{
              padding: '15px',
              borderRadius: 'var(--r-md)',
              background: inputText.trim() ? 'var(--green-800)' : 'var(--green-200)',
              color: inputText.trim() ? 'white' : 'var(--green-600)',
              border: 'none', fontSize: 15, fontWeight: 700,
              cursor: inputText.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit', letterSpacing: -0.2,
              transition: 'all .15s ease',
            }}
          >
            ▶ Mulai Membaca
          </button>

        </div>
        <BottomNav />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRANSLATING MODE
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'translating') {
    return (
      <div className="page" style={{
        background: 'var(--cloud)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', gap: 20,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          border: '4px solid var(--green-100)',
          borderTopColor: 'var(--green-700)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
            {translateMsg}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {sourceLang} → {targetLang}
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READING MODE
  // ══════════════════════════════════════════════════════════════════════════
  const alreadySaved = savedIds.has(selectedId ?? '');

  return (
    <div style={{ background: '#FAFDF9', minHeight: '100dvh', paddingBottom: 160 }}>

      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 52,
        background: 'rgba(250,253,249,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <button
          onClick={() => { setMode('input'); setSelectedId(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-2)', fontSize: 14, fontWeight: 500,
            padding: '6px 0', fontFamily: 'inherit',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Teks baru
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--text-3)', fontWeight: 500,
        }}>
          <span>{LANGUAGES.find(l => l.code === sourceLang)?.flag}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <span>{TARGET_LANGS.find(l => l.code === targetLang)?.flag}</span>
          <span style={{ marginLeft: 4 }}>{savedIds.size} kata disimpan</span>
        </div>
      </div>

      {/* Reading area */}
      <div style={{ padding: '24px 22px 8px', maxWidth: 480, margin: '0 auto' }}>
        {paragraphs.map((para, pIdx) => (
          <p key={pIdx} style={{
            fontSize: '1.13rem',
            lineHeight: '2.1',
            letterSpacing: '0.01em',
            color: '#2D3B2E',
            marginBottom: pIdx < paragraphs.length - 1 ? '1.6rem' : 0,
            wordBreak: 'break-word',
          }}>
            {para.map((token, tIdx) => {
              if (token.isPunct) {
                return (
                  <span key={token.id} style={{ color: '#9ABFAF' }}>
                    {token.text}
                  </span>
                );
              }

              const isSelected = selectedId === token.id;
              const isSaved = savedIds.has(token.id);

              return (
                <span key={token.id} style={{ position: 'relative', display: 'inline' }}>
                  <span
                    onClick={() => handleWordTap(token.id)}
                    style={{
                      cursor: 'pointer',
                      color: isSelected
                        ? 'var(--green-700)'
                        : isSaved
                        ? 'var(--green-500, #52B788)'
                        : 'inherit',
                      fontWeight: isSelected ? 600 : isSaved ? 500 : 'inherit',
                      textDecoration: isSelected ? 'underline' : 'none',
                      textDecorationColor: 'var(--green-400)',
                      textUnderlineOffset: 4,
                      textDecorationThickness: 2,
                      background: isSelected ? 'rgba(64,145,108,0.1)' : 'transparent',
                      borderRadius: 4,
                      padding: isSelected ? '1px 2px' : '0',
                      transition: 'all 0.1s ease',
                      WebkitTapHighlightColor: 'transparent',
                      userSelect: 'none',
                    }}
                  >
                    {token.text}
                  </span>
                  {/* Saved dot */}
                  {isSaved && !isSelected && (
                    <span style={{
                      position: 'absolute', top: -2, right: -4,
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'var(--green-600)',
                    }} />
                  )}
                  {tIdx < para.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </p>
        ))}

        {/* Tap hint */}
        <div style={{
          marginTop: 40, paddingTop: 20,
          borderTop: '1px dashed var(--border)',
          textAlign: 'center',
          color: 'var(--text-3)', fontSize: 12,
        }}>
          👆 Tap kata untuk melihat artinya
        </div>
      </div>

      {/* ── Floating save card ───────────────────────────────────────────────── */}
      <div
        data-save-card
        style={{
          position: 'fixed',
          left: 0, right: 0,
          bottom: '4.5rem', // above bottom nav
          display: 'flex',
          justifyContent: 'center',
          zIndex: 40,
          padding: '0 16px',
          transform: selectedId ? 'translateY(0)' : 'translateY(140%)',
          opacity: selectedId ? 1 : 0,
          transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease',
          pointerEvents: selectedId ? 'auto' : 'none',
        }}
      >
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(27,67,50,.18)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          width: '100%',
          maxWidth: 440,
        }}>
          {/* Word + translation */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
              textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3,
            }}>
              {selectedToken?.text ?? ''}
            </p>
            <p style={{
              fontSize: 17, fontWeight: 700, color: 'var(--text-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selectedTranslation || (
                <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 14 }}>
                  —
                </span>
              )}
            </p>
          </div>

          {/* Action button */}
          {alreadySaved ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              borderRadius: 'var(--r-full)',
              background: 'var(--green-50)',
              color: 'var(--green-700)',
              fontSize: 13, fontWeight: 600,
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3 3 7-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Tersimpan
            </div>
          ) : saveResult === 'fail' ? (
            <button
              onClick={handleSave}
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--r-full)',
                background: '#fef2f2',
                color: '#ef4444',
                border: '1px solid #fca5a5',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              Coba lagi
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-full)',
                background: saving ? 'var(--green-200)' : 'var(--green-800)',
                color: saving ? 'var(--green-700)' : 'white',
                border: 'none',
                fontSize: 13, fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                fontFamily: 'inherit', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all .15s ease',
              }}
            >
              {saving ? (
                <>
                  <span style={{
                    display: 'inline-block', width: 12, height: 12,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'var(--green-700)',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }} />
                  Menyimpan…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M10 1H2.5a.5.5 0 00-.5.5V12l4-2 4 2V1.5a.5.5 0 00-.5-.5z" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                  Simpan
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <BottomNav />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
