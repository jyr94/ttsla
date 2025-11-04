import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trackEvent } from "~/analytics";
import {
  fillWordOnBoard,
  GAME_CONFIG,
  getDailyPuzzle,
  getTtsTemplates,
  type Arah,
  type DailyPuzzle,
  type JawabanHarianEntry,
  type TTSSlot,
  type TTSTemplate
} from "~/game/dailyPuzzle";
import "./MainScene.scss";

type BoardMatrix = string[][];

type CellMetadata = {
  playable: boolean[][];
  numbering: (number | null)[][];
  slotLengths: Record<number, number>;
  slotsByCell: number[][][];
  slotCoords: Record<number, Array<[number, number]>>;
};

type BoardRowStyle = CSSProperties & {
  "--cols"?: number;
};

type KatlaRowStyle = CSSProperties & {
  "--katla-cols"?: number;
};

type KatlaTileState = "correct" | "present" | "absent" | "empty";

type GuessResult = {
  guess: string;
  states: KatlaTileState[];
};

const isDev = import.meta.env.DEV;

const glyphPatterns = [
  [
    "11111",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100",
  ],
  [
    "10001",
    "10001",
    "11111",
    "00100",
    "00100",
    "00100",
  ],
  [
    "11110",
    "00010",
    "00110",
    "01000",
    "11111",
    "00001",
  ],
];

function createEmptyBoard(template: TTSTemplate | null): BoardMatrix {
  if (!template) return [];
  const [rows, cols] = template.gridSize;
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function buildCellMetadata(template: TTSTemplate | null): CellMetadata | null {
  if (!template || !template.grid) return null;
  const [rows, cols] = template.gridSize;
  const playable = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );
  const numbering = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as number | null),
  );
  const slotLengths: Record<number, number> = {};
  const slotsByCell = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [] as number[]),
  );
  const slotCoords: Record<number, Array<[number, number]>> = {};

  template.words.forEach((slot) => {
    slotLengths[slot.no] = slot.length;
    const [startRow, startCol] = slot.start;
    slotCoords[slot.no] = [];

    for (let i = 0; i < slot.length; i += 1) {
      const row = slot.arah === "mendatar" ? startRow : startRow + i;
      const col = slot.arah === "mendatar" ? startCol + i : startCol;
      if (row >= 0 && row < rows && col >= 0 && col < cols && template.grid[row][col] === 1) {
        playable[row][col] = true;
        slotsByCell[row][col].push(slot.no);
        slotCoords[slot.no].push([row, col]);
        if (i === 0) {
          numbering[row][col] = slot.no;
        }
      }
    }
  });

  return { playable, numbering, slotLengths, slotsByCell, slotCoords };
}

const hints = [
  {
    title: "TEKLA",
    description:
      "Tebak kata dengan clue yang berubah setiap harinya. Ambil inspirasi dari budaya lokal.",
  },
  {
    title: "TEKLU",
    description:
      "Gunakan logika dan intuisi. Huruf yang benar akan diberi warna hijau, huruf yang tepat namun salah posisi akan berwarna kuning.",
  },
  {
    title: "KATLA",
    description:
      "Kamu punya enam kesempatan. Bagi hasil tebakanmu dan ajak teman untuk ikut bermain!",
  },
  {
    title: "🟩 Hijau",
    description:
      "Huruf benar dan posisinya juga benar. Contoh: target = RUMAH, tebakan R U M O R → huruf R, U, M berada di posisi tepat sehingga berwarna hijau.",
  },
  {
    title: "🟨 Kuning",
    description:
      "Huruf benar tapi posisinya salah. Contoh: target = TANAH, tebakan ATLAS → huruf A ada di target namun di kolom berbeda sehingga menjadi kuning.",
  },
  {
    title: "⬛ Abu / ⬜ Abu Tua",
    description:
      "Huruf tidak ada di kata target. Hindari huruf ini pada tebakan berikutnya karena tidak membantu mencapai jawaban.",
  },
];

const KEYBOARD_LAYOUT = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
] as const;

