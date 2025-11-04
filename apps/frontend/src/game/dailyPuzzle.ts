
export type Arah = "mendatar" | "menurun";

export interface TTSSlot {
  no: number;
  arah: Arah;
  start: [number, number];
  length: 4 | 5 | 6;
  word: string;
}

export interface TTSTemplate {
  id: string;
  name: string;
  gridSize: [number, number];
  grid: number[][];
  words: TTSSlot[];
}


export const GAME_CONFIG = {
  selectedTemplate: "default",
  autoAdvance: false,
  maxAttempts: 6,
  showHints: true,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "https://dgdr4x15-4000.asse.devtunnels.ms"
};

// Cache for loaded data
let templatesCache: TTSTemplate[] | null = null;
let kbbiWordsCache: string[] | null = null;

export async function getTtsTemplates(): Promise<TTSTemplate[]> {
  if (templatesCache) return templatesCache;

  try {
    const response = await fetch(`${GAME_CONFIG.apiBaseUrl}/api/puzzle-templates`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const templatesData = await response.json();

    // Convert backend format to TTSTemplate format
    const templates: TTSTemplate[] = Object.entries(templatesData).map(([key, data]: [string, any]) => ({
      id: key,
      name: `Template ${key}`,
      gridSize: [data.rows, data.cols],
      grid: data.grid,
      words: data.answers.map((answer: any, index: number) => ({
        no: index + 1,
        arah: answer.direction === 'across' ? 'mendatar' : 'menurun',
        start: answer.start as [number, number],
        length: answer.word.length as 4 | 5 | 6,
        word: answer.word
      }))
    }));

    console.log('Converted templates:', templates);

    templatesCache = templates;
    return templates;
  } catch (error) {
    console.error('Failed to load TTS templates:', error);
    return [];
  }
}

export async function getKbbiWords(): Promise<string[]> {
  if (kbbiWordsCache) return kbbiWordsCache;

  try {
    const response = await fetch(`${GAME_CONFIG.apiBaseUrl}/api/kbbi-words`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const kbbiData = await response.json();
    kbbiWordsCache = kbbiData.KBBI || [];
    return kbbiWordsCache;
  } catch (error) {
    console.error('Failed to load KBBI words:', error);
    kbbiWordsCache = [];
    return kbbiWordsCache;
  }
}

export async function getKbbiByLength(len: number): Promise<string[]> {
  const words = await getKbbiWords();
  const filtered = words.filter(word => word.length === len);
  console.log(`[DEV] Filtering ${words.length} words for length ${len}: found ${filtered.length} words`);
  return filtered;
}

export async function getKbbiWordsByLengths(lengths: number[]): Promise<{ [key: number]: string[] }> {
  const words = await getKbbiWords();
  const result: { [key: number]: string[] } = {};
  for (const len of lengths) {
    result[len] = words.filter(word => word.length === len);
  }
  return result;
}

export async function isKBBIWord(word: string, len: number): Promise<boolean> {
  const list = await getKbbiByLength(len);
  const lower = word.trim().toLowerCase();
  const found = list.some((w) => w.toLowerCase() === lower);
  console.log(`[DEV] Checking word "${lower}" (len: ${len}): ${found ? 'FOUND' : 'NOT FOUND'} in ${list.length} words`);
  if (!found) {
    console.log(`[DEV] Available words of length ${len}:`, list.slice(0, 10));
    // Also check if the word exists in the full list
    const allWords = await getKbbiWords();
    const foundInAll = allWords.some((w) => w.toLowerCase() === lower);
    console.log(`[DEV] Word "${lower}" found in full list: ${foundInAll}`);
    if (foundInAll) {
      console.log(`[DEV] Word exists in full list but not in length-filtered list. This suggests a filtering issue.`);
    }
  }
  return found;
}

export function seedFromDate(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i += 1) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function pickFromArray<T>(arr: T[] | null | undefined, seed: number, offset = 0): T | null {
  if (!arr || arr.length === 0) return null;
  const idx = Math.abs(seed + offset) % arr.length;
  return arr[idx];
}

export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface JawabanHarianEntry {
  no: number;
  jawaban: string | null;
  kbbi_valid: boolean;
  playable: boolean;
}

export interface DailyPuzzle {
  date: string;
  template_id: string;
  jawaban_harian: JawabanHarianEntry[];
}

export async function generatePuzzleGrid(template: TTSTemplate, seed: number): Promise<{ grid: string[][], words: Array<{ no: number; arah: Arah; start: [number, number]; length: number; word: string }> } | null> {
  const [rows, cols] = template.gridSize;
  const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  const placedWords: Array<{ no: number; arah: Arah; start: [number, number]; length: number; word: string }> = [];

  // Shuffle function using seed
  function seededShuffle<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    let currentSeed = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      const j = Math.floor((currentSeed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Get all required word lengths
  const lengths = [...new Set(template.words.map(w => w.length))];
  const wordsByLength = await getKbbiWordsByLengths(lengths);

  // Sort slots by length (longer first) to place longer words first
  const sortedSlots = [...template.words].sort((a, b) => b.length - a.length);

  for (const slot of sortedSlots) {
    console.log(`Processing slot ${slot.no}: ${slot.arah} at [${slot.start[0]}, ${slot.start[1]}] length ${slot.length}`);
    const bank = wordsByLength[slot.length] || [];
    console.log(`Available words for length ${slot.length}: ${bank.length}`);
    if (bank.length === 0) {
      console.error(`No words available for length ${slot.length}`);
      return null;
    }
    const shuffledBank = seededShuffle(bank, seed + slot.no);
    let placed = false;

    for (const candidate of shuffledBank.slice(0, 50)) { // Try more candidates
      const upperCandidate = candidate.toUpperCase();
      console.log(`Trying word: ${upperCandidate}`);
      let conflict = false;

      for (let i = 0; i < slot.length; i++) {
        const row = slot.arah === "mendatar" ? slot.start[0] : slot.start[0] + i;
        const col = slot.arah === "mendatar" ? slot.start[1] + i : slot.start[1];
        const existing = grid[row][col];

        console.log(`Position [${row}, ${col}]: existing='${existing}', candidate='${upperCandidate[i]}'`);

        if (existing !== "" && existing !== upperCandidate[i]) {
          console.log(`Conflict detected!`);
          conflict = true;
          break;
        }
      }

      if (!conflict) {
        console.log(`Word ${upperCandidate} fits! Placing...`);
        // Place the word
        for (let i = 0; i < slot.length; i++) {
          const row = slot.arah === "mendatar" ? slot.start[0] : slot.start[0] + i;
          const col = slot.arah === "mendatar" ? slot.start[1] + i : slot.start[1];
          grid[row][col] = upperCandidate[i];
        }
        placedWords.push({
          no: slot.no,
          arah: slot.arah,
          start: slot.start,
          length: slot.length,
          word: upperCandidate
        });
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Multiple retry attempts with different seeds
      for (let attempt = 1; attempt <= 20; attempt++) {
        const retrySeed = seed + (attempt * 1000) + slot.no;
        const retryShuffledBank = seededShuffle(bank, retrySeed);
        for (const candidate of retryShuffledBank.slice(0, 100)) {
          const upperCandidate = candidate.toUpperCase();
          let conflict = false;

          for (let i = 0; i < slot.length; i++) {
            const row = slot.arah === "mendatar" ? slot.start[0] : slot.start[0] + i;
            const col = slot.arah === "mendatar" ? slot.start[1] + i : slot.start[1];
            const existing = grid[row][col];

            if (existing !== "" && existing !== upperCandidate[i]) {
              conflict = true;
              break;
            }
          }

          if (!conflict) {
            // Place the word
            for (let i = 0; i < slot.length; i++) {
              const row = slot.arah === "mendatar" ? slot.start[0] : slot.start[0] + i;
              const col = slot.arah === "mendatar" ? slot.start[1] + i : slot.start[1];
              grid[row][col] = upperCandidate[i];
            }
            placedWords.push({
              no: slot.no,
              arah: slot.arah,
              start: slot.start,
              length: slot.length,
              word: upperCandidate
            });
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      if (!placed) {
        // If still no word fits after multiple attempts, return null
        console.error(`Failed to place word for slot ${slot.no}`);
        return null;
      }
    }
  }

  return { grid, words: placedWords };
}

export async function generateFallbackPuzzle(template: TTSTemplate, seed: number): Promise<{ grid: string[][], words: Array<{ no: number; arah: Arah; start: [number, number]; length: number; word: string }> } | null> {
  const [rows, cols] = template.gridSize;
  const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  const placedWords: Array<{ no: number; arah: Arah; start: [number, number]; length: number; word: string }> = [];

  // Fallback words for each length
  const fallbackWords: { [key: number]: string[] } = {
    4: ['ABAD', 'ABAL', 'ABAM', 'ABAR', 'ABDI'],
    5: ['ABADI', 'ABITI', 'ABJAD', 'ABSES', 'ACARA'],
    6: ['ABAHAN', 'ABAKUS', 'ABLASI', 'ABRASI', 'ABSURD']
  };

  // Shuffle function using seed
  function seededShuffle<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    let currentSeed = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      const j = Math.floor((currentSeed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  for (const slot of template.words) {
    const bank = fallbackWords[slot.length] || [];
    if (bank.length === 0) continue;

    const shuffledBank = seededShuffle(bank, seed + slot.no);
    const candidate = shuffledBank[0].toUpperCase();

    // Place the word directly (fallback, so we ignore conflicts)
    for (let i = 0; i < slot.length; i++) {
      const row = slot.arah === "mendatar" ? slot.start[0] : slot.start[0] + i;
      const col = slot.arah === "mendatar" ? slot.start[1] + i : slot.start[1];
      grid[row][col] = candidate[i];
    }
    placedWords.push({
      no: slot.no,
      arah: slot.arah,
      start: slot.start,
      length: slot.length,
      word: candidate
    });
  }

  return { grid, words: placedWords };
}

export async function getDailyPuzzle(dateStr: string = getTodayISO()): Promise<DailyPuzzle | null> {
  try {
    const templates = await getTtsTemplates();

    if (templates.length === 0) {
      console.error('No templates available');
      return null;
    }

    const seed = seedFromDate(dateStr);

    const template = pickFromArray(templates, seed);

    if (!template) {
      console.error('No template selected');
      return null;
    }

    const jawaban_harian = template.words.map((slot) => ({
      no: slot.no,
      jawaban: (slot.word ?? "").toUpperCase(),
      kbbi_valid: true,
      playable: true
    } satisfies JawabanHarianEntry));

    return {
      date: dateStr,
      template_id: template.id,
      jawaban_harian
    } satisfies DailyPuzzle;
  } catch (error) {
    console.error('Failed to load daily puzzle:', error);
    return null;
  }
}

// Puzzle templates are now loaded from backend
export async function getPuzzleTemplateById(id: number) {
  try {
    const response = await fetch(`${GAME_CONFIG.apiBaseUrl}/api/puzzle-templates`);
    const templates = await response.json();
    return templates[id.toString()] || null;
  } catch (error) {
    console.error('Failed to load puzzle template:', error);
    return null;
  }
}

export function fillWordOnBoard(
  board: string[][],
  template: TTSTemplate,
  wordNo: number,
  answer: string
): string[][] {
  const slot = template.words.find((w) => w.no === wordNo);
  if (!slot) return board;
  const [sr, sc] = slot.start;
  const chars = answer.split("");
  const newBoard = board.map((row) => [...row]);

  for (let i = 0; i < chars.length; i += 1) {
    const row = slot.arah === "mendatar" ? sr : sr + i;
    const col = slot.arah === "mendatar" ? sc + i : sc;

    // Bounds checking
    if (row >= 0 && row < newBoard.length && col >= 0 && col < newBoard[row].length) {
      newBoard[row][col] = chars[i];
    }
  }

  return newBoard;
}

// Example consumption (async)
getDailyPuzzle("2025-11-03").then((daily) => {
  if (daily) {
    console.log("Daily puzzle generated:", daily);
    // render template.gridSize
    // render numbers from template.words
    // onClick number N → open Katla with daily.jawaban_harian.find(x => x.no === N)?.jawaban
  } else {
    console.log("Failed to generate daily puzzle");
  }
});
