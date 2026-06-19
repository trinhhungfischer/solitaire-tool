import { useState, useMemo, useEffect, useRef } from 'react';
import type { CardData } from './CardBuilder';
import { RefreshCw, Image as ImageIcon, Eye, EyeOff, Undo2, Shuffle, Zap, ClipboardList, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { computeDropState, checkHasAvailableMoves } from '../lib/gameLogic';
import type { PlayableCard, GameState } from '../lib/gameLogic';
import { getBestAutoMove } from '../lib/autoPlay';
import { solveGame } from '../lib/solver';

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

export default function BoardPreview({ foundationCount, columnCards, data, maxMoves, isAutoPlaying, onStopAutoPlay, gameRule = 'new' }: BoardPreviewProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [futureHistory, setFutureHistory] = useState<GameState[]>([]);
  const [showHiddenCards, setShowHiddenCards] = useState<boolean>(false);
  const [resetCount, setResetCount] = useState<number>(0);
  const [cardsDrawnSinceLastMove, setCardsDrawnSinceLastMove] = useState(0);
  const [autoReshuffleCount, setAutoReshuffleCount] = useState(0);
  const [isAutoRetryingQuickSolve, setIsAutoRetryingQuickSolve] = useState(false);
  const [isQuickSolving, setIsQuickSolving] = useState(false);
  const [quickSolvePath, setQuickSolvePath] = useState<GameState[] | null>(null);
  const [showLog, setShowLog] = useState(false);
  const activeLogRef = useRef<HTMLDivElement>(null);
  const isTimeTravelingRef = useRef(false);

  const shuffledData = useMemo(() => {
    const arr: PlayableCard[] = data.map(c => ({
      ...c,
      absorbedCount: c.kind === 1 ? 0 : undefined
    }));
    return arr;
  }, [data]);

  useEffect(() => {
    if (isTimeTravelingRef.current) {
      isTimeTravelingRef.current = false;
      return;
    }
    if (showLog && activeLogRef.current) {
      activeLogRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [gameState?.lastAction, showLog, history.length]);

  useEffect(() => {
    if (!isAutoPlaying) {
      setAutoReshuffleCount(0);
    }
  }, [isAutoPlaying]);

  useEffect(() => {
    if (!isQuickSolving || !quickSolvePath || quickSolvePath.length === 0) return;
    
    const interval = setInterval(() => {
      const nextState = quickSolvePath[0];
      setHistory(h => [...h, gameState!]);
      setFutureHistory([]);
      setGameState(nextState);
      
      const newPath = quickSolvePath.slice(1);
      setQuickSolvePath(newPath);
      
      if (newPath.length === 0) {
        setIsQuickSolving(false);
      }
    }, 50); // Super fast 50ms interval for Quick Solve
    
    return () => clearInterval(interval);
  }, [isQuickSolving, quickSolvePath, gameState]);

  useEffect(() => {
    if (!isAutoPlaying || !gameState || isQuickSolving) return;
    
    const interval = setInterval(() => {
      const bestMove = getBestAutoMove(gameState, gameRule);
      if (bestMove) {
        setHistory(h => [...h, gameState]);
        setFutureHistory([]);
        setCardsDrawnSinceLastMove(0);
        setAutoReshuffleCount(0); // Reset reshuffles if we made progress
        setGameState(bestMove);
        return;
      }

      if (gameState.drawPile.length > 0 || gameState.wastePile.length > 0) {
        const deckSize = gameState.drawPile.length + gameState.wastePile.length;
        if (cardsDrawnSinceLastMove > deckSize + 1 && deckSize > 0) {
          if (autoReshuffleCount < 5) {
            setHistory(h => [...h, gameState]);
            setFutureHistory([]);
            
            const pool = [...gameState.drawPile, ...gameState.wastePile];
            const newCols = gameState.cols.map(col => {
              const newCol = [];
              for (const card of col) {
                if (!card.isRevealed) pool.push(card);
                else newCol.push(card);
              }
              return newCol;
            });

            for (let i = pool.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [pool[i], pool[j]] = [pool[j], pool[i]];
            }

            const finalCols = gameState.cols.map((oldCol, colIndex) => {
              const newCol = [];
              const faceUpCards = newCols[colIndex];
              const unrevealedCount = oldCol.length - faceUpCards.length;
              for (let i = 0; i < unrevealedCount; i++) {
                newCol.push({ ...pool.pop()!, isRevealed: false });
              }
              newCol.push(...faceUpCards);
              return newCol;
            });

            const newDrawPile = pool.map(c => ({ ...c, isRevealed: true }));

            setGameState({ ...gameState, cols: finalCols, drawPile: newDrawPile, wastePile: [], moves: gameState.moves + 1, lastAction: 'Bot bị kẹt -> 🔀 Tự động Super Reshuffle' });
            setCardsDrawnSinceLastMove(0);
            setAutoReshuffleCount(c => c + 1);
            return;
          }

          if (onStopAutoPlay) onStopAutoPlay();
          return;
        }
        
        setHistory(h => [...h, gameState]);
        setFutureHistory([]);
        setCardsDrawnSinceLastMove(c => c + 1);
        
        if (gameState.drawPile.length > 0) {
          const newDraw = [...gameState.drawPile];
          const card = newDraw.shift();
          if (card) {
            setGameState({ ...gameState, drawPile: newDraw, wastePile: [...gameState.wastePile, card], moves: gameState.moves + 1, lastAction: 'Bot: Rút 1 lá từ Stock' });
          }
        } else {
          setGameState({ ...gameState, drawPile: [...gameState.wastePile], wastePile: [], moves: gameState.moves + 1, lastAction: 'Bot: Chuyển Waste về Stock' });
        }
        return;
      }

      // No moves and empty deck
      if (onStopAutoPlay) {
        onStopAutoPlay();
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isAutoPlaying, gameState, cardsDrawnSinceLastMove, onStopAutoPlay, gameRule]);

  useEffect(() => {
    const cols: PlayableCard[][] = [];
    let cardIndex = 0;
    
    for (const count of columnCards) {
      const col = [];
      for (let i = 0; i < count; i++) {
        if (cardIndex < shuffledData.length) {
          col.push({
            ...shuffledData[cardIndex],
            isRevealed: i === count - 1 
          });
          cardIndex++;
        }
      }
      cols.push(col);
    }
    
    const drawPile = shuffledData.slice(cardIndex).map(c => ({ ...c, isRevealed: true }));
    const foundations: PlayableCard[][] = Array.from({ length: foundationCount }, () => []);

    setGameState({
      drawPile: [...drawPile],
      wastePile: [],
      cols,
      foundations,
      moves: 0,
      lastAction: '🎲 Ván bài mới: Đã trộn và chia bài'
    });
    setHistory([]);
    setFutureHistory([]);
  }, [shuffledData, columnCards, foundationCount, resetCount]);

  const handleRestart = () => {
    setResetCount(prev => prev + 1);
  };

  const handleDrawClick = () => {
    setGameState(prev => {
      if (!prev) return prev;
      setHistory(h => [...h, prev]);
      setFutureHistory([]);
      
      if (prev.drawPile.length > 0) {
        const newDraw = [...prev.drawPile];
        const card = newDraw.shift()!;
        return { ...prev, drawPile: newDraw, wastePile: [...prev.wastePile, card], moves: prev.moves + 1, lastAction: 'Người chơi: Rút 1 lá từ Stock' };
      } else {
        if (prev.wastePile.length === 0) {
          return prev;
        }
        return { ...prev, drawPile: [...prev.wastePile], wastePile: [], moves: prev.moves + 1, lastAction: 'Người chơi: Chuyển Waste về Stock' };
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
          setFutureHistory([]);
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
    if (history.length > 0 && !isAutoPlaying && !isQuickSolving) {
      const prevState = history[history.length - 1];
      setFutureHistory(prev => [gameState!, ...prev]);
      setGameState(prevState);
      setHistory(history.slice(0, -1));
    }
  };

  const handleTimeTravel = (historyIndex: number) => {
    if (isAutoPlaying || isQuickSolving || !gameState) return;
    isTimeTravelingRef.current = true;
    const fullTimeline = [...history, gameState, ...futureHistory];
    const targetState = fullTimeline[historyIndex];
    if (!targetState) return;
    
    setHistory(fullTimeline.slice(0, historyIndex));
    setGameState(targetState);
    setFutureHistory(fullTimeline.slice(historyIndex + 1));
    setCardsDrawnSinceLastMove(0);
  };

  const handleQuickSolve = () => {
    if (!gameState || isAutoPlaying || isQuickSolving) return;
    setIsQuickSolving(true);
    setAutoReshuffleCount(0);
    setTimeout(() => {
      const path = solveGame(gameState, gameRule, 50000);
      if (path && path.length > 0) {
        setQuickSolvePath(path);
        setIsAutoRetryingQuickSolve(false);
      } else {
        setIsQuickSolving(false);
        const hasUnrevealed = gameState.cols.some(c => c.some(card => !card.isRevealed));
        if (gameState.drawPile.length === 0 && gameState.wastePile.length === 0 && !hasUnrevealed) {
          alert("Quick Solve failed: The board is unwinnable from the current state.");
          setIsAutoRetryingQuickSolve(false);
        } else {
          setIsAutoRetryingQuickSolve(true);
          handleReshuffle(true);
        }
      }
    }, 50);
  };

  useEffect(() => {
    if (isAutoRetryingQuickSolve && !isQuickSolving && gameState) {
      const timer = setTimeout(() => {
        handleQuickSolve();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gameState, isAutoRetryingQuickSolve, isQuickSolving]);

  const handleReshuffle = (isAutoTrigger = false) => {
    const hasUnrevealed = gameState?.cols.some(c => c.some(card => !card.isRevealed));
    if (!gameState || isAutoPlaying || isQuickSolving || (gameState.drawPile.length === 0 && gameState.wastePile.length === 0 && !hasUnrevealed)) return;
    
    setHistory(h => [...h, gameState]);
    setFutureHistory([]);
    
    const pool = [...gameState.drawPile, ...gameState.wastePile];
    const newCols = gameState.cols.map(col => {
      const newCol = [];
      for (const card of col) {
        if (!card.isRevealed) pool.push(card);
        else newCol.push(card);
      }
      return newCol;
    });

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const finalCols = gameState.cols.map((oldCol, colIndex) => {
      const newCol = [];
      const faceUpCards = newCols[colIndex];
      const unrevealedCount = oldCol.length - faceUpCards.length;
      for (let i = 0; i < unrevealedCount; i++) {
        newCol.push({ ...pool.pop()!, isRevealed: false });
      }
      newCol.push(...faceUpCards);
      return newCol;
    });

    const newDrawPile = pool.map(c => ({ ...c, isRevealed: true }));

    const actionText = isAutoTrigger ? 'Hệ thống: Hết nước đi -> 🔀 Tự động Super Reshuffle' : 'Người chơi: 🔀 Super Reshuffle';
    setGameState({ ...gameState, cols: finalCols, drawPile: newDrawPile, wastePile: [], moves: gameState.moves + 1, lastAction: actionText });
    setCardsDrawnSinceLastMove(0);
    if (isAutoTrigger) {
      setAutoReshuffleCount(c => c + 1);
    }
  };

  useEffect(() => {
    if (!gameState || isAutoPlaying || isQuickSolving) return;

    const hasUnrevealed = gameState.cols.some(c => c.some(card => !card.isRevealed));
    if (!hasUnrevealed && gameState.drawPile.length === 0 && gameState.wastePile.length === 0) return;

    const hasMoves = checkHasAvailableMoves(gameState, gameRule);
    if (!hasMoves) {
      const timer = setTimeout(() => {
        handleReshuffle(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState, isAutoPlaying, isQuickSolving, gameRule]);

  if (!gameState) return null;

  const cardsLeft = gameState.cols.reduce((sum, c) => sum + c.length, 0) + gameState.drawPile.length + gameState.wastePile.length;

  const renderCard = (card: PlayableCard, isCovered: boolean = false, stackDirection: 'vertical' | 'horizontal' | 'none' = 'none') => {
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
        <div className="flex justify-between items-start w-full">
          <div className="flex items-center gap-1">
            <div className="text-[9px] font-bold text-slate-400">
              {card.kind === 1 ? 'BASE' : 'MATH'}
            </div>
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
          {card.kind === 1 && (
            <div className="bg-amber-200 text-amber-900 text-[9px] font-bold px-1 rounded-sm shadow-sm border border-amber-300">
              {card.absorbedCount || 0}/{card.category.elementCount}
            </div>
          )}
        </div>
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
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
        <div className="bg-[#143d22]/80 backdrop-blur-sm p-1.5 rounded-xl border border-white/10 flex flex-col gap-1 shadow-lg">
          <button 
            onClick={handleQuickSolve}
            disabled={isAutoPlaying || isQuickSolving}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-yellow-400 disabled:opacity-30 disabled:hover:text-white/70"
            title="Quick Solve (Instant Complete)"
          >
            <Zap className={`w-5 h-5 ${isQuickSolving ? 'animate-pulse text-yellow-400' : ''}`} />
          </button>
          
          <div className="w-8 h-px bg-white/10 mx-auto my-1"></div>

          <button 
            onClick={() => setShowLog(!showLog)}
            className={`p-2.5 rounded-lg transition-colors flex items-center justify-center tooltip-trigger ${showLog ? 'bg-indigo-500 text-white' : 'hover:bg-white/10 text-white/70 hover:text-white'}`}
            title="Toggle Game Log"
          >
            <ClipboardList className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setShowHiddenCards(!showHiddenCards)}
            className={`p-2.5 rounded-lg transition-colors flex items-center justify-center tooltip-trigger ${showHiddenCards ? 'bg-solitaire-green text-white' : 'hover:bg-white/10 text-white/70 hover:text-white'}`}
            title="Toggle hidden cards visibility"
          >
            {showHiddenCards ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
          <button 
            onClick={handleUndo}
            disabled={history.length === 0 || isAutoPlaying || isQuickSolving}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Undo"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => handleReshuffle(false)}
            disabled={isAutoPlaying || isQuickSolving || !gameState || (gameState.drawPile.length === 0 && gameState.wastePile.length === 0 && !gameState.cols.some(c => c.some(card => !card.isRevealed)))}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-yellow-400 disabled:opacity-30"
            title="Super Reshuffle Deck"
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <div className="w-8 h-px bg-white/10 mx-auto my-1"></div>
          <button 
            onClick={handleRestart}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"
            title="Restart Level"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center">
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
              <AnimatePresence>
                {gameState.drawPile.map((card, idx) => (
                  <motion.div
                    key={card.id}
                    layoutId={card.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="absolute inset-0 bg-blue-800 rounded-md border-2 border-white/80 shadow-lg flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-700 to-blue-900"
                  >
                    {idx === gameState.drawPile.length - 1 && <div className="text-white/50 font-bold text-xl">{gameState.drawPile.length}</div>}
                  </motion.div>
                ))}
              </AnimatePresence>
              {gameState.drawPile.length === 0 && (
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
              <AnimatePresence>
                {gameState.wastePile.map((card, idx, arr) => {
                  const displayIdx = arr.length - 1 - idx;
                  if (displayIdx > 2) return null; // Only show top 3
                  
                  const isTop = idx === arr.length - 1;
                  // Reverse the index for visual positioning (0 is top)
                  const visualIdx = 2 - displayIdx;
                  
                  return (
                    <motion.div 
                      key={card.id}
                      layoutId={card.id}
                      initial={{ opacity: 0, x: -50 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className={`w-24 h-36 rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] absolute top-0 
                        ${isTop ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1' : ''}
                        ${card.kind === 1 ? 'bg-amber-50 border-amber-300 border-2' : 'bg-white border-slate-200 border'}
                      `}
                      style={{ left: `${(arr.length <= 3 ? idx : visualIdx) * 20}px`, zIndex: idx }}
                      draggable={isTop}
                      onDragStart={isTop ? (e: any) => handleDragStart(e, { type: 'waste', startIndex: gameState.wastePile.length - 1 }) : undefined}
                    >
                      {renderCard(card, !isTop, 'horizontal')}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
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
                    <AnimatePresence>
                      {foundCards.map((card, cardIndex) => {
                        const isTop = cardIndex === foundCards.length - 1;
                        return (
                          <motion.div 
                            key={card.id}
                            layoutId={card.id}
                            initial={{ scale: 1.2, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className={`w-24 h-36 rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] absolute top-0 left-0 
                              ${isTop ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1' : ''}
                              ${card.kind === 1 ? 'bg-amber-50 border-amber-300 border-2' : 'bg-white border-slate-200 border'}
                            `}
                            style={{ zIndex: cardIndex }}
                            draggable={isTop}
                            onDragStart={isTop ? (e: any) => handleDragStart(e, { type: 'foundation', index: i, startIndex: foundCards.length - 1 }) : undefined}
                          >
                            {renderCard(card, false, 'none')}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
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
              <AnimatePresence>
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
                  <motion.div 
                    key={card.id}
                    layoutId={card.id}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={`w-24 h-36 rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] absolute top-0 left-0 flex flex-col 
                      ${isDraggable ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1' : ''}
                      ${isFaceUp ? (card.kind === 1 ? 'bg-amber-50 border-amber-300 border-2' : 'bg-white border-slate-200 border') : 'bg-blue-800 border-2 border-white/20'}
                    `}
                    style={{ top: `${cardIndex * 32}px`, zIndex: cardIndex }}
                    draggable={isDraggable}
                    onDragStart={(e: any) => {
                      if (isDraggable) {
                        handleDragStart(e, { type: 'col', index: colIndex, startIndex: cardIndex });
                      } else {
                        e.preventDefault();
                      }
                    }}
                  >
                    {isFaceUp ? renderCard(card, !isTopCard, 'vertical') : (
                      <div className="absolute inset-0 rounded-md border border-white/20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-700 to-blue-900 m-1 flex items-center justify-center">
                        <div className="w-12 h-16 border border-white/10 rounded opacity-20 bg-repeat bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSI+PC9yZWN0Pgo8cGF0aCBkPSJNMCAwTDggOFpNOCAwTDAgOFoiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLW9wYWNpdHk9IjAuMSI+PC9wYXRoPgo8L3N2Zz4=')]"></div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          ))}
          </div>
        </div>
        <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-white font-medium border border-white/20 shadow-lg z-50">
          Moves: {gameState.moves} | Cards: {cardsLeft}
          {isQuickSolving && <div className="text-yellow-300 text-sm mt-1 animate-pulse">Calculating Path...</div>}
        </div>
      </div>

      {/* Game Log Drawer */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-[#0f2e1a]/95 backdrop-blur-lg border-t border-white/20 shadow-2xl transition-transform duration-300 ease-in-out z-40 flex flex-col ${showLog ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: '35vh' }}
      >
        <div className="flex justify-between items-center px-6 py-3 border-b border-white/10 shrink-0">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-400" />
            Nhật Ký Nước Đi
          </h3>
          <div className="flex items-center gap-3">
            {autoReshuffleCount > 0 && (
              <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded font-mono border border-yellow-500/30" title="Số lần hệ thống tự động Reshuffle">
                Auto Reshuffles: {autoReshuffleCount}
              </span>
            )}
            <button 
              onClick={() => setShowLog(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {history.length === 0 && (!gameState || !gameState.lastAction) ? (
            <div className="flex flex-col items-center justify-center h-full text-white/40 space-y-3">
              <ClipboardList className="w-8 h-8 opacity-50" />
              <p>Chưa có nước đi nào</p>
            </div>
          ) : (
            <>
              {[...history, gameState, ...futureHistory].map((h, i) => h?.lastAction && (
                <div 
                  key={`log-${i}-${h.moves}`} 
                  ref={h === gameState ? activeLogRef : undefined}
                  onClick={() => handleTimeTravel(i)}
                  className={`text-sm px-3 py-2 rounded font-mono border-l-2 cursor-pointer transition-colors ${
                    h === gameState 
                      ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400' 
                      : i < history.length
                        ? 'bg-black/20 text-white/70 border-transparent hover:bg-white/10 hover:border-white/30' 
                        : 'bg-black/40 text-white/40 border-transparent hover:bg-white/10 hover:border-white/30 opacity-60' 
                  }`}
                  title={h === gameState ? "Hiện tại" : "Click để tua về thời điểm này"}
                >
                  <div className="flex flex-col gap-1">
                    {h.lastAction.split('\n').map((line, lineIdx) => (
                      <div key={lineIdx} className="flex items-start">
                        {lineIdx === 0 ? (
                          <span className={`${h === gameState ? 'text-indigo-400/60' : 'text-white/40'} w-10 shrink-0 inline-block`}>#{h.moves}</span>
                        ) : (
                          <span className="w-10 shrink-0 inline-block"></span>
                        )}
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
