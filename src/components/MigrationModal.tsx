'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { migrateLocalDataToSupabase, clearLocalData, getLocalDataCounts, saveUserSettings } from '@/lib/wordBankService';

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  appLanguage: string;
  onMigrationComplete: () => void;
}

export default function MigrationModal({
  isOpen,
  onClose,
  userId,
  appLanguage,
  onMigrationComplete,
}: MigrationModalProps) {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    migratedWords: number;
    migratedSets: number;
    errors: string[];
  } | null>(null);

  const localDataCounts = getLocalDataCounts();
  const isIndonesian = appLanguage === 'Bahasa Indonesia';

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      const result = await migrateLocalDataToSupabase(userId);
      setMigrationResult({
        success: result.errors.length === 0,
        ...result,
      });
      
      if (result.errors.length === 0) {
        // IMMEDIATELY clear local data after successful migration
        clearLocalData();
        
        // Also mark migration as complete in Supabase (backup, in case migrateLocalDataToSupabase didn't do it)
        await saveUserSettings(userId, { hasMigratedLocalData: true });
        
        setTimeout(() => {
          onMigrationComplete();
        }, 2000);
      }
    } catch (error) {
      setMigrationResult({
        success: false,
        migratedWords: 0,
        migratedSets: 0,
        errors: [(error as Error).message],
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSkip = async () => {
    // User chose to skip migration - mark it as done so we don't ask again
    // Clear local data and mark migration as complete
    clearLocalData();
    await saveUserSettings(userId, { hasMigratedLocalData: true });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black bg-opacity-50"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] w-full max-w-md overflow-hidden"
        >
          {/* Header with cloud icon */}
          <div className="bg-gradient-to-r from-[#FFB800] to-[#F59E0B] p-6 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
              <svg className="w-8 h-8 text-[#FFB800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">
              {isIndonesian ? 'Migrasi ke Cloud' : 'Migrate to Cloud'}
            </h2>
          </div>

          <div className="p-6">
            {!migrationResult ? (
              <>
                <p className="text-[#1F2937] text-center mb-4">
                  {isIndonesian
                    ? 'Kami menemukan data lokal di perangkat ini. Ingin memindahkan ke akun cloud Anda agar data aman dan bisa diakses dari mana saja?'
                    : 'We found local data on this device. Would you like to migrate it to your cloud account for safekeeping and access from anywhere?'}
                </p>

                {/* Data summary */}
                <div className="bg-[#F8F9FA] rounded-xl p-4 mb-6">
                  <p className="text-sm font-semibold text-[#1F2937] mb-3">
                    {isIndonesian ? 'Data yang ditemukan:' : 'Data found:'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                      <p className="text-2xl font-bold text-[#FFB800]">{localDataCounts.words}</p>
                      <p className="text-xs text-[#6B7280]">
                        {isIndonesian ? 'Kata' : 'Words'}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                      <p className="text-2xl font-bold text-[#FFB800]">{localDataCounts.sets}</p>
                      <p className="text-xs text-[#6B7280]">
                        {isIndonesian ? 'Folder' : 'Folders'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSkip}
                    disabled={isMigrating}
                    className="flex-1 px-4 py-3 border border-[#E5E7EB] text-[#6B7280] rounded-xl hover:bg-[#F8F9FA] font-medium transition-all duration-200 disabled:opacity-50"
                  >
                    {isIndonesian ? 'Lewati' : 'Skip'}
                  </button>
                  <button
                    onClick={handleMigrate}
                    disabled={isMigrating}
                    className="flex-1 px-4 py-3 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] font-semibold shadow-[0_4px_14px_0_rgba(255,184,0,0.39)] transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
                  >
                    {isMigrating ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {isIndonesian ? 'Memindahkan...' : 'Migrating...'}
                      </span>
                    ) : (
                      isIndonesian ? 'Pindahkan Data' : 'Migrate Data'
                    )}
                  </button>
                </div>

                <p className="text-xs text-[#9CA3AF] text-center mt-4">
                  {isIndonesian
                    ? 'Data lokal akan dihapus setelah migrasi berhasil.'
                    : 'Local data will be cleared after successful migration.'}
                </p>
              </>
            ) : (
              /* Migration Result */
              <div className="text-center">
                {migrationResult.success ? (
                  <>
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-[#1F2937] mb-2">
                      {isIndonesian ? 'Migrasi Berhasil!' : 'Migration Successful!'}
                    </h3>
                    <p className="text-[#6B7280] mb-4">
                      {isIndonesian
                        ? `${migrationResult.migratedWords} kata dan ${migrationResult.migratedSets} folder telah dipindahkan ke cloud.`
                        : `${migrationResult.migratedWords} words and ${migrationResult.migratedSets} folders have been migrated to cloud.`}
                    </p>
                    <p className="text-sm text-green-600">
                      {isIndonesian ? 'Mengalihkan...' : 'Redirecting...'}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-[#1F2937] mb-2">
                      {isIndonesian ? 'Migrasi Gagal' : 'Migration Failed'}
                    </h3>
                    <p className="text-[#6B7280] mb-4">
                      {migrationResult.errors[0]}
                    </p>
                    <button
                      onClick={() => setMigrationResult(null)}
                      className="px-6 py-2 bg-[#FFB800] text-white rounded-xl hover:bg-[#E6A600] font-medium transition-all duration-200"
                    >
                      {isIndonesian ? 'Coba Lagi' : 'Try Again'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
