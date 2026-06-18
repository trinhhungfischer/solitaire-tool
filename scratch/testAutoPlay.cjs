const fs = require('fs');

function lcg(seed) {
  let m = 0x80000000;
  let a = 1103515245;
  let c = 12345;
  let state = seed ? seed : Math.floor(Math.random() * (m - 1));

  return function() {
    state = (a * state + c) % m;
    return state / (m - 1);
  };
}

function computeDropState(prevState, source, destType, destIndex, gameRule) {
  if (source.type === destType && source.index === destIndex) return null;
  
  const newState = { 
    ...prevState, 
    cols: prevState.cols.map(c => [...c]), 
    wastePile: [...prevState.wastePile], 
    foundations: prevState.foundations.map(f => [...f]),
    moves: prevState.moves + 1
  };
  
  let sourceArray;
  if (source.type === 'col') sourceArray = newState.cols[source.index];
  else if (source.type === 'waste') sourceArray = newState.wastePile;
  else if (source.type === 'foundation') sourceArray = newState.foundations[source.index];
  else return null;

  if (sourceArray.length === 0 || source.startIndex === undefined || source.startIndex >= sourceArray.length) return null;
  
  const cardsToMove = sourceArray.slice(source.startIndex);
  const bottomCardToMove = cardsToMove[0];

  let destArray;
  if (destType === 'col') destArray = newState.cols[destIndex];
  else destArray = newState.foundations[destIndex];

  let validMove = false;

  if (bottomCardToMove.kind === 0) {
    if (destArray.length > 0) {
      const destCard = destArray[destArray.length - 1];
      if (destCard.category.id === bottomCardToMove.category.id) {
        if (destCard.kind === 1) {
          if (gameRule === 'new' && destType === 'col') {
            validMove = false;
          } else {
            validMove = true;
            sourceArray.splice(source.startIndex);
            const newDestCard = { ...destCard, absorbedCount: (destCard.absorbedCount || 0) + cardsToMove.length };
            destArray[destArray.length - 1] = newDestCard;
            if (newDestCard.absorbedCount >= newDestCard.category.elementCount - 1) destArray.pop();
          }
        } else {
          validMove = true;
          sourceArray.splice(source.startIndex);
          destArray.push(...cardsToMove);
        }
      }
    } else if (gameRule === 'new' && destType === 'col') {
      validMove = true;
      sourceArray.splice(source.startIndex);
      destArray.push(...cardsToMove);
    }
  } else if (bottomCardToMove.kind === 1) {
    if (destArray.length === 0) {
      validMove = true;
      sourceArray.splice(source.startIndex);
      destArray.push(...cardsToMove);
    } else if (gameRule === 'new' && destType === 'col') {
      const destCard = destArray[destArray.length - 1];
      if (destCard.kind === 0 && destCard.category.id === bottomCardToMove.category.id) {
        validMove = true;
        let matchCount = 0;
        for (let i = destArray.length - 1; i >= 0; i--) {
          const c = destArray[i];
          if (c.kind === 0 && c.category.id === destCard.category.id && c.isRevealed) matchCount++;
          else break;
        }
        destArray.splice(destArray.length - matchCount, matchCount);
        const newBaseCard = { ...bottomCardToMove, absorbedCount: (bottomCardToMove.absorbedCount || 0) + matchCount };
        sourceArray.splice(source.startIndex);
        if (newBaseCard.absorbedCount < newBaseCard.category.elementCount - 1) {
          destArray.push(newBaseCard);
        }
      }
    }
  }

  if (validMove) {
    if (source.type === 'col' && sourceArray.length > 0) {
      sourceArray[sourceArray.length - 1] = { ...sourceArray[sourceArray.length - 1], isRevealed: true };
    }
    if (destType === 'col' && destArray.length > 0) {
      destArray[destArray.length - 1] = { ...destArray[destArray.length - 1], isRevealed: true };
    }
    return newState;
  }
  return null;
}