const STATE_PRIORITY: Record<KatlaTileState, number> = {
  empty: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

function evaluateGuess(guess: string, target: string): KatlaTileState[] {
  const result: KatlaTileState[] = Array.from({ length: target.length }, () => "absent");
  const remaining: (string | null)[] = target.split("");
  const guessChars = guess.split("");

  for (let i = 0; i < guessChars.length; i += 1) {
    if (guessChars[i] === target[i]) {
      result[i] = "correct";
      remaining[i] = null;
    }
  }

  for (let i = 0; i < guessChars.length; i += 1) {
    if (result[i] === "correct") continue;
    const char = guessChars[i];
    const foundIndex = remaining.findIndex((value) => value === char);
    if (foundIndex !== -1) {
      result[i] = "present";
      remaining[foundIndex] = null;
    } else {
      result[i] = "absent";
    }
  }

  return result;
}

function computeKeyboardState(guesses: GuessResult[]): Record<string, KatlaTileState> {
  const map: Record<string, KatlaTileState> = {};
  guesses.forEach(({ guess, states }) => {
    guess.split("").forEach((letter, idx) => {
      const state = states[idx];
      const prevState = map[letter] ?? "empty";
      if (STATE_PRIORITY[state] > STATE_PRIORITY[prevState]) {
        map[letter] = state;
      }
    });
  });
  return map;
}

export default function MainScene() {
  const [dailyPuzzle, setDailyPuzzle] = useState<DailyPuzzle | null>(null);
  const [templates, setTemplates] = useState<TTSTemplate[] | null>(null);

  useEffect(() => {
    getDailyPuzzle().then(setDailyPuzzle);
  }, []);
  useEffect(() => {
    getTtsTemplates().then(setTemplates);
  }, []);

  const template = useMemo<TTSTemplate | null>(() => {
    if (!dailyPuzzle) return null;
    if (templates && templates.length > 0) {
      const matched = templates.find((tpl) => tpl.id === dailyPuzzle.template_id);
      if (matched) return matched;
    }
    // Fallback: create template from daily puzzle data
    const answers = dailyPuzzle.jawaban_harian;
    const gridSize: [number, number] = [10, 10]; // Default grid size
    const grid: number[][] = Array.from({ length: gridSize[0] }, () =>
      Array.from({ length: gridSize[1] }, () => 0)
    );

    const words: TTSSlot[] = answers.map((entry, index) => {
      const word = entry.jawaban || "";
      const length = word.length as 4 | 5 | 6;

      // Use specific positioning for known words to match template
      let startRow: number, startCol: number, arah: Arah;

      if (word === "SEMPAX") {
        arah = "mendatar";
        startRow = 0;
        startCol = 0;
      } else if (word === "OTAK") {
        arah = "mendatar";
        startRow = 2;
        startCol = 1;
      } else if (word === "MATI") {
        arah = "menurun";
        startRow = 0;
        startCol = 2;
      } else if (word === "IKAN") {
        arah = "menurun";
        startRow = 3;
        startCol = 2;
      } else {
        // Fallback for unknown words
        arah = index % 2 === 0 ? "mendatar" : "menurun";
        startRow = Math.floor(index / 2) * 2;
        startCol = (index % 2) * 3;
      }

      // Mark grid cells as playable
      for (let i = 0; i < length; i++) {
        const row = arah === "mendatar" ? startRow : startRow + i;
        const col = arah === "mendatar" ? startCol + i : startCol;
        if (row < gridSize[0] && col < gridSize[1]) {
          grid[row][col] = 1;
        }
      }

      return {
        no: entry.no,
        arah,
        start: [startRow, startCol],
        length,
        word
      };
    });

    return {
      id: dailyPuzzle.template_id,
      name: `Template ${dailyPuzzle.template_id}`,
      gridSize,
      grid,
      words
    };
  }, [dailyPuzzle, templates]);

  useEffect(() => {
    if (!isDev || !dailyPuzzle) return;
    const entries = dailyPuzzle.jawaban_harian.map((entry) => ({
      slot: entry.no,
      playable: entry.playable,
      kbbi: entry.kbbi_valid,
      jawaban: entry.jawaban,
    }));
    console.groupCollapsed(
      `[DEV] Daily puzzle ${dailyPuzzle.date} — template: ${dailyPuzzle.template_id}`,
    );
    console.table(entries);
    console.groupEnd();
  }, [dailyPuzzle]);

  const cellMetadata = useMemo<CellMetadata | null>(
    () => buildCellMetadata(template),
    [template],
  );

  const [boardState, setBoardState] = useState<BoardMatrix>(() => createEmptyBoard(template));
  const [solvedEntries, setSolvedEntries] = useState<Record<number, boolean>>({});
  const [activeEntryNo, setActiveEntryNo] = useState<number | null>(null);
  const [katlaGuesses, setKatlaGuesses] = useState<GuessResult[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [keyStatuses, setKeyStatuses] = useState<Record<string, KatlaTileState>>({});
  const [katlaMessage, setKatlaMessage] = useState<string | null>(null);
  const [entryAttempts, setEntryAttempts] = useState<Record<number, GuessResult[]>>({});
  const [failedEntries, setFailedEntries] = useState<Record<number, boolean>>({});

  const maxAttempts = 6; // TODO: Use from config

  useEffect(() => {
    if (!template) {
      setBoardState([]);
      setSolvedEntries({});
      setActiveEntryNo(null);
      setKatlaGuesses([]);
      setCurrentGuess("");
      setKeyStatuses({});
      setKatlaMessage(null);
      setEntryAttempts({});
      setFailedEntries({});
      return;
    }
    setBoardState(createEmptyBoard(template));
    setSolvedEntries({});
    setActiveEntryNo(null);
    setKatlaGuesses([]);
    setCurrentGuess("");
    setKeyStatuses({});
    setKatlaMessage(null);
    setEntryAttempts({});
    setFailedEntries({});
  }, [template]);

  const activeEntry = useMemo<JawabanHarianEntry | null>(() => {
    if (!dailyPuzzle || activeEntryNo == null) return null;
    return dailyPuzzle.jawaban_harian.find((entry) => entry.no === activeEntryNo) ?? null;
  }, [dailyPuzzle, activeEntryNo]);

  const activeEntryLength =
    activeEntry && cellMetadata ? cellMetadata.slotLengths[activeEntry.no] : null;
  const activeSlot = useMemo(() => {
    if (!template || activeEntryNo == null) return null;
    return template.words.find((slot) => slot.no === activeEntryNo) ?? null;
  }, [activeEntryNo, template]);

  useEffect(() => {
    if (!activeEntry || !activeEntryLength) {
      setKatlaGuesses([]);
      setCurrentGuess("");
      setKeyStatuses({});
      return;
    }
    const storedGuesses = entryAttempts[activeEntry.no] ?? [];
    setKatlaGuesses(storedGuesses);
    setCurrentGuess("");
    setKeyStatuses(computeKeyboardState(storedGuesses));
    if (solvedEntries[activeEntry.no]) {
      setKatlaMessage("Slot ini sudah terisi. Lanjutkan ke kata lainnya.");
    } else if (failedEntries[activeEntry.no]) {
      setKatlaMessage("Kesempatan habis. Coba lagi nanti.");
    } else {
      setKatlaMessage(`Tebak kata ${activeEntryLength} huruf.`);
    }
  }, [activeEntry, activeEntryLength, entryAttempts, failedEntries, solvedEntries]);

  const handleSelectEntry = useCallback(
    (entry: JawabanHarianEntry) => {
      if (
        !entry.playable ||
        !entry.kbbi_valid ||
        solvedEntries[entry.no] ||
        failedEntries[entry.no]
      )
        return;
      setActiveEntryNo(entry.no);
      trackEvent("DailyPuzzle", "select_entry", `slot_${entry.no}`);
    },
    [failedEntries, solvedEntries],
  );

  const handleCloseKatla = useCallback(() => {
    setActiveEntryNo(null);
    setKatlaMessage(null);
  }, []);

  const handleMarkSolved = useCallback(() => {
    if (!dailyPuzzle || !template || !activeEntry || !activeEntry.jawaban) return;

    console.log('[DEV] Marking entry solved:', activeEntry.no, activeEntry.jawaban);
    const updatedSolved = { ...solvedEntries, [activeEntry.no]: true };
    setSolvedEntries(updatedSolved);
    setFailedEntries((prev) => ({ ...prev, [activeEntry.no]: false }));
    const updatedBoard = fillWordOnBoard(boardState, template, activeEntry.no, activeEntry.jawaban!);
    console.log('[DEV] Updated board after filling word:', updatedBoard);
    setBoardState(updatedBoard);

    // Check for auto-solved intersecting slots
    const autoSolved: Record<number, boolean> = {};
    dailyPuzzle.jawaban_harian.forEach((entry) => {
      if (updatedSolved[entry.no] || failedEntries[entry.no]) return;
      const slot = template.words.find((w) => w.no === entry.no);
      if (!slot) return;

      let allFilled = true;
      const wordFromBoard: string[] = [];
      for (let i = 0; i < slot.length; i += 1) {
        const row = slot.arah === "mendatar" ? slot.start[0] : slot.start[0] + i;
        const col = slot.arah === "mendatar" ? slot.start[1] + i : slot.start[1];
        if (row >= 0 && row < updatedBoard.length && col >= 0 && col < updatedBoard[row].length) {
          const letter = updatedBoard[row][col];
          if (!letter) {
            allFilled = false;
            break;
          }
          wordFromBoard.push(letter);
        } else {
          allFilled = false;
          break;
        }
      }
      if (allFilled && wordFromBoard.join("") === entry.jawaban) {
        autoSolved[entry.no] = true;
      }
    });

    if (Object.keys(autoSolved).length > 0) {
      setSolvedEntries((prev) => ({ ...prev, ...autoSolved }));
    }

    handleCloseKatla();

    trackEvent("DailyPuzzle", "mark_solved", `slot_${activeEntry.no}`);
  }, [activeEntry, dailyPuzzle, failedEntries, handleCloseKatla, solvedEntries, template]);

  const handleCellClick = useCallback(
    (slotNos: number[], preferredNo: number | null) => {
      if (!dailyPuzzle) return;
      const candidates = slotNos
        .map((no) => dailyPuzzle.jawaban_harian.find((entry) => entry.no === no) ?? null)
        .filter(
          (entry): entry is JawabanHarianEntry =>
            entry !== null &&
            entry.playable &&
            entry.kbbi_valid &&
            !solvedEntries[entry.no] &&
            !failedEntries[entry.no],
        );
      if (candidates.length === 0) return;

      if (preferredNo != null) {
        const preferred = candidates.find((entry) => entry.no === preferredNo);
        if (preferred) {
          handleSelectEntry(preferred);
          return;
        }
      }

      const target = candidates[0];
      if (target) handleSelectEntry(target);
    },
    [dailyPuzzle, failedEntries, handleSelectEntry, solvedEntries],
  );

  const submitGuess = useCallback(async () => {
    if (!activeEntry || !activeEntryLength || !activeEntry.jawaban || !template) return;
    if (katlaGuesses.length >= maxAttempts) return;

    if (currentGuess.length !== activeEntryLength) {
      if (isDev) {
        console.warn("[DEV] Katla guess ignored — length mismatch", {
          slot: activeEntry.no,
          expected: activeEntryLength,
          received: currentGuess.length,
          guess: currentGuess,
        });
      }
      setKatlaMessage(`Tebakan harus terdiri dari ${activeEntryLength} huruf.`);
      return;
    }

    const normalized = currentGuess.toUpperCase();
    let validation: { valid: boolean; correct: boolean } | null = null;
    try {
      const response = await fetch(`${GAME_CONFIG.apiBaseUrl}/api/katla/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: normalized,
          templateId: template.id,
          slotNo: activeEntry.no,
        }),
      });
      if (!response.ok) {
        throw new Error(`Validation failed with status ${response.status}`);
      }
      validation = (await response.json()) as { valid: boolean; correct: boolean };
    } catch (error) {
      if (isDev) {
        console.error("[DEV] Katla validation failed", {
          slot: activeEntry.no,
          guess: normalized,
          error,
        });
      }
      setKatlaMessage("Gagal memeriksa kata. Coba lagi beberapa saat.");
      return;
    }

    if (!validation.valid) {
      if (isDev) {
        console.warn("[DEV] Katla guess rejected — not in KBBI bank", {
          slot: activeEntry.no,
          guess: normalized,
          length: activeEntryLength,
        });
      }
      setKatlaMessage("Kata tidak ditemukan di daftar KBBI. Coba kata baku lain.");
      return;
    }

    const states = evaluateGuess(normalized, activeEntry.jawaban);
    const guessResult: GuessResult = { guess: normalized, states };
    const updatedGuesses = [...katlaGuesses, guessResult];

    if (isDev) {
      console.log("[DEV] Katla guess accepted", {
        slot: activeEntry.no,
        guess: normalized,
        states,
      });
    }

    setKatlaGuesses(updatedGuesses);
    setEntryAttempts((prev) => ({ ...prev, [activeEntry.no]: updatedGuesses }));
    setCurrentGuess("");
    setKatlaMessage(null);
    setKeyStatuses(computeKeyboardState(updatedGuesses));

    trackEvent("DailyPuzzle", "katla_guess", `slot_${activeEntry.no}_${updatedGuesses.length}`);

    if (states.every((state) => state === "correct")) {
      console.log('[DEV] Word correctly guessed, marking as solved');
      setKatlaMessage("Kata berhasil ditebak!");
      handleMarkSolved();
      return;
    }

    if (updatedGuesses.length >= maxAttempts) {
      setKatlaMessage("Kesempatan habis. Coba lagi nanti.");
      setFailedEntries((prev) => ({ ...prev, [activeEntry.no]: true }));
      trackEvent("DailyPuzzle", "katla_failed", `slot_${activeEntry.no}`);
    }
  }, [
    activeEntry,
    activeEntryLength,
    currentGuess,
    handleMarkSolved,
    katlaGuesses,
    maxAttempts,
    template,
  ]);

  const handleKeyboardInput = useCallback(
    (input: string) => {
      if (!activeEntry || !activeEntryLength || solvedEntries[activeEntry.no]) return;
      if (failedEntries[activeEntry.no] || katlaGuesses.length >= maxAttempts) return;

      if (input === "ENTER") {
        void submitGuess();
        return;
      }

      if (input === "⌫") {
        setCurrentGuess((prev) => {
          if (prev.length === 0) return prev;
          const next = prev.slice(0, -1);
          return next;
        });
        setKatlaMessage(null);
        return;
      }

      if (/^[A-Z]$/.test(input)) {
        setCurrentGuess((prev) => {
          if (prev.length >= activeEntryLength) return prev;
          return `${prev}${input}`;
        });
        setKatlaMessage(null);
      }
    },
    [activeEntry, activeEntryLength, failedEntries, katlaGuesses, maxAttempts, solvedEntries, submitGuess],
  );

useEffect(() => {
  if (!activeEntry) return;
  const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter") {
        event.preventDefault();
        handleKeyboardInput("ENTER");
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        handleKeyboardInput("⌫");
        return;
      }
      const letter = event.key.toUpperCase();
      if (/^[A-Z]$/.test(letter)) {
        event.preventDefault();
        handleKeyboardInput(letter);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeEntry, handleKeyboardInput]);

  const activeEntrySolved = activeEntry ? !!solvedEntries[activeEntry.no] : false;
  const activeEntryFailed = activeEntry ? failedEntries[activeEntry.no] ?? false : false;
  const showKatlaPanel = activeEntry != null;

  useEffect(() => {
    if (!showKatlaPanel) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showKatlaPanel]);

  const katlaBoardRows = useMemo(() => {
    if (!activeEntryLength) return [];
    const inputRowIndex = activeEntrySolved || activeEntryFailed ? -1 : katlaGuesses.length;
    return Array.from({ length: maxAttempts }, (_, attemptIndex) => {
      const guess = katlaGuesses[attemptIndex];
      if (guess) {
        return {
          letters: guess.guess.split(""),
          states: guess.states,
          status: "locked" as const,
        };
      }
      if (attemptIndex === inputRowIndex) {
        const letters = Array.from({ length: activeEntryLength }, (_, i) => currentGuess[i] ?? "");
        const states = Array.from({ length: activeEntryLength }, () => "empty" as KatlaTileState);
        return { letters, states, status: "active" as const };
      }
      const letters = Array.from({ length: activeEntryLength }, () => "");
      const states = Array.from({ length: activeEntryLength }, () => "empty" as KatlaTileState);
      return { letters, states, status: "idle" as const };
    });
  }, [
    activeEntryFailed,
    activeEntryLength,
    activeEntrySolved,
    currentGuess,
    katlaGuesses,
    maxAttempts,
  ]);

const katlaHeading = activeSlot
  ? `${activeSlot.no} ${activeSlot.arah === "mendatar" ? "Mendatar" : "Menurun"}`
  : "Pilih Slot TTS";

  const keyboardDisabled =
    !activeEntry ||
    activeEntrySolved ||
    activeEntryFailed;

  return (
    <div className="main-scene">
      <div className="main-scene__decor" aria-hidden>
        <p className="main-scene__decor-label">Start</p>
        <div className="main-scene__glyph-stack">
          {glyphPatterns.map((pattern, index) => (
            <div className="main-scene__glyph" key={index}>
              {pattern.map((row, rowIndex) => (
                <div className="main-scene__glyph-row" key={rowIndex}>
                  {row.split("").map((cell, cellIndex) => (
                    <span
                      key={cellIndex}
                      className={`main-scene__pixel${
                        cell === "1" ? " main-scene__pixel--active" : ""
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <main className="main-scene__content">
        <header className="main-scene__header">
          <h1>Tekla. Teklu. Katla.</h1>
          <p>
            Gim kata harian berbahasa Indonesia yang menggabungkan logika dan rasa. Masuk
            setiap hari, selesaikan teka-teki, dan lihat apakah kamu bisa menebak kata rahasia
            dalam enam langkah.
          </p>
        </header>

        <section className="main-scene__card">
          <h2>Cara Bermain</h2>
          <ul className="main-scene__hint-list">
            {hints.map((hint) => (
              <li key={hint.title}>
                <span className="main-scene__hint-title">{hint.title}</span>
                <p>{hint.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="main-scene__playground">
          <div className="main-scene__board-wrapper">
            <div className="main-scene__board">
              {template && template.grid ? (
                <>
                  {/* Crossword grid */}
                  <div
                    className="main-scene__grid"
                    style={
                      template
                        ? ({ "--cols": template.gridSize[1] } as BoardRowStyle)
                        : undefined
                    }
                  >
                    {template.grid.map((row, rowIndex) =>
                      row.map((cell, colIndex) => {
                        const isPlayable = cell === 1;
                        const letter = boardState[rowIndex]?.[colIndex] ?? "";
                        const cellNumber =
                          cellMetadata?.numbering[rowIndex]?.[colIndex] ?? null;
                        const cellSlots =
                          cellMetadata?.slotsByCell[rowIndex]?.[colIndex] ?? [];
                        const isSolvedCell =
                          cellSlots.length > 0 &&
                          cellSlots.every((slotNo) => solvedEntries[slotNo]);
                        const isFailedCell =
                          cellSlots.length > 0 &&
                          cellSlots.every((slotNo) => failedEntries[slotNo]);
                        const isSelected =
                          activeEntryNo != null && cellSlots.includes(activeEntryNo);
                        const isClickable =
                          isPlayable &&
                          cellSlots.some(
                            (slotNo) => !solvedEntries[slotNo] && !failedEntries[slotNo],
                          );
                        const baseStatus = (() => {
                          if (!isPlayable) return "inactive";
                          if (isSelected) return "active";
                          if (isSolvedCell) return "correct";
                          if (isFailedCell) return "wrong";
                          return null;
                        })();

                        const tileClasses = [
                          "main-scene__cell",
                          baseStatus ? `main-scene__cell--${baseStatus}` : "",
                          isPlayable ? "main-scene__cell--playable" : "",
                          letter ? "main-scene__cell--filled" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");

                        return (
                          <div
                            className={tileClasses}
                            key={`cell-${rowIndex}-${colIndex}`}
                            onClick={() =>
                              isClickable && handleCellClick(cellSlots, cellNumber)
                            }
                            role={isClickable ? "button" : undefined}
                            tabIndex={isClickable ? 0 : undefined}
                            onKeyDown={(event) => {
                              if (!isClickable) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleCellClick(cellSlots, cellNumber);
                              }
                            }}
                          >
                            {cellNumber && (
                              <span className="main-scene__cell-number">{cellNumber}</span>
                            )}
                            {letter}
                          </div>
                        );
                      }),
                    )}
                  </div>
                </>
              ) : (
                <p className="main-scene__board-placeholder">
                  Puzzle harian belum tersedia. Coba lagi beberapa saat.
                </p>
              )}
            </div>

            <aside className="main-scene__sidebar">
              <div className="main-scene__stat-card">
                <h3>2 Menit</h3>
                <p>Durasi rata-rata pemain menebak kata.</p>
              </div>
              {!showKatlaPanel && (
                <div className="main-scene__katla-intro">
                  <h3>Katla Mini Game</h3>
                  <p>
                    Pilih nomor pada papan TTS untuk membuka tantangan Katla. Setiap slot memiliki
                    kata rahasia {dailyPuzzle?.jawaban_harian.length ? "dari KBBI" : ""} yang harus
                    kamu tebak dalam enam percobaan.
                  </p>
                </div>
              )}
            </aside>

            {showKatlaPanel && (
              <div className="main-scene__katla-overlay" role="dialog" aria-modal="true">
                <div className="main-scene__katla-panel main-scene__katla-panel--overlay">
                  <div className="main-scene__katla-header">
                    <h3>{katlaHeading}</h3>
                    {activeSlot && activeEntryLength && (
                      <span>{activeEntryLength} Huruf</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="main-scene__katla-close"
                    onClick={handleCloseKatla}
                    aria-label="Tutup Katla"
                  >
                    X
                  </button>
                  {activeEntry && (
                    <div className="main-scene__katla-status">
                      {activeEntrySolved ? (
                        <>
                          <p>Slot #{activeEntry.no} sudah terisi sepenuhnya.</p>
                          <p className="main-scene__katla-status-note">
                            Huruf hasil kemenanganmu telah muncul di papan TTS.
                          </p>
                        </>
                      ) : activeEntryFailed ? (
                        <>
                          <p>Kesempatan untuk slot #{activeEntry.no} telah habis.</p>
                          <p className="main-scene__katla-status-note">
                            Coba slot lain atau tunggu puzzle harian berikutnya.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>
                            Tantang Katla dengan kata {activeEntryLength ?? "-"} huruf untuk slot #
                            {activeEntry.no}.
                          </p>
                          <p className="main-scene__katla-status-note">
                            Enam percobaan tersedia. Warna ubin akan memandumu menuju kata rahasia.
                          </p>
                        </>
                      )}
                      {isDev && (
                        <button
                          type="button"
                          className="main-scene__katla-status-dev"
                          onClick={handleMarkSolved}
                        >
                          Tandai Selesai (Dev)
                        </button>
                      )}
                    </div>
                  )}
                  <div className="main-scene__katla-board">
                    {activeEntry && activeEntryLength ? (
                      katlaBoardRows.map((row, rowIndex) => (
                        <div
                          className={[
                            "main-scene__katla-row",
                            row.status === "active" ? "main-scene__katla-row--active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={
                            activeEntryLength
                              ? ({ "--katla-cols": activeEntryLength } as KatlaRowStyle)
                              : undefined
                          }
                          key={`katla-row-${rowIndex}`}
                        >
                          {row.letters.map((letter, colIndex) => {
                            const state = row.states[colIndex] ?? "empty";
                            const tileClass = [
                              "main-scene__katla-tile",
                              state !== "empty" ? `main-scene__katla-tile--${state}` : "",
                              row.status === "active" ? "main-scene__katla-tile--current" : "",
                            ]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <span className={tileClass} key={`katla-cell-${rowIndex}-${colIndex}`}>
                                {letter}
                              </span>
                            );
                          })}
                        </div>
                      ))
                    ) : (
                      <p className="main-scene__katla-placeholder">
                        Pilih slot TTS di papan untuk mulai bermain Katla.
                      </p>
                    )}
                  </div>
                  {katlaMessage && (
                    <p className="main-scene__katla-message">{katlaMessage}</p>
                  )}
                  <div className="main-scene__katla-keyboard" role="presentation">
                    {KEYBOARD_LAYOUT.map((row, rowIndex) => (
                      <div className="main-scene__katla-keyboard-row" key={`kb-row-${rowIndex}`}>
                        {row.map((key) => {
                          const state = keyStatuses[key] ?? "empty";
                          const keyClass = [
                            "main-scene__key",
                            key === "ENTER" || key === "⌫" ? "main-scene__key--control" : "",
                            state !== "empty" ? `main-scene__key--${state}` : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <button
                              type="button"
                              key={key}
                              className={keyClass}
                              onClick={() => handleKeyboardInput(key)}
                              disabled={keyboardDisabled}
                            >
                              {key}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <div className="main-scene__decor main-scene__decor--mirror" aria-hidden>
        <p className="main-scene__decor-label">Hover</p>
        <div className="main-scene__glyph-stack">
          {glyphPatterns.map((pattern, index) => (
            <div className="main-scene__glyph" key={index}>
              {pattern.map((row, rowIndex) => (
                <div className="main-scene__glyph-row" key={rowIndex}>
                  {row.split("").map((cell, cellIndex) => (
                    <span
                      key={cellIndex}
                      className={`main-scene__pixel${
                        cell === "1" ? " main-scene__pixel--active" : ""
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
