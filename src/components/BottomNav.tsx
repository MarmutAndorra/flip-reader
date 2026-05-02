'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  {
    href: '/home',
    label: 'Home',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: '/reader',
    label: 'Reader',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11z" />
        <line x1="6" y1="9" x2="18" y2="9" />
        <line x1="6" y1="13" x2="14" y2="13" />
      </svg>
    ),
  },
  {
    href: '/library',
    label: 'Library',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="6" height="18" rx="1" />
        <rect x="14" y="3" width="6" height="18" rx="1" />
        {active && <rect x="4" y="3" width="6" height="18" rx="1" fill="currentColor" opacity="0.15" />}
        {active && <rect x="14" y="3" width="6" height="18" rx="1" fill="currentColor" opacity="0.15" />}
      </svg>
    ),
  },
  {
    href: '/flashcard',
    label: 'Hafal',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M16 2v4M8 2v4" strokeWidth="1.8" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 480,
      height: 'var(--nav-h)',
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      zIndex: 50,
      boxShadow: '0 -4px 20px rgba(27,67,50,.08)',
    }}>
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              textDecoration: 'none',
              color: active ? 'var(--green-800)' : 'var(--text-3)',
              paddingTop: 8,
              paddingBottom: 8,
              position: 'relative',
            }}
          >
            {active && (
              <span style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 32,
                height: 3,
                background: 'var(--green-700)',
                borderRadius: '0 0 4px 4px',
              }} />
            )}
            {tab.icon(active)}
            <span style={{
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              letterSpacing: 0.2,
            }}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
