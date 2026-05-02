'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is deprecated - Word Bank is now integrated in the main app
// Redirect to home page
export default function WordListPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to home page (Word Bank tab)
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500">Mengalihkan ke Word Bank...</p>
      </div>
    </div>
  );
}
