'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomNavigationBarProps {
  activeTab: 'home' | 'reader' | 'wordBank';
  onTabChange: (tab: 'home' | 'reader' | 'wordBank') => void;
  appLanguage: string;
  dueReviewCount?: number; // Jumlah kata yang perlu ditinjau
}

export default function BottomNavigationBar({ 
  activeTab, 
  onTabChange,
  appLanguage,
  dueReviewCount = 0
}: BottomNavigationBarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Show when scrolling up or at top, hide when scrolling down
      if (currentScrollY < lastScrollY || currentScrollY < 10) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const tabs = [
    {
      id: 'home' as const,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      label: appLanguage === 'Bahasa Indonesia' ? 'Beranda' : 'Home',
    },
    {
      id: 'reader' as const,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      label: appLanguage === 'Bahasa Indonesia' ? 'Reader' : 'Reader',
    },
    {
      id: 'wordBank' as const,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
      label: appLanguage === 'Bahasa Indonesia' ? 'Kumpulan Kata' : 'Word Bank',
    },
  ];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-50"
        >
          <div className="bg-white/80 backdrop-blur-lg border-t border-[#E5E7EB] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1),0_-2px_4px_-1px_rgba(0,0,0,0.06)]">
            <div className="max-w-md mx-auto px-4 py-2">
              <div className="flex items-center justify-around">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`relative flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-xl transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'text-[#FFB800]'
                        : 'text-[#6B7280] hover:text-[#1F2937]'
                    }`}
                  >
                    <motion.div
                      animate={{ scale: activeTab === tab.id ? 1.1 : 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      {tab.icon}
                    </motion.div>
                    <span className={`text-xs font-medium ${activeTab === tab.id ? 'font-semibold' : ''}`}>
                      {tab.label}
                    </span>
                    {/* Titik kecil untuk notifikasi (hanya jika < 3 kata yang perlu ditinjau) */}
                    {tab.id === 'home' && dueReviewCount > 0 && dueReviewCount < 3 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full"></span>
                    )}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 h-1 w-12 bg-[#FFB800] rounded-t-full"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
