import { computeDropState } from './gameLogic';
import type { GameState } from './gameLogic';

function hashState(state: GameState): string {
  const getCardId = (c: any) => `${c.category.id}_${c.kind}_${c.wordText || c.wordImageKey || ''}`;
  const hashCols = state.cols.map(col => col.map(c => `${getCardId(c)}${c.isRevealed ? 'U' : 'D'}`).join(',')).join('|');
  const hashWaste = state.wastePile.map(c => getCardId(c)).join(',');
  const hashDraw = state.drawPile.map(c => getCardId(c)).join(',');
  const hashFounds = state.foundations.map(f => f.length).join(',');
  return `${hashCols}|${hashWaste}|${hashDraw}|${hashFounds}`;
}

export function solveGame(initialState: GameState, gameRule: string, maxIterations = 50000): GameState[] | null {
  const visited = new Set<string>();
  
  // DFS queue (stack)
  // Each item is { state, path }
  const stack: { state: GameState, path: GameState[] }[] = [{ state: initialState, path: [] }];
  
  let iterations = 0;
  
  let bestPath: GameState[] = [];
  let minCardsLeft = 999;

  while (stack.length > 0) {
    if (iterations++ > maxIterations) {
      console.warn('Max iterations reached');
      return bestPath.length > 0 ? bestPath.slice(1) : null;
    }

    const { state, path } = stack.pop()!;
    
    // Check if won
    const cardsLeft = state.cols.reduce((sum, c) => sum + c.length, 0) + state.drawPile.length + state.wastePile.length;
    if (cardsLeft === 0) {
      return [...path, state].slice(1);
    }

    if (cardsLeft < minCardsLeft) {
      minCardsLeft = cardsLeft;
      bestPath = [...path, state];
    }

    const hash = hashState(state);
    if (visited.has(hash)) continue;
    visited.add(hash);

    // Generate all valid moves from this state
    const nextStates: GameState[] = [];
    
    // 1. Gather sources
    const sources: { type: 'waste' | 'col', index?: number, startIndex: number }[] = [];
    if (state.wastePile.length > 0) {
      sources.push({ type: 'waste', startIndex: state.wastePile.length - 1 });
    }
    state.cols.forEach((col, i) => {
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
        if (isValidStack) sources.push({ type: 'col', index: i, startIndex: j });
      }
    });

    // 2. Try all moves
    for (const src of sources) {
      for (let i = 0; i < state.foundations.length; i++) {
        const result = computeDropState(state, src, 'foundation', i, gameRule);
        if (result) nextStates.push(result);
      }
      for (let i = 0; i < state.cols.length; i++) {
        if (src.type === 'col' && src.index === i) continue;
        if (src.type === 'col' && src.startIndex === 0 && state.cols[i].length === 0) continue; // prevent cycle
        const result = computeDropState(state, src, 'col', i, gameRule);
        if (result) {
          // Additional anti-cycle logic
          if (src.type === 'col') {
            const isAbsorbing = result.cols.reduce((sum, c) => sum + c.length, 0) < state.cols.reduce((sum, c) => sum + c.length, 0);
            const sourceCol = state.cols[src.index!];
            const revealsHidden = src.startIndex > 0 && !sourceCol[src.startIndex - 1].isRevealed;
            const emptiesColumn = src.startIndex === 0;
            
            // Block pointless stack splitting to avoid infinite loops
            if (!isAbsorbing && !revealsHidden && !emptiesColumn) continue;
            // Block moving a stack to an empty column just for fun (must reveal a hidden card)
            if (state.cols[i].length === 0 && !revealsHidden) continue;
          }
          nextStates.push(result);
        }
      }
    }

    // 3. Try drawing card
    if (state.drawPile.length > 0) {
      const newDraw = [...state.drawPile];
      const card = newDraw.shift()!;
      nextStates.push({ ...state, drawPile: newDraw, wastePile: [...state.wastePile, card], moves: state.moves + 1 });
    } else if (state.wastePile.length > 0) {
      // Recycle waste
      nextStates.push({ ...state, drawPile: [...state.wastePile], wastePile: [], moves: state.moves + 1, lastAction: 'Chuyển Waste về Stock' });
    }

    // Heuristic Sorting
    const scoredStates = nextStates.map(ns => {
      let score = 0;
      const prevTotal = state.cols.reduce((sum, c) => sum + c.length, 0);
      const newTotal = ns.cols.reduce((sum, c) => sum + c.length, 0);
      if (newTotal < prevTotal) score += 500; 
      
      const prevRevealed = state.cols.reduce((sum, c) => sum + c.filter(card => card.isRevealed).length, 0);
      const newRevealed = ns.cols.reduce((sum, c) => sum + c.filter(card => card.isRevealed).length, 0);
      if (newRevealed > prevRevealed) score += 300; 
      
      if (ns.wastePile.length < state.wastePile.length && ns.drawPile.length === state.drawPile.length) score += 100;

      return { state: ns, score };
    });

    scoredStates.sort((a, b) => a.score - b.score);

    for (const ss of scoredStates) {
      stack.push({ state: ss.state, path: [...path, state] });
    }
  }

  return bestPath.length > 0 ? bestPath.slice(1) : null;
}
