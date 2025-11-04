import cors from "cors";
import express from "express";
import * as fs from "fs";
import { createServer } from "http";
import path from "path";
import { Server } from "socket.io";

// ----------------------
// App Initialization
// ----------------------

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO with CORS enabled for all origins
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// Define the port for the backend server
const PORT = 4000;
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const KBBI_PATH = path.resolve(__dirname, "..", "public", "kbbiWords.json");

type PuzzleTemplate = {
  id?: number;
  rows: number;
  cols: number;
  grid: number[][];
  answers: Array<{
    direction: "across" | "down";
    start: [number, number];
    word: string;
  }>;
};

type KatlaCheckPayload = {
  word?: string;
  templateId?: string | number;
  slotNo?: number;
};

type KatlaCheckResponse = {
  valid: boolean;
  correct: boolean;
};

type KbbiBank = Map<number, Set<string>>;

let puzzleFilesCache: string[] | null = null;
const puzzleTemplateCache = new Map<string, PuzzleTemplate>();
let kbbiBankCache: KbbiBank | null = null;

function getPuzzleFiles(): string[] {
  if (!puzzleFilesCache) {
    puzzleFilesCache = fs
      .readdirSync(PUBLIC_DIR)
      .filter((file) => file.startsWith("puzzle-") && file.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  return puzzleFilesCache;
}

function loadPuzzleTemplateById(templateId: string): PuzzleTemplate | null {
  const files = getPuzzleFiles();
  const index = Number(templateId);
  if (Number.isNaN(index) || index < 0 || index >= files.length) return null;
  const fileName = files[index];
  if (!puzzleTemplateCache.has(fileName)) {
    const filePath = path.join(PUBLIC_DIR, fileName);
    const content = fs.readFileSync(filePath, "utf8");
    puzzleTemplateCache.set(fileName, JSON.parse(content) as PuzzleTemplate);
  }
  return puzzleTemplateCache.get(fileName) ?? null;
}

function getKbbiBank(): KbbiBank {
  if (kbbiBankCache) return kbbiBankCache;
  const content = fs.readFileSync(KBBI_PATH, "utf8");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const bank: KbbiBank = new Map();

  Object.entries(parsed).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    const match = key.match(/\d+/);
    const declaredLength = match ? Number(match[0]) : undefined;
    (value as unknown[]).forEach((wordValue) => {
      if (typeof wordValue !== "string") return;
      const normalized = wordValue.trim().toUpperCase();
      if (!normalized) return;
      const length = declaredLength ?? normalized.length;
      if (!bank.has(length)) {
        bank.set(length, new Set());
      }
      bank.get(length)!.add(normalized);
    });
  });

  kbbiBankCache = bank;
  return bank;
}

// ----------------------
// Middleware
// ----------------------

app.use(cors());
app.use(express.json());
app.use("/static", express.static(path.resolve(__dirname, "..", "public")));

// ----------------------
// Health Check Endpoint
// ----------------------
// Useful for monitoring and confirming the backend is up.
app.get("/", (_, res) => {
  res.json({
    message: "Hello, World!"
  });
});

// ----------------------
// Health Check Endpoint
// ----------------------
// Useful for monitoring and confirming the backend is up.
app.get("/ping", (_, res) => {
  res.send("ttsla-backend OK");
});

// ----------------------
// Puzzle Templates Endpoint
// ----------------------
app.get("/api/puzzle-templates", (req, res) => {
  try {
    const templates: any = {};
    getPuzzleFiles().forEach((file, index) => {
      const filePath = path.join(PUBLIC_DIR, file);
      const content = fs.readFileSync(filePath, "utf8");
      const template = JSON.parse(content);
      templates[index.toString()] = template;
    });

    res.setHeader("Content-Type", "application/json");
    res.json(templates);
  } catch (error) {
    console.error("Error loading puzzle templates:", error);
    res.status(500).json({ error: "Failed to load puzzle templates" });
  }
});

// ----------------------
// KBBI Words Endpoint
// ----------------------
app.get("/api/kbbi-words", (req, res) => {
  try {
    console.log('[BE] Loading KBBI words from:', KBBI_PATH);
    const content = fs.readFileSync(KBBI_PATH, "utf8");
    const kbbiWords = JSON.parse(content);
    console.log('[BE] KBBI data loaded:', {
      hasKBBI: !!kbbiWords.KBBI,
      totalWords: kbbiWords.KBBI?.length || 0,
      sampleWords: kbbiWords.KBBI?.slice(0, 5) || [],
      lastWord: kbbiWords.KBBI?.[kbbiWords.KBBI.length - 1] || 'none'
    });

    res.setHeader("Content-Type", "application/json");
    res.json(kbbiWords);
  } catch (error) {
    console.error("Error loading KBBI words:", error);
    res.status(500).json({ error: "Failed to load KBBI words" });
  }
});

// ----------------------
// Katla Guess Validation Endpoint
// ----------------------
app.post("/api/katla/check", (req, res) => {
  try {

    const { word, templateId, slotNo } = req.body as KatlaCheckPayload;


    if (typeof word !== "string" || !word.trim()) {
      return res.status(400).json({ error: "Word is required" });
    }
    if (typeof slotNo !== "number" || !Number.isInteger(slotNo) || slotNo < 1) {
      return res.status(400).json({ error: "slotNo must be a positive integer" });
    }
    if (templateId === undefined || templateId === null) {
      return res.status(400).json({ error: "templateId is required" });
    }
    console.log("finding word:",word);
    const guess = word.trim().toUpperCase();
    const kbbiBank = getKbbiBank();
    const kbbiSet = kbbiBank.get(guess.length);
    const valid = kbbiSet ? kbbiSet.has(guess) : false;

    let correct = false;
    const template = loadPuzzleTemplateById(String(templateId));
    if (template && Array.isArray(template.answers)) {
      const answerEntry = template.answers[slotNo - 1];
      if (answerEntry && typeof answerEntry.word === "string") {
        correct = guess === answerEntry.word.trim().toUpperCase();
      }
    }

    const payload: KatlaCheckResponse = { valid, correct };
    res.json(payload);
  } catch (error) {
    console.error("Error validating Katla guess:", error);
    res.status(500).json({ error: "Failed to validate guess" });
  }
});

// ----------------------
// Start Server
// ----------------------
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
