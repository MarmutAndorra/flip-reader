/**
 * Utility functions for CSV export and import
 */

// Define WordItem interface locally to avoid circular dependency
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
  setId?: string;
  isFavorite?: boolean;
  memorizationStatus?: 'known' | 'unknown' | 'well-known' | 'mastered' | 'learning' | null;
  interval?: number;
  nextReview?: string;
}

interface VocabSet {
  id: string;
  name: string;
}

/**
 * Strip HTML tags from text (for Anki imports)
 */
export const stripHTML = (text: string | undefined | null): string => {
  if (!text) return '';
  // Create a temporary DOM element to parse HTML
  const tmp = document.createElement('DIV');
  tmp.innerHTML = text;
  // Get text content and clean up
  let cleaned = tmp.textContent || tmp.innerText || '';
  // Remove any remaining HTML entities
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  return cleaned.trim();
};

/**
 * Escape CSV field - wrap in quotes and escape internal quotes
 */
const escapeCSVField = (field: string | undefined | null): string => {
  if (!field) return '""';
  // Replace double quotes with two double quotes (CSV escaping)
  const escaped = String(field).replace(/"/g, '""');
  // Wrap in quotes
  return `"${escaped}"`;
};

/**
 * Get status hafalan text from memorizationStatus
 */
const getStatusHafal = (status: 'known' | 'unknown' | 'well-known' | 'mastered' | 'learning' | null | undefined): string => {
  if (!status) return 'Belum Hafal';
  switch (status) {
    case 'mastered':
      return 'Sudah Dikuasai';
    case 'well-known':
      return 'Sudah Hafal';
    case 'known':
      return 'Tahu';
    case 'learning':
      return 'Sedang Dipelajari';
    case 'unknown':
      return 'Belum Hafal';
    default:
      return 'Belum Hafal';
  }
};

/**
 * Format date for CSV (YYYY-MM-DD)
 */
const formatDateForCSV = (dateString: string | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  } catch {
    return '';
  }
};

/**
 * Export words to CSV format
 */
export const exportToCSV = (words: WordItem[], _vocabSets: VocabSet[]): string => {
  // CSV Headers - sesuai permintaan user
  const headers = [
    'Word',
    'Translation',
    'Part_of_Speech',
    'Grammar_Note',
    'Example_Sentence',
    'Example_Translation',
    'Original_Sentence',
    'Original_Sentence_Translation',
    'Status_Hafal',
    'Date_Added'
  ];

  // Create CSV rows
  const rows = words.map(word => [
    escapeCSVField(word.term),
    escapeCSVField(word.definition),
    escapeCSVField(word.partOfSpeech),
    escapeCSVField(word.grammarNote),
    escapeCSVField(word.example),
    escapeCSVField(word.exampleTranslation),
    escapeCSVField(word.originalSentence),
    escapeCSVField(word.originalSentenceTranslation),
    escapeCSVField(getStatusHafal(word.memorizationStatus)),
    escapeCSVField(formatDateForCSV(word.savedAt))
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.map(escapeCSVField).join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Add BOM for Excel compatibility with Korean characters
  return '\uFEFF' + csvContent;
};

/**
 * Download CSV file
 */
export const downloadCSV = (csvContent: string, filename: string): void => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

/**
 * Parse CSV line (handles quoted fields with commas)
 */
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);

  return result;
};

/**
 * Parse CSV content
 */
export const parseCSV = (csvContent: string): string[][] => {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  return lines.map(parseCSVLine);
};

/**
 * Get CSV headers from file
 */
export const getCSVHeaders = async (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const csvContent = text.replace(/^\uFEFF/, '');
        const parsed = parseCSV(csvContent);

        if (parsed.length < 1) {
          reject(new Error('CSV file is empty'));
          return;
        }

        const headers = parsed[0].map(h => h.replace(/^"|"$/g, '').replace(/""/g, '"'));
        resolve(headers);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file, 'UTF-8');
  });
};

/**
 * Field mapping interface
 */
export interface FieldMapping {
  term: string; // CSV column name
  definition: string;
  partOfSpeech?: string;
  grammarNote?: string;
  example?: string;
  exampleTranslation?: string;
  originalSentence?: string;
  originalSentenceTranslation?: string;
  folder?: string;
  dateAdded?: string;
  statusHafal?: string;
}

/**
 * Convert CSV row to WordItem with field mapping
 */
