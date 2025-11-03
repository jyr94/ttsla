import { useMemo, useState, type FormEvent, type ChangeEvent } from "react";
import {
  getAnswerSetById,
  getMappingForDate,
  getTemplateById,
  mappingEntries,
  type Template,
  type TemplateWord,
} from "~/data/gameData";
import "./styles.scss";

type GuessStatus = "correct" | "present" | "absent";

interface GuessRow {
  guess: string;
  statuses: GuessStatus[];
}

interface WordProgress {
  rows: GuessRow[];
  isFailed: boolean;
}

const MAX_ATTEMPTS = 6;

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const createCellKey = (row: number, col: number) => `${row}-${col}`;

const evaluateGuess = (guess: string, answer: string): GuessStatus[] => {
  const normalizedGuess = guess.toUpperCase();
  const normalizedAnswer = answer.toUpperCase();
  const statuses: GuessStatus[] = Array.from({ length: normalizedAnswer.length }, () => "absent");
  const answerChars = normalizedAnswer.split("");

  for (let index = 0; index < normalizedAnswer.length; index += 1) {
    if (normalizedGuess[index] === normalizedAnswer[index]) {
      statuses[index] = "correct";
      answerChars[index] = "";
    }
  }

  for (let index = 0; index < normalizedAnswer.length; index += 1) {
    if (statuses[index] === "correct") continue;
    const letter = normalizedGuess[index];
    const letterIndex = answerChars.indexOf(letter);
    if (letterIndex !== -1) {
      statuses[index] = "present";
      answerChars[letterIndex] = "";
    }
  }

  return statuses;
};

type WordleModalProps = {
  isOpen: boolean;
  wordNo: number;
  templateWord: TemplateWord;
  answer: string;
  progress: WordProgress;
  onClose: () => void;
  onProgress: (progress: WordProgress) => void;
  onSolved: (word: string) => void;
};

