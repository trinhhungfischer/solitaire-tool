import { computeDropState } from './gameLogic';
import type { GameState } from './gameLogic';

interface ScoredMove {
  score: number;
  newState: GameState;
}

function evaluateMoves(prevState: GameState, gameRule: string, depth: number, maxDepth: number): ScoredMove[] {
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
            if (c.kind !== 0 || c.category.id != card.category.id || !c.isRevealed) {
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

  // 2. Evaluate all possible moves
  for (const src of sources) {
    // Try dropping on foundations
    for (let i = 0; i < prevState.foundations.length; i++) {
      const result = computeDropState(prevState, src, 'foundation', i, gameRule);
      if (result) {
        let immediateScore = 500;
        let totalScore = immediateScore;

        // Calculate lookahead
        if (depth < maxDepth) {
           const nextMoves = evaluateMoves(result, gameRule, depth + 1, maxDepth);
           if (nextMoves.length > 0) {
              totalScore += nextMoves[0].score * 0.9; // 10% discount factor for future moves
           }
        }

        scoredMoves.push({ score: totalScore, newState: result });
      }
    }

    // Try dropping on cols
    for (let i = 0; i < prevState.cols.length; i++) {
      if (src.type === 'col' && src.index === i) continue;
      // Prevent pointless move of a stack to an empty col if it's already the bottom-most card
      if (src.type === 'col' && src.startIndex === 0 && prevState.cols[i].length === 0) continue;
      
      const result = computeDropState(prevState, src, 'col', i, gameRule);
      if (result) {
        let immediateScore = 0;
        
        const prevTotal = prevState.cols.reduce((sum, c) => sum + c.length, 0);
        const newTotal = result.cols.reduce((sum, c) => sum + c.length, 0);
        const isAbsorbing = newTotal < prevTotal;

        if (isAbsorbing) {
          immediateScore += 500;
        }

        if (src.type === 'col') {
          const sourceCol = prevState.cols[src.index!];
          const revealsHidden = src.startIndex > 0 && !sourceCol[src.startIndex - 1].isRevealed;
          const emptiesColumn = src.startIndex === 0;

          if (revealsHidden) {
            // Prefer revealing columns that have MORE hidden cards underneath
            const hiddenCount = src.startIndex;
            immediateScore += 300 + (hiddenCount * 10);
          }
          if (emptiesColumn) immediateScore += 200;

          // Block pointless stack splitting to avoid infinite loops
          if (!isAbsorbing && !revealsHidden && !emptiesColumn) continue;

          // Block moving a stack to an empty column just for fun (must reveal a hidden card)
          if (prevState.cols[i].length === 0 && !revealsHidden) continue;

          // Small reward for consolidating
          if (!isAbsorbing && !revealsHidden && emptiesColumn) {
            immediateScore += 10;
          }
        } else if (src.type === 'waste') {
          immediateScore += 50; // Waste moves have lower immediate priority unless they lead to a combo
        }

        if (immediateScore > 0) {
           let totalScore = immediateScore;

           // Lookahead
           if (depth < maxDepth) {
              const nextMoves = evaluateMoves(result, gameRule, depth + 1, maxDepth);
              if (nextMoves.length > 0) {
                 totalScore += nextMoves[0].score * 0.9;
              }
           }

           scoredMoves.push({ score: totalScore, newState: result });
        }
      }
    }
  }

  scoredMoves.sort((a, b) => b.score - a.score);
  return scoredMoves;
}

export function getBestAutoMove(prevState: GameState, gameRule: string): GameState | null {
  // Use a Lookahead depth of 2 (current move + 2 future moves)
  // This allows the bot to see combos that are up to 3 steps long!
  const bestMoves = evaluateMoves(prevState, gameRule, 0, 2);
  
  if (bestMoves.length === 0) return null;
  return bestMoves[0].newState;
}
