import { computeDropState } from './gameLogic';
import type { GameState } from './gameLogic';

interface ScoredMove {
  score: number;
  newState: GameState;
}

export function getBestAutoMove(prevState: GameState, gameRule: string): GameState | null {
  const scoredMoves: ScoredMove[] = [];

  // 1. Gather all valid sources
  const sources: { type: 'waste' | 'col', index?: number, startIndex: number }[] = [];
  
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

  // 2. Evaluate all possible moves and assign scores
  for (const src of sources) {
    // Try dropping on foundations
    for (let i = 0; i < prevState.foundations.length; i++) {
      const result = computeDropState(prevState, src, 'foundation', i, gameRule);
      if (result) {
        scoredMoves.push({ score: 500, newState: result });
      }
    }

    // Try dropping on cols
    for (let i = 0; i < prevState.cols.length; i++) {
      if (src.type === 'col' && src.index === i) continue;
      // Prevent pointless move of a stack to an empty col if it's already the bottom-most card
      if (src.type === 'col' && src.startIndex === 0 && prevState.cols[i].length === 0) continue;
      
      const result = computeDropState(prevState, src, 'col', i, gameRule);
      if (result) {
        let score = 0;
        
        const prevTotal = prevState.cols.reduce((sum, c) => sum + c.length, 0);
        const newTotal = result.cols.reduce((sum, c) => sum + c.length, 0);
        const isAbsorbing = newTotal < prevTotal;

        if (isAbsorbing) {
          score += 500; // Absorbing Math into Base is a top priority
        }

        if (src.type === 'col') {
          const sourceCol = prevState.cols[src.index!];
          const revealsHidden = src.startIndex > 0 && !sourceCol[src.startIndex - 1].isRevealed;
          const emptiesColumn = src.startIndex === 0;

          if (revealsHidden) score += 300;
          if (emptiesColumn) score += 200;

          // Block pointless stack splitting to avoid infinite loops
          if (!isAbsorbing && !revealsHidden && !emptiesColumn) continue;

          // Block moving a stack to an empty column just for fun (must reveal a hidden card)
          if (prevState.cols[i].length === 0 && !revealsHidden) continue;

          // Small reward for consolidating
          if (!isAbsorbing && !revealsHidden && emptiesColumn) {
            score += 10;
          }
        } else if (src.type === 'waste') {
          score += 100; // Playing from waste to column is good
        }

        if (score > 0) {
          scoredMoves.push({ score, newState: result });
        }
      }
    }
  }

  // 3. Return the highest scoring move
  if (scoredMoves.length === 0) return null;

  scoredMoves.sort((a, b) => b.score - a.score);
  return scoredMoves[0].newState;
}
