import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDailyPuzzle,
  TTS_TEMPLATES,
  type DailyPuzzle,
  type JawabanHarianEntry,
  type TTSSlot,
  type TTSTemplate
} from "~/game/dailyPuzzle";
import "./MainScene.scss";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

type CrosswordCell = {
  row: number;
  col: number;
  labels: number[];
  partOf: number[];
  playable: boolean;
  letters: Record<number, string>;
};

type WordEntry = {
  slot: TTSSlot;
  entry: JawabanHarianEntry | null;
};

function combinePuzzleWithTemplate(puzzle: DailyPuzzle | null): {
  template: TTSTemplate | null;
  words: WordEntry[];
} {
  if (!puzzle) {
    return { template: null, words: [] };
  }

  const template =
    TTS_TEMPLATES.find((item) => item.id === puzzle.template_id) ?? null;

  if (!template) {
    return { template: null, words: [] };
  }

  const words: WordEntry[] = template.words.map((slot) => ({
    slot,
    entry: puzzle.jawaban_harian.find((jawaban) => jawaban.no === slot.no) ?? null
  }));

  return { template, words };
}

function buildGrid(template: TTSTemplate | null, words: WordEntry[]): CrosswordCell[][] {
  if (!template) return [];

  const [rows, cols] = template.gridSize;
  const matrix: (CrosswordCell | null)[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      row,
      col,
      labels: [],
      partOf: [],
      playable: false,
      letters: {}
    }))
  );

  words.forEach(({ slot, entry }) => {
    const { no, start, length, arah } = slot;
    const answer = entry?.jawaban ?? "";

    for (let i = 0; i < length; i += 1) {
      const row = start[0] + (arah === "menurun" ? i : 0);
      const col = start[1] + (arah === "mendatar" ? i : 0);
      const cell = matrix[row]?.[col];

      if (!cell) continue;

      cell.partOf.push(no);
      cell.playable = cell.playable || !!entry?.playable;
      cell.letters[no] = answer[i] ?? "";
    }

    const startCell = matrix[start[0]]?.[start[1]];
    if (startCell && !startCell.labels.includes(no)) {
      startCell.labels.push(no);
    }
  });

  return matrix.map((row) =>
    row.map((cell) => {
      if (!cell?.partOf.length) {
        return {
          row: cell?.row ?? 0,
          col: cell?.col ?? 0,
          labels: [],
          partOf: [],
          playable: false,
          letters: {}
        } satisfies CrosswordCell;
      }
      return cell satisfies CrosswordCell;
    })
  );
}

function formatDate(dateISO: string) {
  try {
    const date = new Date(dateISO);
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  } catch (error) {
    void error;
    return dateISO;
  }
}

