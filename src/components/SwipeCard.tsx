'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { translatePartOfSpeech } from '@/lib/translations';
import { playWordAudio } from '@/lib/audioUtils';

interface WordItem {
  term: string;
  definition: string;
  partOfSpeech: string;
  grammarNote?: string;
  example?: string;
  exampleTranslation?: string;
  originalSentence?: string;
  originalSentenceTranslation?: string;
  savedAt: string;
  isFavorite?: boolean;
}

interface SwipeCardProps {
  word: WordItem;
  appLanguage: string;
  onSwipeRight: () => void; // Sudah hafal
  onSwipeLeft: () => void; // Belum hafal
  onToggleFavorite: () => void;
}

export default function SwipeCard({ word, appLanguage, onSwipeRight, onSwipeLeft, onToggleFavorite }: SwipeCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentDragX = useRef(0);
  const isDragging = useRef(false);

  const SWIPE_THRESHOLD = 100; // Minimum distance to trigger swipe

  // Handle touch/mouse events for swipe
  const handleStart = (clientX: number) => {
    isDragging.current = true;
    startX.current = clientX;
    currentDragX.current = 0;
    setDragX(0);
    setSwipeDirection(null);
  };

  const handleMove = (clientX: number) => {
    if (!isDragging.current) return;
    
    const deltaX = clientX - startX.current;
    currentDragX.current = deltaX;
    setDragX(deltaX);

    if (Math.abs(deltaX) > 20) {
      setSwipeDirection(deltaX > 0 ? 'right' : 'left');
    } else {
      setSwipeDirection(null);
    }
  };

  const handleEnd = () => {
    if (!isDragging.current) {
      return;
    }
    isDragging.current = false;

    const finalDrag = currentDragX.current;
    
    if (Math.abs(finalDrag) > SWIPE_THRESHOLD) {
      if (finalDrag > 0) {
        onSwipeRight();
      } else {
        onSwipeLeft();
      }
    } else {
      // Reset position if not enough swipe
      setDragX(0);
      currentDragX.current = 0;
    }

    setSwipeDirection(null);
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    handleMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  // Mouse events (for desktop testing)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    handleMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Reset drag on new word
  useEffect(() => {
    setDragX(0);
    setIsFlipped(false);
    setSwipeDirection(null);
    setIsPlayingAudio(false);
    isDragging.current = false;
    // Cancel any ongoing speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [word.term]);

  const getPartOfSpeechColor = (pos: string) => {
    switch (pos) {
      case 'Noun':
        return { bg: 'bg-[#E9D5FF]', text: 'text-purple-800' };
      case 'Verb':
        return { bg: 'bg-[#D1FAE5]', text: 'text-green-800' };
      case 'Adverb':
        return { bg: 'bg-[#DBEAFE]', text: 'text-blue-800' };
      case 'Adjective':
        return { bg: 'bg-[#FED7AA]', text: 'text-orange-800' };
      default:
        return { bg: 'bg-[#FCE7F3]', text: 'text-pink-700' };
    }
  };

  const posColor = getPartOfSpeechColor(word.partOfSpeech);

  return (
    <div className="relative w-full max-w-md mx-auto" style={{ perspective: '1000px' }}>
      {/* Swipe Indicator Overlay */}
      <AnimatePresence>
        {swipeDirection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 rounded-2xl z-10 pointer-events-none ${
              swipeDirection === 'right' ? 'bg-green-500' : 'bg-orange-500'
            }`}
          />
        )}
      </AnimatePresence>

      {/* Card */}
      <motion.div
        ref={cardRef}
        className="relative w-full aspect-[3/4] cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
        }}
        animate={{
          x: dragX,
          rotateY: isFlipped ? 180 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleEnd}
        onClick={(e) => {
          // Only flip on click if not dragging
          if (!isDragging.current && Math.abs(dragX) < 10) {
            setIsFlipped(!isFlipped);
          }
        }}
      >
        {/* Front Side */}
        <div
          className="absolute inset-0 bg-white rounded-2xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.15),0_8px_10px_-6px_rgba(0,0,0,0.1)] border border-[#E5E7EB] flex flex-col items-center justify-center p-6"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          {/* Star Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg
              className={`w-6 h-6 transition-colors ${
                word.isFavorite ? 'text-[#FFB800] fill-[#FFB800]' : 'text-gray-400'
              }`}
              fill={word.isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>

          {/* Korean Word */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <p className="text-5xl font-bold text-[#1F2937] app-title">{word.term}</p>
              {/* Icon Speaker */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlayingAudio(true);
                  playWordAudio(
                    word.term,
                    () => setIsPlayingAudio(true),
                    () => setIsPlayingAudio(false)
                  );
                }}
                className={`p-2 rounded-full transition-all duration-200 flex-shrink-0 ${
                  isPlayingAudio 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                aria-label={appLanguage === 'Bahasa Indonesia' ? 'Putar audio' : 'Play audio'}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Flip Hint */}
          <p className="absolute bottom-4 text-xs text-[#6B7280]">Tap to flip</p>
        </div>

        {/* Back Side */}
        <div
          className="absolute inset-0 bg-white rounded-2xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.15),0_8px_10px_-6px_rgba(0,0,0,0.1)] border border-[#E5E7EB] flex flex-col p-6 overflow-y-auto"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Star Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg
              className={`w-6 h-6 transition-colors ${
                word.isFavorite ? 'text-[#FFB800] fill-[#FFB800]' : 'text-gray-400'
              }`}
              fill={word.isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>

          {/* Korean Word */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <p className="text-3xl font-bold text-[#1F2937] app-title">{word.term}</p>
              {/* Icon Speaker */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlayingAudio(true);
                  playWordAudio(
                    word.term,
                    () => setIsPlayingAudio(true),
                    () => setIsPlayingAudio(false)
                  );
                }}
                className={`p-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${
                  isPlayingAudio 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                aria-label={appLanguage === 'Bahasa Indonesia' ? 'Putar audio' : 'Play audio'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </button>
            </div>
          </div>

          {/* DEFINITION */}
          <div className="mb-4">
            <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">DEFINITION</p>
            <p className="text-base text-[#1F2937]">{word.definition}</p>
          </div>

          {/* PART OF SPEECH */}
          {word.partOfSpeech && (
            <div className="mb-4">
              <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">PART OF SPEECH</p>
              <span className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium ${posColor.bg} ${posColor.text}`}>
                {translatePartOfSpeech(word.partOfSpeech, appLanguage)}
              </span>
            </div>
          )}

          {/* GRAMMAR & MORPHOLOGY */}
          {word.grammarNote && (
            <div className="mb-4">
              <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">GRAMMAR & MORPHOLOGY</p>
              <p className="text-sm text-[#1F2937] italic bg-[#F8F9FA] border-l-4 border-[#FFB800] rounded-r-xl px-3 py-2 shadow-sm">
                {word.grammarNote}
              </p>
            </div>
          )}

          {/* EXAMPLE SENTENCE */}
          {word.example && (
            <div className="mb-4">
              <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">EXAMPLE SENTENCE</p>
              <div className="bg-[#F8F9FA] p-3 rounded-xl border border-[#E5E7EB] space-y-2">
                <p className="text-sm text-[#1F2937] italic">
                  "{word.example}"
                </p>
                {word.exampleTranslation && (
                  <p className="text-xs text-[#6B7280] italic">
                    "{word.exampleTranslation}"
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ORIGINAL SENTENCE */}
          {word.originalSentence && (
            <div className="mb-4">
              <p className="text-xs text-[#6B7280] mb-2 font-medium uppercase tracking-wider app-title">ORIGINAL SENTENCE</p>
              <div className="bg-[#F8F9FA] p-3 rounded-xl border border-[#E5E7EB] space-y-2">
                <p className="text-sm text-[#1F2937] italic leading-relaxed">
                  "{word.originalSentence}"
                </p>
                {word.originalSentenceTranslation && (
                  <p className="text-xs text-[#6B7280] italic">
                    "{word.originalSentenceTranslation}"
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Saved Date */}
          <div className="mt-auto pt-4 border-t border-[#E5E7EB]">
            <p className="text-xs text-[#6B7280]">
              Disimpan: {new Date(word.savedAt).toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
