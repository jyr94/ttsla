import "./MainScene.scss";

type TileState = "correct" | "present" | "absent" | "empty";

type BoardRow = {
  letters: string;
  states: TileState[];
};

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

const board: BoardRow[] = [
  {
    letters: "TEKLA",
    states: ["correct", "present", "present", "absent", "correct"],
  },
  {
    letters: "TEKLU",
    states: ["correct", "correct", "present", "absent", "present"],
  },
  {
    letters: "KATLA",
    states: ["present", "present", "absent", "present", "correct"],
  },
  {
    letters: "",
    states: ["empty", "empty", "empty", "empty", "empty"],
  },
  {
    letters: "",
    states: ["empty", "empty", "empty", "empty", "empty"],
  },
  {
    letters: "",
    states: ["empty", "empty", "empty", "empty", "empty"],
  },
];

const keyboardRows = [
  [
    { key: "Q", state: "absent" },
    { key: "W", state: "absent" },
    { key: "E", state: "present" },
    { key: "R", state: "absent" },
    { key: "T", state: "correct" },
    { key: "Y", state: "absent" },
    { key: "U", state: "present" },
    { key: "I", state: "absent" },
    { key: "O", state: "absent" },
    { key: "P", state: "absent" },
  ],
  [
    { key: "A", state: "present" },
    { key: "S", state: "absent" },
    { key: "D", state: "absent" },
    { key: "F", state: "absent" },
    { key: "G", state: "absent" },
    { key: "H", state: "absent" },
    { key: "J", state: "absent" },
    { key: "K", state: "present" },
    { key: "L", state: "absent" },
  ],
  [
    { key: "ENTER", state: "neutral" },
    { key: "Z", state: "absent" },
    { key: "X", state: "absent" },
    { key: "C", state: "absent" },
    { key: "V", state: "absent" },
    { key: "B", state: "absent" },
    { key: "N", state: "absent" },
    { key: "M", state: "absent" },
    { key: "⌫", state: "neutral" },
  ],
];

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
];

export default function MainScene() {
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
              {board.map((row, rowIndex) => (
                <div className="main-scene__board-row" key={rowIndex}>
                  {row.states.map((state, tileIndex) => {
                    const letter = row.letters[tileIndex] ?? "";
                    return (
                      <span
                        className={`main-scene__tile main-scene__tile--${state}`}
                        key={tileIndex}
                      >
                        {letter}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            <aside className="main-scene__stats">
              <div className="main-scene__stat-card">
                <h3>2 Menit</h3>
                <p>Durasi rata-rata pemain menebak kata.</p>
              </div>
              <div className="main-scene__stat-card">
                <h3>Mulai</h3>
                <p>Tekan tombol dan rasakan sensasi memburu kata rahasia.</p>
                <button type="button">Mulai Sekarang</button>
              </div>
            </aside>
          </div>

          <div className="main-scene__keyboard" role="presentation">
            {keyboardRows.map((row, rowIndex) => (
              <div className="main-scene__keyboard-row" key={rowIndex}>
                {row.map(({ key, state }) => (
                  <span
                    key={key}
                    className={`main-scene__key main-scene__key--${state}`}
                  >
                    {key}
                  </span>
                ))}
              </div>
            ))}
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