export default function MainScene() {
  const puzzle = useMemo(() => getDailyPuzzle(), []);
  const { template, words } = useMemo(() => combinePuzzleWithTemplate(puzzle), [puzzle]);

  const [activeWordNo, setActiveWordNo] = useState<number | null>(() => words[0]?.slot.no ?? null);

  useEffect(() => {
    if (!words.length) {
      setActiveWordNo(null);
      return;
    }
    setActiveWordNo((current) => {
      if (current && words.some((word) => word.slot.no === current)) {
        return current;
      }
      return words[0]?.slot.no ?? null;
    });
  }, [words]);

  const grid = useMemo(() => buildGrid(template, words), [template, words]);

  const selectedWord = useMemo(
    () => words.find((word) => word.slot.no === activeWordNo) ?? null,
    [activeWordNo, words]
  );

  const handleSelectWord = useCallback((wordNo: number) => {
    setActiveWordNo(wordNo);
  }, []);

  const handlePlayWord = useCallback(
    (wordNo: number) => {
      const target = words.find((word) => word.slot.no === wordNo);
      if (!target) return;
      setActiveWordNo(wordNo);

      const payload = {
        type: "ttsla:start-word",
        wordNo,
        direction: target.slot.arah,
        length: target.slot.length,
        answer: target.entry?.jawaban ?? null,
        playable: target.entry?.playable ?? false
      };

      window.dispatchEvent(new CustomEvent("ttsla:start-word", { detail: payload }));
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    },
    [words]
  );

  const handleCellClick = useCallback(
    (cell: CrosswordCell) => {
      if (!cell.partOf.length) return;
      const nextWordNo = (() => {
        if (!activeWordNo) return cell.partOf[0];
        if (!cell.partOf.includes(activeWordNo)) return cell.partOf[0];
        if (cell.partOf.length === 1) return cell.partOf[0];
        const currentIndex = cell.partOf.indexOf(activeWordNo);
        return cell.partOf[(currentIndex + 1) % cell.partOf.length];
      })();
      handleSelectWord(nextWordNo);
    },
    [activeWordNo, handleSelectWord]
  );

  if (!template) {
    return (
      <div className="main-scene main-scene--empty">
        <div className="main-scene__fallback">
          <h1>Teka-Teki Harian Tidak Tersedia</h1>
          <p>Cobalah lagi beberapa saat lagi.</p>
        </div>
      </div>
    );
  }

  const [rows] = template.gridSize;

  return (
    <div className="main-scene">
      <header className="main-scene__header">
        <p className="main-scene__eyebrow">Tantangan Harian</p>
        <h1>Tekla. Teklu. Katla.</h1>
        <p className="main-scene__meta">
          {formatDate(puzzle?.date ?? "")} &middot; Template {template.name} ({rows} x {template.gridSize[1]})
        </p>
        <p className="main-scene__intro">
          Jelajahi teka-teki silang yang diisi dengan kata-kata KBBI. Pilih nomor untuk melihat kata harian dan mulai permainan
          Katla dengan satu ketukan.
        </p>
      </header>

      <main className="main-scene__body">
        <section className="main-scene__board" aria-label="Papan teka-teki harian">
          <div
            className="main-scene__grid"
            style={{ gridTemplateColumns: `repeat(${template.gridSize[1]}, minmax(0, 1fr))` }}
          >
            {grid.map((row) =>
              row.map((cell) => {
                const key = `${cell.row}-${cell.col}`;
                if (!cell.partOf.length) {
                  return <span key={key} className="main-scene__cell main-scene__cell--void" aria-hidden />;
                }

                const isActive = activeWordNo ? cell.partOf.includes(activeWordNo) : false;
                const letter = activeWordNo ? cell.letters[activeWordNo] ?? "" : "";

                return (
                  <button
                    type="button"
                    key={key}
                    className={`main-scene__cell${isActive ? " main-scene__cell--active" : ""}`}
                    onClick={() => handleCellClick(cell)}
                    aria-label={`Kotak ${cell.row + 1}, ${cell.col + 1}${
                      cell.labels.length ? `, nomor ${cell.labels.join("/")}` : ""
                    }`}
                  >
                    {cell.labels.length > 0 && (
                      <span className="main-scene__cell-label">{cell.labels.join("/")}</span>
                    )}
                    <span className="main-scene__cell-letter">{letter}</span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="main-scene__sidebar">
          <section className="main-scene__panel">
            <h2>Kata Hari Ini</h2>
            <ul className="main-scene__word-list">
              {words.map(({ slot, entry }) => {
                const isActive = slot.no === activeWordNo;
                return (
                  <li key={slot.no} className={isActive ? "is-active" : undefined}>
                    <button
                      type="button"
                      className="main-scene__word-button"
                      onClick={() => handleSelectWord(slot.no)}
                    >
                      <span className="main-scene__word-no">{slot.no}</span>
                      <span className="main-scene__word-body">
                        <strong>{slot.arah === "mendatar" ? "Mendatar" : "Menurun"}</strong>
                        <span>{slot.length} huruf &middot; {entry?.playable ? "Siap dimainkan" : "Sedang disiapkan"}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="main-scene__word-action"
                      onClick={() => handlePlayWord(slot.no)}
                      disabled={!entry?.playable}
                    >
                      Mulai
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {selectedWord && (
            <section className="main-scene__panel main-scene__panel--highlight">
              <h3>Nomor {selectedWord.slot.no}</h3>
              <p className="main-scene__selected-meta">
                {selectedWord.slot.arah === "mendatar" ? "Mendatar" : "Menurun"} &middot; {selectedWord.slot.length} huruf
              </p>
              <div className="main-scene__answer-preview" aria-live="polite">
                {selectedWord.entry?.jawaban
                  ? selectedWord.entry.jawaban.split("").map((char, idx) => (
                      <span key={`${selectedWord.slot.no}-${idx}`}>{char}</span>
                    ))
                  : <span className="main-scene__answer-placeholder">????</span>}
              </div>
              <p className="main-scene__panel-note">
                Tekan "Mulai" untuk mengirim kata ini ke permainan Katla dan mulai menebak hurufnya.
              </p>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