const WordleModal = ({
  isOpen,
  wordNo,
  templateWord,
  answer,
  progress,
  onClose,
  onProgress,
  onSolved,
}: WordleModalProps) => {
  const [currentGuess, setCurrentGuess] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const { rows, isFailed } = progress;
  const isSolved = rows.some((row) => row.guess.toUpperCase() === answer.toUpperCase());
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - rows.length);
  const computedMessage =
    message ?? (isFailed && !isSolved ? `Kesempatan habis. Jawaban yang dicari: ${answer.toUpperCase()}.` : null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSolved || isFailed) return;

    const trimmedGuess = currentGuess.trim().toUpperCase();
    if (trimmedGuess.length !== answer.length) {
      setMessage(`Tebakan harus ${answer.length} huruf.`);
      return;
    }

    const statuses = evaluateGuess(trimmedGuess, answer);
    const nextRows: GuessRow[] = [...rows, { guess: trimmedGuess, statuses }];
    const solved = trimmedGuess === answer.toUpperCase();
    const failed = !solved && nextRows.length >= MAX_ATTEMPTS;

    onProgress({ rows: nextRows, isFailed: failed });
    setCurrentGuess("");
    setMessage(null);

    if (solved) {
      onSolved(trimmedGuess);
      return;
    }

    if (failed) {
      setMessage(`Kesempatan habis. Jawaban yang dicari: ${answer.toUpperCase()}.`);
    }
  };

  const handleClose = () => {
    setCurrentGuess("");
    setMessage(null);
    onClose();
  };

  const renderRows = () => {
    const filledRows = rows;
    const emptySlots = Math.max(MAX_ATTEMPTS - filledRows.length, 0);

    return [
      ...filledRows,
      ...Array.from({ length: emptySlots }, () => ({ guess: "", statuses: [] as GuessStatus[] })),
    ].map((row, index) => (
      <div className="wordle-row" key={`row-${index}`}>
        {Array.from({ length: answer.length }, (_, columnIndex) => {
          const letter = row.guess[columnIndex] ?? "";
          const status = row.statuses[columnIndex] ?? "";
          return (
            <div className={`wordle-cell wordle-cell--${status || "empty"}`} key={`cell-${columnIndex}`}>
              {letter}
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div className="wordle-modal" role="dialog" aria-modal>
      <div className="wordle-modal__backdrop" onClick={handleClose} />
      <div className="wordle-modal__content">
        <header className="wordle-modal__header">
          <h2>
            Kata #{wordNo} · {templateWord.arah === "mendatar" ? "Mendatar" : "Menurun"}
          </h2>
          <button type="button" className="wordle-modal__close" onClick={handleClose}>
            ×
          </button>
        </header>
        <p className="wordle-modal__meta">
          Tebak kata dengan {answer.length} huruf. Kesempatan tersisa {attemptsLeft}.
        </p>
        <div className="wordle-modal__board">{renderRows()}</div>
        <form className="wordle-modal__form" onSubmit={handleSubmit}>
          <input
            type="text"
            maxLength={answer.length}
            value={currentGuess}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setCurrentGuess(event.target.value.toUpperCase())
            }
            placeholder="Masukkan tebakan"
            disabled={isSolved || isFailed}
          />
          <button type="submit" disabled={isSolved || isFailed}>
            Tebak
          </button>
        </form>
        {computedMessage && <p className="wordle-modal__message">{computedMessage}</p>}
        {isSolved && <p className="wordle-modal__message wordle-modal__message--success">Hebat! Kata berhasil dipecahkan.</p>}
      </div>
    </div>
  );
};

type CrosswordBoardProps = {
  template: Template;
  solvedWords: Record<number, string>;
  onWordSelect: (word: TemplateWord) => void;
};

const CrosswordBoard = ({ template, solvedWords, onWordSelect }: CrosswordBoardProps) => {
  const playableCells = useMemo(() => {
    const set = new Set<string>();
    template.words.forEach((word) => {
      for (let step = 0; step < word.length; step += 1) {
        const row = word.start[0] + (word.arah === "menurun" ? step : 0);
        const col = word.start[1] + (word.arah === "mendatar" ? step : 0);
        set.add(createCellKey(row, col));
      }
    });
    return set;
  }, [template.words]);

  const startNumbers = useMemo(() => {
    const map = new Map<string, number>();
    template.words.forEach((word) => {
      map.set(createCellKey(word.start[0], word.start[1]), word.no);
    });
    return map;
  }, [template.words]);

  const filledCells = useMemo(() => {
    const map = new Map<string, string>();
    template.words.forEach((word) => {
      const solved = solvedWords[word.no];
      if (!solved) return;
      for (let step = 0; step < solved.length; step += 1) {
        const row = word.start[0] + (word.arah === "menurun" ? step : 0);
        const col = word.start[1] + (word.arah === "mendatar" ? step : 0);
        map.set(createCellKey(row, col), solved[step] ?? "");
      }
    });
    return map;
  }, [solvedWords, template.words]);

  return (
    <div
      className="crossword-grid"
      style={{
        gridTemplateColumns: `repeat(${template.gridSize[1]}, minmax(2.5rem, 1fr))`,
        gridTemplateRows: `repeat(${template.gridSize[0]}, minmax(2.5rem, 1fr))`,
      }}
    >
      {Array.from({ length: template.gridSize[0] }, (_, row) =>
        Array.from({ length: template.gridSize[1] }, (_, col) => {
          const cellKey = createCellKey(row, col);
          const isPlayable = playableCells.has(cellKey);
          const letter = filledCells.get(cellKey) ?? "";
          const wordNumber = startNumbers.get(cellKey);
          const isSolved = wordNumber ? Boolean(solvedWords[wordNumber]) : false;

          return (
            <div
              key={cellKey}
              className={`crossword-cell${isPlayable ? "" : " crossword-cell--blocked"}`}
            >
              {wordNumber && (
                <button
                  type="button"
                  className={`crossword-cell__number${isSolved ? " crossword-cell__number--solved" : ""}`}
                  onClick={() => {
                    if (!isSolved) {
                      const word = template.words.find((item) => item.no === wordNumber);
                      if (word) onWordSelect(word);
                    }
                  }}
                  disabled={isSolved}
                >
                  {wordNumber}
                </button>
              )}
              {isPlayable && <span className="crossword-cell__letter">{letter}</span>}
            </div>
          );
        }),
      )}
    </div>
  );
};

export default function MainScene() {
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const activeMapping = useMemo(
    () => getMappingForDate(todayKey) ?? mappingEntries[0],
    [todayKey],
  );

  const template = activeMapping ? getTemplateById(activeMapping.template_id) : undefined;
  const answerSet = activeMapping ? getAnswerSetById(activeMapping.jawaban_id) : undefined;

  const [activeWord, setActiveWord] = useState<TemplateWord | null>(null);
  const [solvedWords, setSolvedWords] = useState<Record<number, string>>({});
  const [progressByWord, setProgressByWord] = useState<Record<number, WordProgress>>({});

  const answersByWordNumber = useMemo(() => {
    if (!answerSet) return new Map<number, string>();
    return new Map(answerSet.words.map((word) => [word.no, word.jawaban.toUpperCase()]));
  }, [answerSet]);

  if (!template || !answerSet) {
    return (
      <div className="main-scene">
        <div className="main-scene__container">
          <h1 className="main-scene__title">TTSLA</h1>
          <p>Tidak ada teka-teki yang tersedia untuk hari ini.</p>
        </div>
      </div>
    );
  }

  const handleWordSelect = (word: TemplateWord) => {
    setActiveWord(word);
  };

  const handleCloseModal = () => {
    setActiveWord(null);
  };

  const handleSolved = (word: string) => {
    if (!activeWord) return;
    setSolvedWords((previous) => ({ ...previous, [activeWord.no]: word }));
    setActiveWord(null);
  };

  const handleProgressUpdate = (wordNumber: number, progress: WordProgress) => {
    setProgressByWord((previous) => ({ ...previous, [wordNumber]: progress }));
  };

  const totalWords = template.words.length;
  const solvedCount = template.words.filter((word) => solvedWords[word.no]).length;
  const allSolved = solvedCount === totalWords;

  const activeAnswer = activeWord ? answersByWordNumber.get(activeWord.no) : undefined;
  const activeProgress = activeWord
    ? progressByWord[activeWord.no] ?? { rows: [], isFailed: false }
    : { rows: [], isFailed: false };

  return (
    <div className="main-scene">
      <div className="main-scene__container">
        <header className="main-scene__header">
          <div>
            <h1 className="main-scene__title">TTSLA</h1>
            <p className="main-scene__subtitle">Gabungan teka-teki silang dan permainan gaya Katla.</p>
          </div>
          <div className="main-scene__meta">
            <span>{template.name}</span>
            <span>{answerSet.title}</span>
            <span>
              Selesai {solvedCount}/{totalWords}
            </span>
          </div>
        </header>

        <div className="main-scene__layout">
          <div className="main-scene__board">
            <CrosswordBoard template={template} solvedWords={solvedWords} onWordSelect={handleWordSelect} />
          </div>
          <aside className="main-scene__sidebar">
            <h2>Cara Bermain</h2>
            <ol>
              <li>Pilih nomor pada papan untuk membuka mini game.</li>
              <li>Tebak kata dengan maksimal enam percobaan.</li>
              <li>Warna hijau = huruf & posisi benar, kuning = huruf ada namun salah tempat.</li>
              <li>Jika benar, kata akan otomatis terisi pada papan.</li>
            </ol>
            {allSolved && <p className="main-scene__success">Selamat! Semua kata berhasil dipecahkan.</p>}
          </aside>
        </div>
      </div>

      {activeWord && activeAnswer && (
        <WordleModal
          isOpen
          wordNo={activeWord.no}
          templateWord={activeWord}
          answer={activeAnswer}
          progress={activeProgress}
          onClose={handleCloseModal}
          onProgress={(progress) => handleProgressUpdate(activeWord.no, progress)}
          onSolved={handleSolved}
        />
      )}
    </div>
  );
}
