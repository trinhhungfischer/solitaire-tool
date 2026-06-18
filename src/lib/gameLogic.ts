import type { CardData } from '../components/CardBuilder';

export interface PlayableCard extends CardData {
  absorbedCount?: number;
  isRevealed?: boolean;
  id?: string;
}

export interface GameState {
  drawPile: PlayableCard[];
  wastePile: PlayableCard[];
  cols: PlayableCard[][];
  foundations: PlayableCard[][];
  moves: number;
  lastAction?: string;
}

export function computeDropState(prevState: GameState, source: any, destType: 'col' | 'foundation', destIndex: number, gameRule: string): GameState | null {
  if (source.type === destType && source.index === destIndex) return null; // Dropped on itself
  
  const newState = { 
    ...prevState, 
    cols: prevState.cols.map(c => [...c]), 
    wastePile: [...prevState.wastePile], 
    foundations: prevState.foundations.map(f => [...f]),
    moves: prevState.moves + 1
  };
  
  let sourceArray: PlayableCard[];
  if (source.type === 'col') sourceArray = newState.cols[source.index];
  else if (source.type === 'waste') sourceArray = newState.wastePile;
  else if (source.type === 'foundation') sourceArray = newState.foundations[source.index];
  else return null;

  if (sourceArray.length === 0 || source.startIndex === undefined || source.startIndex >= sourceArray.length) return null;
  
  const cardsToMove = sourceArray.slice(source.startIndex);
  const bottomCardToMove = cardsToMove[0];

  let destArray: PlayableCard[];
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
            if (newDestCard.absorbedCount >= newDestCard.category.elementCount) destArray.pop();
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
        if (newBaseCard.absorbedCount < newBaseCard.category.elementCount) {
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
    
    const cardName = bottomCardToMove.wordText || bottomCardToMove.wordImageKey || 'Card';
    const sourceName = source.type === 'col' ? `Cột ${source.index + 1}` : source.type === 'waste' ? 'Nọc bài' : `Foundation ${source.index + 1}`;
    const destName = destType === 'col' ? `Cột ${destIndex + 1}` : `Slot ${destIndex + 1}`;
    
    newState.lastAction = `Di chuyển [${cardName}] từ ${sourceName} sang ${destName}`;
    
    // Check if it's an absorption
    if (bottomCardToMove.kind === 1 && gameRule === 'new' && destType === 'col') {
      newState.lastAction = `Dùng [${cardName}] nuốt bài ở ${destName}`;
    } else if (bottomCardToMove.kind === 0 && destArray.length > 0 && destArray[destArray.length - 1].kind === 1 && gameRule !== 'new') {
      newState.lastAction = `Đưa [${cardName}] cho Base Card nuốt`;
    }
    
    return newState;
  }
  return null;
}
