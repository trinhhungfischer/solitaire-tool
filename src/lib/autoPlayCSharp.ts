import { computeDropState } from './gameLogic';
import type { GameState } from './gameLogic';

export function getCSharpAutoMove(prevState: GameState, gameRule: string): GameState | null {
  // 1. Gather all clickable cards (top of waste and top of each tableau column)
  const sources: { type: 'waste' | 'col', index?: number, startIndex: number, cards: any[] }[] = [];
  
  if (prevState.wastePile.length > 0) {
    sources.push({ 
      type: 'waste', 
      startIndex: prevState.wastePile.length - 1,
      cards: [prevState.wastePile[prevState.wastePile.length - 1]]
    });
  }

  prevState.cols.forEach((col, i) => {
    if (col.length > 0) {
      // Find the root of the draggable stack
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
          sources.push({ type: 'col', index: i, startIndex: j, cards: col.slice(j) });
        }
      }
    }
  });

  // Priority 1: Category card to empty Foundation slot
  for (const src of sources) {
    const topCard = src.cards[0];
    if (topCard.kind === 1) {
      for (let i = 0; i < prevState.foundations.length; i++) {
        if (prevState.foundations[i].length === 0) {
          const result = computeDropState(prevState, src, 'foundation', i, gameRule);
          if (result) return result;
        }
      }
    }
  }

  // Priority 2: Math card to matched Category Foundation
  for (const src of sources) {
    const topCard = src.cards[0];
    if (topCard.kind === 0 && src.cards.length === 1) {
      for (let i = 0; i < prevState.foundations.length; i++) {
        if (prevState.foundations[i].length > 0) {
          const result = computeDropState(prevState, src, 'foundation', i, gameRule);
          if (result) return result;
        }
      }
    }
  }

  // Priority 2.5: Tableau to Tableau to Absorb (Combine Base and Math)
  for (const src of sources) {
    if (src.type === 'col') {
      for (let i = 0; i < prevState.cols.length; i++) {
        if (i === src.index) continue;
        const result = computeDropState(prevState, src, 'col', i, gameRule);
        if (result) {
          // Check if it's an absorb move
          const prevTotal = prevState.cols.reduce((sum, c) => sum + c.length, 0);
          const newTotal = result.cols.reduce((sum, c) => sum + c.length, 0);
          if (newTotal < prevTotal) {
            return result;
          }
        }
      }
    }
  }

  // Priority 3: Tableau stack to Tableau (to reveal a hidden card)
  for (const src of sources) {
    if (src.type === 'col') {
      const sourceCol = prevState.cols[src.index!];
      const revealsHidden = src.startIndex > 0 && !sourceCol[src.startIndex - 1].isRevealed;
      
      if (revealsHidden) {
        for (let i = 0; i < prevState.cols.length; i++) {
          if (i === src.index) continue;
          const result = computeDropState(prevState, src, 'col', i, gameRule);
          if (result) return result;
        }
      }
    }
  }

  // Priority 4: Waste to Tableau (any valid move)
  const wasteSrc = sources.find(s => s.type === 'waste');
  if (wasteSrc) {
    for (let i = 0; i < prevState.cols.length; i++) {
      const result = computeDropState(prevState, wasteSrc, 'col', i, gameRule);
      if (result) return result;
    }
  }

  // Priority 5: Tableau to empty column (if it helps sort cards)
  for (const src of sources) {
    if (src.type === 'col') {
      const sourceCol = prevState.cols[src.index!];
      const emptiesColumn = src.startIndex === 0;
      
      if (emptiesColumn) {
        // Don't move an already perfectly sorted column to an empty column
        if (sourceCol.length > src.cards.length) {
          for (let i = 0; i < prevState.cols.length; i++) {
            if (i === src.index) continue;
            // Only try if target column is empty
            if (prevState.cols[i].length === 0) {
               const result = computeDropState(prevState, src, 'col', i, gameRule);
               if (result) return result;
            }
          }
        }
      }
    }
  }

  return null;
}
