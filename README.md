# TTSLA — Crossword Puzzle Inspired by Katla

**TTSLA (Teka Teki Silang berbasis Katla)** is an interactive web-based crossword puzzle game inspired by the Indonesian version of Wordle (Katla).
Players solve interconnected crossword grids using Katla-style mechanics, where letter hints appear based on their accuracy.

The game features daily puzzles where players must guess words in a crossword format. When a word is solved through Katla (the guessing mini-game), intersecting words that are now fully filled with correct letters are automatically solved as well.

## Features

- Interactive crossword grid with Katla-style feedback colors
- Real-time validation of words against KBBI (Indonesian dictionary)
- Crosswords are linked between clues (across & down) with auto-solving for intersecting words
- Daily puzzles with interconnected word relationships
- Smooth keyboard interaction and animations
- Modular monorepo structure (frontend + backend)
- Built for scalability and easy local development

## Project Structure

```
ttsla/
├── apps/
│   ├── backend/     # Express + Socket.IO backend
│   └── frontend/    # React + Vite + TypeScript frontend
├── package.json     # Root config (pnpm workspace + concurrently)
├── pnpm-workspace.yaml
├── tsconfig.json
└── LICENSE
```

## Tech Stack

### Frontend
- React 19
- Vite 7
- TypeScript
- Sass (SCSS)
- Zustand — state management
- React Router DOM 7
- React GA4 — Google Analytics integration
- Vitest + Testing Library — testing utilities

### Backend
- Node.js + Express 5
- Socket.IO 4 — real-time communication
- TypeScript
- ts-node-dev — hot reload for backend development

### Tooling
- pnpm — monorepo package manager
- concurrently — run frontend and backend together

## Installation

Clone the repository and install dependencies using pnpm:

```bash
git clone https://github.com/your-username/ttsla.git
cd ttsla
pnpm install
```

## Running the Project

To start both frontend and backend concurrently:

```bash
pnpm run dev
```

This will launch:
- Frontend → http://localhost:5173
- Backend → http://localhost:4000

Example output:

```
VITE v7.0.4  ready in 2s
→ Local: http://localhost:5173/
Backend running on http://localhost:4000
```

## How to Play

1. **Select a Slot**: Click on numbered cells in the crossword grid to select a word slot
2. **Play Katla**: Guess the word using Katla mechanics - you have 6 attempts
3. **Color Feedback**:
   - 🟩 Green: Correct letter in correct position
   - 🟨 Yellow: Correct letter in wrong position
   - ⬛ Gray: Letter not in the word
4. **Auto-Solving**: When you solve a word, intersecting words that are now fully filled with correct letters are automatically solved
5. **Complete the Puzzle**: Continue solving slots until all words are filled

## Development Notes

- Frontend and backend can also be run separately:

```bash
# In one terminal
pnpm --filter ttsla-backend dev

# In another terminal
pnpm --filter ttsla-frontend dev
```

- Global styles are defined in `frontend/src/globals.scss` using the Inter font.
- Backend entry point: `apps/backend/src/index.ts`

## Scripts Overview

| Command | Description |
|----------|--------------|
| `pnpm run dev` | Run frontend & backend concurrently |
| `pnpm --filter ttsla-frontend dev` | Run frontend only |
| `pnpm --filter ttsla-backend dev` | Run backend only |
| `pnpm --filter ttsla-frontend build` | Build frontend for production |
| `pnpm --filter ttsla-frontend preview` | Preview built frontend |

## License

This project is licensed under the ISC License.

## Author

Developed by Nam Do San.