const csvRowToWordItemWithMapping = (
  row: string[],
  headers: string[],
  mapping: FieldMapping,
  stripHtml: boolean = true
): WordItem | null => {
  try {
    // Helper to get field value
    const getField = (fieldName: string | undefined): string => {
      if (!fieldName) return '';
      const index = headers.findIndex(h => h === fieldName);
      if (index < 0 || index >= row.length) return '';
      let value = row[index].replace(/^"|"$/g, '').replace(/""/g, '"');
      if (stripHtml) {
        value = stripHTML(value);
      }
      return value.trim();
    };

    const term = getField(mapping.term);
    const definition = getField(mapping.definition);

    if (!term || !definition) {
      return null;
    }

    // Parse Status_Hafal if available in mapping
    let memorizationStatus: 'known' | 'unknown' | 'well-known' | 'mastered' | 'learning' | null = 'learning';
    let interval: number | undefined = 0;

    if (mapping.statusHafal) {
      const statusText = getField(mapping.statusHafal).toLowerCase();
      if (statusText.includes('dikuasai') || statusText.includes('mastered')) {
        memorizationStatus = 'mastered';
        interval = 3;
      } else if (statusText.includes('hafal') || statusText.includes('well-known')) {
        memorizationStatus = 'well-known';
        interval = 2;
      } else if (statusText.includes('tahu') || statusText.includes('known')) {
        memorizationStatus = 'known';
        interval = 1;
      } else if (statusText.includes('dipelajari') || statusText.includes('learning')) {
        memorizationStatus = 'learning';
        interval = 0;
      } else {
        memorizationStatus = 'learning';
        interval = 0;
      }
    }

    // Parse Date_Added if available in mapping
    let savedAt = new Date().toISOString();
    if (mapping.dateAdded) {
      const dateStr = getField(mapping.dateAdded);
      if (dateStr) {
        try {
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            savedAt = parsedDate.toISOString();
          }
        } catch {
          // Keep default
        }
      }
    }

    const word: WordItem = {
      term,
      definition,
      partOfSpeech: getField(mapping.partOfSpeech) || 'Unknown',
      grammarNote: getField(mapping.grammarNote) || undefined,
      example: getField(mapping.example) || undefined,
      exampleTranslation: getField(mapping.exampleTranslation) || undefined,
      originalSentence: getField(mapping.originalSentence) || undefined,
      originalSentenceTranslation: getField(mapping.originalSentenceTranslation) || undefined,
      savedAt: savedAt,
      setId: 'uncategorized',
      interval: interval,
      memorizationStatus: memorizationStatus,
    };

    return word;
  } catch (error) {
    console.error('Error parsing CSV row:', error);
    return null;
  }
};

/**
 * Import words from CSV file with field mapping
 */
export const importFromCSVWithMapping = async (
  file: File,
  existingWords: WordItem[],
  vocabSets: VocabSet[],
  mapping: FieldMapping,
  duplicateAction: 'skip' | 'update' = 'skip',
  stripHtml: boolean = true
): Promise<{ imported: number; skipped: number; updated: number; errors: number }> => {
  // Create a copy of vocabSets to modify
  const updatedVocabSets = [...vocabSets];
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        // Remove BOM if present
        const csvContent = text.replace(/^\uFEFF/, '');
        const parsed = parseCSV(csvContent);

        if (parsed.length < 2) {
          reject(new Error('CSV file is empty or invalid'));
          return;
        }

        const headers = parsed[0].map(h => h.replace(/^"|"$/g, '').replace(/""/g, '"'));
        const rows = parsed.slice(1);

        let imported = 0;
        let skipped = 0;
        let updated = 0;
        let errors = 0;

        const existingTermsMap = new Map<string, number>();
        existingWords.forEach((w, idx) => {
          existingTermsMap.set(w.term.toLowerCase(), idx);
        });

        rows.forEach((row, index) => {
          if (row.length === 0 || row.every(cell => !cell || cell.trim() === '')) {
            return; // Skip empty rows
          }

          const word = csvRowToWordItemWithMapping(row, headers, mapping, stripHtml);

          if (!word) {
            errors++;
            return;
          }

          // Check for duplicates (case-insensitive)
          const existingIndex = existingTermsMap.get(word.term.toLowerCase());
          if (existingIndex !== undefined) {
            if (duplicateAction === 'update') {
              // Update existing word
              existingWords[existingIndex] = {
                ...existingWords[existingIndex],
                ...word,
                savedAt: existingWords[existingIndex].savedAt, // Keep original savedAt
                isFavorite: existingWords[existingIndex].isFavorite, // Keep favorite status
              };
              updated++;
            } else {
              // Skip duplicate
              skipped++;
            }
            return;
          }

          // Map folder name to setId
          if (mapping.folder) {
            const folderIndex = headers.findIndex(h => h === mapping.folder);
            if (folderIndex >= 0 && row[folderIndex]) {
              let folderName = row[folderIndex].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
              if (stripHtml) {
                folderName = stripHTML(folderName);
              }
              if (folderName && folderName !== 'Tidak Terkategori') {
                // Find or create vocab set
                let vocabSet = updatedVocabSets.find(s => s.name === folderName);
                if (!vocabSet) {
                  // Create new vocab set
                  vocabSet = {
                    id: `set-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: folderName
                  };
                  updatedVocabSets.push(vocabSet);
                }
                word.setId = vocabSet.id;
              }
            }
          }

          existingWords.push(word);
          existingTermsMap.set(word.term.toLowerCase(), existingWords.length - 1);
          imported++;
        });

        // Update vocabSets array in place
        vocabSets.length = 0;
        vocabSets.push(...updatedVocabSets);

        resolve({ imported, skipped, updated, errors });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file, 'UTF-8');
  });
};

/**
 * Import words from CSV file (legacy function for Flip Reader format)
 */
export const importFromCSV = async (
  file: File,
  existingWords: WordItem[],
  vocabSets: VocabSet[]
): Promise<{ imported: number; skipped: number; errors: number }> => {
  const defaultMapping: FieldMapping = {
    term: 'Word',
    definition: 'Translation',
    partOfSpeech: 'Part_of_Speech',
    grammarNote: 'Grammar_Note',
    example: 'Example_Sentence',
    exampleTranslation: 'Example_Translation',
    originalSentence: 'Original_Sentence',
    originalSentenceTranslation: 'Original_Sentence_Translation',
    folder: 'Folder',
  };

  const result = await importFromCSVWithMapping(file, existingWords, vocabSets, defaultMapping, 'skip', false);
  return {
    imported: result.imported,
    skipped: result.skipped + result.updated,
    errors: result.errors,
  };
};
