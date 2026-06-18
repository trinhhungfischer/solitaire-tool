import { useState, useMemo, useEffect } from 'react';
import type { CardData } from './CardBuilder';
import { RefreshCw, Image as ImageIcon, Eye, EyeOff, Undo2 } from 'lucide-react';

interface BoardPreviewProps {
  foundationCount: number;
  columnCards: number[];
  data: CardData[];
  shuffleSeed?: number;
  maxMoves?: number;
  isAutoPlaying?: boolean;
  onStopAutoPlay?: () => void;
  gameRule?: 'classic' | 'new';
}

// Simple seeded random number generator
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

import { computeDropState } from '../lib/gameLogic';
import type { PlayableCard, GameState } from '../lib/gameLogic';
import { getBestAutoMove } from '../lib/autoPlay';

export default function BoardPreview({ foundationCount, columnCards, data, shuffleSeed, maxMoves, isAutoPlaying, onStopAutoPlay, gameRule = 'new' }: BoardPreviewProps) {
  const [internalSeed, setInternalSeed] = useState<number | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [showHiddenCards, setShowHiddenCards] = useState<boolean>(false);
  const [cardsDrawnSinceLastMove, setCardsDrawnSinceLastMove] = useState<number>(0);

  // When props.shuffleSeed changes, reset internalSeed so we use the prop
  useEffect(() => {
    setInternalSeed(null);
  }, [shuffleSeed]);

  const activeSeed = internalSeed !== null ? internalSeed : (shuffleSeed || 12345);

  const shuffledData = useMemo(() => {
    // Convert to PlayableCard and init absorbedCount to 0 for Base cards
    const arr: PlayableCard[] = data.map(c => ({
      ...c,
      absorbedCount: c.kind === 1 ? 0 : undefined
    }));
    const rng = lcg(activeSeed);
    
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [data, activeSeed]);

  useEffect(() => {
    if (!isAutoPlaying || !gameState) return;
    
    const interval = setInterval(() => {
      const bestMove = getBestAutoMove(gameState, gameRule);
      if (bestMove) {
        setHistory(h => [...h, gameState]);
        setCardsDrawnSinceLastMove(0);
        setGameState(bestMove);
        return;
      }

      if (gameState.drawPile.length > 0 || gameState.wastePile.length > 0) {
        const deckSize = gameState.drawPile.length + gameState.wastePile.length;
        if (cardsDrawnSinceLastMove > deckSize + 1 && deckSize > 0) {
          if (onStopAutoPlay) onStopAutoPlay();
          return;
        }
        
        setHistory(h => [...h, gameState]);
        setCardsDrawnSinceLastMove(c => c + 1);
        
        if (gameState.drawPile.length > 0) {
          const newDraw = [...gameState.drawPile];
          const card = newDraw.shift()!;
          setGameState({ ...gameState, drawPile: newDraw, wastePile: [...gameState.wastePile, card], moves: gameState.moves + 1 });
        } else {
          setGameState({ ...gameState, drawPile: [...gameState.wastePile].reverse(), wastePile: [], moves: gameState.moves + 1 });
        }
        return;
      }

      // No moves and empty deck
      if (onStopAutoPlay) {
        onStopAutoPlay();
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isAutoPlaying, gameState, cardsDrawnSinceLastMove, onStopAutoPlay]);

  useEffect(() => {
    const cols: PlayableCard[][] = [];
    let cardIndex = 0;
    
    for (const count of columnCards) {
      const col = [];
      for (let i = 0; i < count; i++) {
        if (cardIndex < shuffledData.length) {
          col.push({
            ...shuffledData[cardIndex],
            isRevealed: i === count - 1 // Only the last card is revealed initially
          });
          cardIndex++;
        }
      }
      cols.push(col);
    }
    
    // Draw pile and waste pile cards are effectively revealed when drawn
    const drawPile = shuffledData.slice(cardIndex).map(c => ({ ...c, isRevealed: true }));
    const wastePile: PlayableCard[] = [];
    const foundations: PlayableCard[][] = Array.from({ length: foundationCount }, () => []);

    setGameState({ drawPile, wastePile, cols, foundations, moves: 0 });
    setHistory([]);
  }, [shuffledData, columnCards, foundationCount]);

  const handleReshuffle = () => {
    setInternalSeed(Math.floor(Math.random() * 1000000));
  };

  const handleDrawClick = () => {
    setGameState(prev => {
      if (!prev) return prev;
      setHistory(h => [...h, prev]);
      
      if (prev.drawPile.length > 0) {
        const newDraw = [...prev.drawPile];
        const card = newDraw.shift()!;
        return { ...prev, drawPile: newDraw, wastePile: [...prev.wastePile, card], moves: prev.moves + 1 };
      } else {
        if (prev.wastePile.length === 0) {
          setHistory(h => h.slice(0, -1)); // Revert history push if nothing happened
          return prev;
        }
        return { ...prev, drawPile: [...prev.wastePile].reverse(), wastePile: [], moves: prev.moves + 1 };
      }
    });
  };

  const handleDragStart = (e: React.DragEvent, source: any) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(source));
    e.dataTransfer.effectAllowed = 'move';
  };

  const executeDrop = (destType: 'col' | 'foundation', destIndex: number, sourceStr: string) => {
    try {
      const source = JSON.parse(sourceStr);
      setGameState(prev => {
        if (!prev) return prev;
        const newState = computeDropState(prev, source, destType, destIndex, gameRule);
        if (newState) {
          setHistory(h => [...h, prev]);
          return newState;
        }
        return prev;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDropOnCol = (e: React.DragEvent, destColIndex: number) => {
    e.preventDefault();
    const sourceStr = e.dataTransfer.getData('text/plain');
    if (sourceStr) executeDrop('col', destColIndex, sourceStr);
  };

  const handleDropOnFoundation = (e: React.DragEvent, destFoundIndex: number) => {
    e.preventDefault();
    const sourceStr = e.dataTransfer.getData('text/plain');
    if (sourceStr) executeDrop('foundation', destFoundIndex, sourceStr);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prevState = history[history.length - 1];
    setGameState(prevState);
    setHistory(h => h.slice(0, -1));
  };

  if (!gameState) return null;

  const renderCard = (card: PlayableCard, isCovered: boolean = false, stackDirection: 'vertical' | 'horizontal' | 'none' = 'none') => {
    
    // Helper to render the math formula
    const renderFormula = (sizeClass: string) => {
      if (card.wordVisualType === 1) {
        return (
          <div className={`flex flex-row items-center justify-center gap-1 text-slate-600 ${sizeClass}`}>
            <ImageIcon className="w-[1em] h-[1em] flex-shrink-0" />
            <span className="font-medium truncate px-1 leading-none">
              {card.wordImageKey || 'img'}
            </span>
          </div>
        );
      }
      return (
        <span className={`font-bold text-slate-800 leading-tight block truncate ${sizeClass}`}>
          {card.wordText || '?'}
        </span>
      );
    };

    return (
      <div className="w-full h-full flex flex-col pointer-events-none relative px-1.5 py-1">
        {/* Top Header Row */}
        <div className="flex justify-between items-start w-full">
          <div className="flex items-center gap-1">
            <div className="text-[9px] font-bold text-slate-400">
              {card.kind === 1 ? 'BASE' : 'MATH'}
            </div>
            {/* If COVERED and VERTICAL, show formula or base text here next to MATH */}
            {isCovered && stackDirection === 'vertical' && (
              <div className="ml-1 opacity-80">
                {card.kind === 1 ? (
                  <span className="font-bold text-[11px] text-amber-700 leading-none block truncate max-w-[40px]">
                    {card.category.displayName}
                  </span>
                ) : (
                  renderFormula('text-[10px]')
                )}
              </div>
            )}
          </div>
          
          {/* Render Tracker for Base Cards */}
          {card.kind === 1 && (
            <div className="bg-amber-200 text-amber-900 text-[9px] font-bold px-1 rounded-sm shadow-sm border border-amber-300">
              {card.absorbedCount || 0}/{card.category.elementCount}
            </div>
          )}
        </div>

        {/* If COVERED and HORIZONTAL, show formula on the left edge (rotated) */}
        {isCovered && stackDirection === 'horizontal' && (
          <div className="absolute left-1 top-6 bottom-4 w-4 flex flex-col justify-center items-center overflow-hidden">
             <div className="origin-center -rotate-90 whitespace-nowrap opacity-80">
               {card.kind === 1 ? (
                 <span className="font-bold text-[11px] text-amber-700">{card.category.displayName}</span>
               ) : (
                 renderFormula('text-[10px]')
               )}
             </div>
          </div>
        )}

        {/* Center Content */}
        {!isCovered && (
          <div className="w-full text-center flex-1 flex items-center justify-center pb-2">
            {card.kind === 1 ? (
              <span className="text-xl font-black text-amber-700 leading-none">
                {card.category.displayName}
              </span>
            ) : (
              renderFormula('text-2xl')
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full bg-[#1A4E2B] overflow-hidden flex flex-col p-6 font-sans">
      
      {/* Left Sidebar Actions (Eye & Undo & Reshuffle) */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
        <div className="bg-[#143d22]/80 backdrop-blur-sm p-1.5 rounded-xl border border-white/10 flex flex-col gap-1 shadow-lg">
          <button 
            onClick={() => setShowHiddenCards(!showHiddenCards)}
            className={`p-2.5 rounded-lg transition-colors flex items-center justify-center tooltip-trigger ${showHiddenCards ? 'bg-solitaire-green text-white' : 'hover:bg-white/10 text-white/70 hover:text-white'}`}
            title="Toggle hidden cards visibility"
          >
            {showHiddenCards ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={handleUndo}
            disabled={history.length === 0}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title="Undo last move"
          >
            <Undo2 className="w-5 h-5" />
          </button>

          <div className="w-8 h-px bg-white/10 mx-auto my-1"></div>

          <button 
            onClick={handleReshuffle}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"
            title="Reshuffle Preview"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Top Center: Moves Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-black/20 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 text-white shadow-lg text-sm tracking-wide">
          {maxMoves && maxMoves > 0 ? (
            <span className={gameState.moves > maxMoves ? 'text-red-400 font-bold' : 'font-medium'}>
              Moves Left: <span className="font-bold text-lg ml-1">{maxMoves - gameState.moves}</span>
            </span>
          ) : (
            <span className="text-white/80 font-medium">Moves: <span className="text-white font-bold text-lg ml-1">{gameState.moves}</span></span>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto flex flex-col gap-8">
        
        {/* Top Area: Draw Pile & Foundations */}
        <div className="flex justify-between items-start mt-8 pl-16">
          
          {/* Draw Pile Area */}
          <div className="flex gap-4">
            {/* Deck */}
            <div className="relative">
              <div className="absolute -top-7 left-0 right-0 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase">Stock</div>
              <div 
                className="w-24 h-36 rounded-lg border-2 border-white/20 bg-[#143d22] flex items-center justify-center relative shadow-inner cursor-pointer hover:bg-[#1a4a2a] transition-colors select-none"
                onClick={handleDrawClick}
              >
              {gameState.drawPile.length > 0 ? (
                <div className="absolute inset-0 bg-blue-800 rounded-md border-2 border-white/80 shadow-lg flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-700 to-blue-900">
                  <div className="text-white/50 font-bold text-xl">{gameState.drawPile.length}</div>
                </div>
              ) : (
                <div className="w-full h-full rounded-md flex items-center justify-center text-white/20 text-3xl font-bold">
                  ↺
                </div>
              )}
              </div>
            </div>

            {/* Waste Pile (Stacked) */}
            <div className="relative">
              <div className="absolute -top-7 left-0 w-24 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase">Waste</div>
              <div className="w-32 h-36 relative border-2 border-transparent">
              {gameState.wastePile.length === 0 && (
                <div className="w-24 h-36 rounded-lg border-2 border-white/10 bg-[#143d22]/50 absolute top-0 left-0" />
              )}
              {gameState.wastePile.slice(-3).map((card, idx, arr) => {
                const isTop = idx === arr.length - 1;
                return (
                  <div 
                    key={idx}
                    className={`w-24 h-36 rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] absolute top-0 
                      ${isTop ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1 transition-transform' : ''}
                      ${card.kind === 1 ? 'bg-amber-50 border-amber-300 border-2' : 'bg-white border-slate-200 border'}
                    `}
                    style={{ left: `${idx * 20}px`, zIndex: idx }}
                    draggable={isTop}
                    onDragStart={isTop ? (e) => handleDragStart(e, { type: 'waste', startIndex: gameState.wastePile.length - 1 }) : undefined}
                  >
                    {renderCard(card, !isTop, 'horizontal')}
                  </div>
                );
              })}
            </div>
            </div>
          </div>

          {/* Foundations */}
          <div className="relative">
            <div className="absolute -top-7 left-0 right-0 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase">Foundation</div>
            <div className="flex gap-4">
              {gameState.foundations.map((foundCards, i) => (
                <div 
                  key={i} 
                  className="w-24 h-36 rounded-lg border-2 border-white/20 bg-[#143d22]/50 flex items-center justify-center relative"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnFoundation(e, i)}
                >
                  {foundCards.length === 0 ? (
                    <span className="text-white/20 text-3xl font-black">A</span>
                  ) : (
                    <div 
                      className={`w-24 h-36 rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] absolute top-0 left-0 cursor-grab active:cursor-grabbing hover:-translate-y-1 transition-transform
                        ${foundCards[foundCards.length - 1].kind === 1 ? 'bg-amber-50 border-amber-300 border-2' : 'bg-white border-slate-200 border'}
                      `}
                      draggable
                      onDragStart={(e) => handleDragStart(e, { type: 'foundation', index: i, startIndex: foundCards.length - 1 })}
                    >
                      {renderCard(foundCards[foundCards.length - 1], false, 'none')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Bottom Area: Tableau (Columns) */}
        <div className="relative flex-1 flex flex-col pt-8 mt-4">
          <div className="absolute top-0 left-0 right-0 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase">Tableau</div>
          <div className="flex-1 flex justify-center gap-4 px-4 overflow-x-auto pb-8">
          {gameState.cols.map((colCards, colIndex) => (
            <div 
              key={colIndex} 
              className="w-24 relative min-h-[400px]"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnCol(e, colIndex)}
            >
              {/* Column Drop Zone (Empty slot) */}
              <div className="w-24 h-36 rounded-lg border-2 border-white/10 bg-[#143d22]/30 absolute top-0 left-0" />
              
              {/* Cards in Column */}
              {colCards.map((card, cardIndex) => {
                const isTopCard = cardIndex === colCards.length - 1;
                // isRevealed tells us if it's face up permanently. showHiddenCards forces it.
                const isFaceUp = card.isRevealed || showHiddenCards;

                // Check if this card and all cards below it form a valid stack
                // A valid stack must be all face up, all Kind 0 (Math), and same category ID
                let isDraggable = isTopCard;
                if (!isTopCard && isFaceUp && card.kind === 0) {
                  let isValidStack = true;
                  for (let k = cardIndex; k < colCards.length; k++) {
                    const c = colCards[k];
                    if (c.kind !== 0 || c.category.id !== card.category.id || !(c.isRevealed || showHiddenCards)) {
                      isValidStack = false;
                      break;
                    }
                  }
                  isDraggable = isValidStack;
                }

                return (
                  <div 
                    key={cardIndex}
                    className={`w-24 h-36 rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] absolute top-0 left-0 flex flex-col 
                      ${isDraggable ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1 transition-transform' : ''}
                      ${isFaceUp ? (card.kind === 1 ? 'bg-amber-50 border-amber-300 border-2' : 'bg-white border-slate-200 border') : 'bg-blue-800 border-2 border-white/20'}
                    `}
                    style={{ top: `${cardIndex * 32}px`, zIndex: cardIndex }}
                    draggable={isDraggable}
                    onDragStart={(e) => {
                      if (isDraggable) {
                        handleDragStart(e, { type: 'col', index: colIndex, startIndex: cardIndex });
                      } else {
                        e.preventDefault();
                      }
                    }}
                  >
                    {isFaceUp ? renderCard(card, !isTopCard, 'vertical') : (
                      // Face down card back
                      <div className="w-full h-full rounded-md flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-700 to-blue-900">
                        <div className="w-12 h-12 rounded-full border-4 border-white/10 opacity-30"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