function getBestAutoMove(prevState, gameRule) {
  const scoredMoves = [];

  const sources = [];
  
  if (prevState.wastePile.length > 0) {
    sources.push({ type: 'waste', startIndex: prevState.wastePile.length - 1 });
  }

  prevState.cols.forEach((col, i) => {
    if (col.length === 0) return;
    for (let j = col.length - 1; j >= 0; j--) {
      const card = col[j];
      if (!card.isRevealed) break;
      
      let isValidStack = true;
      if (j < col.length - 1) {
        if (card.kind !== 0) isValidStack = false;
        else {
          for (let k = j; k < col.length; k++) {
            const c = col[k];
            if (c.kind !== 0 || c.category.id !== card.category.id || !c.isRevealed) {
              isValidStack = false;
              break;
            }
          }
        }
      }
      if (isValidStack) {
        sources.push({ type: 'col', index: i, startIndex: j });
      }
    }
  });

  for (const src of sources) {
    for (let i = 0; i < prevState.foundations.length; i++) {
      const result = computeDropState(prevState, src, 'foundation', i, gameRule);
      if (result) {
        scoredMoves.push({ score: 500, newState: result });
      }
    }

    for (let i = 0; i < prevState.cols.length; i++) {
      if (src.type === 'col' && src.index === i) continue;
      if (src.type === 'col' && src.startIndex === 0 && prevState.cols[i].length === 0) continue;
      
      const result = computeDropState(prevState, src, 'col', i, gameRule);
      if (result) {
        let score = 0;
        
        const prevTotal = prevState.cols.reduce((sum, c) => sum + c.length, 0);
        const newTotal = result.cols.reduce((sum, c) => sum + c.length, 0);
        const isAbsorbing = newTotal < prevTotal;

        if (isAbsorbing) {
          score += 500;
        }

        if (src.type === 'col') {
          const sourceCol = prevState.cols[src.index];
          const revealsHidden = src.startIndex > 0 && !sourceCol[src.startIndex - 1].isRevealed;
          const emptiesColumn = src.startIndex === 0;

          if (revealsHidden) score += 300;
          if (emptiesColumn) score += 200;

          if (!isAbsorbing && !revealsHidden && !emptiesColumn) continue;
          if (prevState.cols[i].length === 0 && !revealsHidden) continue;

          if (!isAbsorbing && !revealsHidden && emptiesColumn) {
            score += 10;
          }
        } else if (src.type === 'waste') {
          score += 100;
        }

        if (score > 0) {
          scoredMoves.push({ score, newState: result });
        }
      }
    }
  }

  if (scoredMoves.length === 0) return null;

  scoredMoves.sort((a, b) => b.score - a.score);
  return scoredMoves[0].newState;
}

const levelData = JSON.parse(fs.readFileSync('e:/3HP-Project/solitaire-tool/public/level/Level_1.json', 'utf-8'));
const columnCards = levelData.columnCards;
const foundationCount = levelData.foundationCount;
const data = levelData.data;

const seed = 1;
const rng = lcg(seed);

const arr = data.map(c => ({
  ...c,
  absorbedCount: c.kind === 1 ? 0 : undefined
}));

for (let i = arr.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

const cols = [];
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
const wastePile = [];
const foundations = Array.from({ length: foundationCount }, () => []);

let gameState = { drawPile, wastePile, cols, foundations, moves: 0 };
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
    console.log(`Step ${step}: MOVE MADE. Cards left in draw/waste: ${gameState.drawPile.length}/${gameState.wastePile.length}.`);
  } else {
    const deckSize = gameState.drawPile.length + gameState.wastePile.length;
    if (cardsDrawnSinceLastMove > deckSize + 1 && deckSize > 0) {
      console.log(`Step ${step}: STOPPED. Deck cycled with no moves. Deck Size = ${deckSize}, Cards Drawn = ${cardsDrawnSinceLastMove}`);
      break;
    }

    cardsDrawnSinceLastMove++;
    if (gameState.drawPile.length > 0) {
      const newDraw = [...gameState.drawPile];
      const card = newDraw.shift();
      gameState = { ...gameState, drawPile: newDraw, wastePile: [...gameState.wastePile, card], moves: gameState.moves + 1 };
    } else if (gameState.wastePile.length > 0) {
      gameState = { ...gameState, drawPile: [...gameState.wastePile].reverse(), wastePile: [], moves: gameState.moves + 1 };
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
    console.log(` Col ${i}: ${col.map(c => (c.isRevealed?'[U]':'[D]') + (c.kind === 1 ? 'BASE ' + c.category.id : 'MATH ' + c.category.id)).join(', ')}`);
  });
  console.log("Waste:", gameState.wastePile.map(c => c.kind === 1 ? 'BASE ' + c.category.id : 'MATH ' + c.category.id).join(', '));
  console.log("Foundations:");
  gameState.foundations.forEach((f, i) => {
    console.log(` Found ${i}: ${f.map(c => c.kind === 1 ? 'BASE ' + c.category.id : 'MATH ' + c.category.id).join(', ')}`);
  });
}
