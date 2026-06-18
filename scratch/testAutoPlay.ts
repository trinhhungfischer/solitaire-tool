import * as fs from 'fs';
import { getBestAutoMove } from '../src/lib/autoPlay';
import { GameState, PlayableCard } from '../src/lib/gameLogic';

function lcg(seed: number) {
  let m = 0x80000000;
  let a = 1103515245;
  let c = 12345;
  let state = seed ? seed : Math.floor(Math.random() * (m - 1));

  return function() {
    state = (a * state + c) % m;
    return state / (m - 1);
  };
}

const levelData = JSON.parse(fs.readFileSync('e:/3HP-Project/solitaire-tool/public/level/Level_1.json', 'utf-8'));
const columnCards = levelData.columnCards;
const foundationCount = levelData.foundationCount;
const data = levelData.data;

const seed = 1;
const rng = lcg(seed);

const arr: PlayableCard[] = data.map((c: any) => ({
  ...c,
  absorbedCount: c.kind === 1 ? 0 : undefined
}));

for (let i = arr.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

const cols: PlayableCard[][] = [];
let cardIndex = 0;

for (const count of columnCards) {
  const col = [];
  for (let i = 0; i < count; i++) {
    if (cardIndex < arr.length) {
      col.push({
        ...arr[cardIndex],
        isRevealed: i === count - 1
      });
      cardIndex++;
    }
  }
  cols.push(col);
}

const drawPile = arr.slice(cardIndex).map(c => ({ ...c, isRevealed: true }));
const wastePile: PlayableCard[] = [];
const foundations: PlayableCard[][] = Array.from({ length: foundationCount }, () => []);

let gameState: GameState | null = { drawPile, wastePile, cols, foundations, moves: 0 };
let cardsDrawnSinceLastMove = 0;

console.log("Starting Auto Play Simulation...");
console.log("Initial Draw Pile Size:", drawPile.length);

let step = 0;
while (gameState && step < 1000) {
  step++;
  const nextState = getBestAutoMove(gameState, 'new');
  if (nextState) {
    gameState = nextState;
    cardsDrawnSinceLastMove = 0;
    console.log(`Step ${step}: MOVE MADE. Cards left in draw/waste: ${gameState.drawPile.length}/${gameState.wastePile.length}. Cols: ${gameState.cols.map(c => c.length)}`);
  } else {
    // No move, draw
    const deckSize = gameState.drawPile.length + gameState.wastePile.length;
    if (cardsDrawnSinceLastMove > deckSize + 1 && deckSize > 0) {
      console.log(`Step ${step}: STOPPED. Deck cycled with no moves. Deck Size = ${deckSize}, Cards Drawn = ${cardsDrawnSinceLastMove}`);
      break;
    }

    cardsDrawnSinceLastMove++;
    if (gameState.drawPile.length > 0) {
      const newDraw = [...gameState.drawPile];
      const card = newDraw.shift()!;
      gameState = { ...gameState, drawPile: newDraw, wastePile: [...gameState.wastePile, card], moves: gameState.moves + 1 };
      // console.log(`Step ${step}: Drawn card. New draw/waste: ${gameState.drawPile.length}/${gameState.wastePile.length}`);
    } else if (gameState.wastePile.length > 0) {
      gameState = { ...gameState, drawPile: [...gameState.wastePile].reverse(), wastePile: [], moves: gameState.moves + 1 };
      // console.log(`Step ${step}: Reversed deck. New draw/waste: ${gameState.drawPile.length}/${gameState.wastePile.length}`);
    } else {
      console.log(`Step ${step}: NO MOVES AND DECK EMPTY. STOPPING.`);
      break;
    }
  }
}

let cardsLeft = gameState.cols.reduce((sum, c) => sum + c.length, 0) + gameState.drawPile.length + gameState.wastePile.length;
if (cardsLeft === 0 || (gameState.cols.reduce((sum, c) => sum + c.length, 0) === 0 && gameState.wastePile.length === 0 && gameState.drawPile.length === 0)) {
  console.log("SOLVED!");
} else {
  console.log(`FAILED. Cards left on board: ${cardsLeft}`);
  console.log("Final State:");
  console.log("Cols:");
  gameState.cols.forEach((col, i) => {
    console.log(` Col ${i}: ${col.map(c => c.kind === 1 ? 'BASE ' + c.category.id : 'MATH ' + c.category.id).join(', ')}`);
  });
  console.log("Waste:", gameState.wastePile.map(c => c.kind === 1 ? 'BASE ' + c.category.id : 'MATH ' + c.category.id).join(', '));
}
