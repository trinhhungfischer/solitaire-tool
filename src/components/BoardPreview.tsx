import { useState, useMemo, useEffect, useRef } from 'react';
import type { CardData } from './CardBuilder';
import { RefreshCw, Image as ImageIcon, Eye, EyeOff, Undo2, Shuffle, ClipboardList, X, HelpCircle, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { computeDropState, checkHasAvailableMoves } from '../lib/gameLogic';
import type { PlayableCard, GameState } from '../lib/gameLogic';
import { getBestAutoMove } from '../lib/autoPlay';
import { getCSharpAutoMove } from '../lib/autoPlayCSharp';

interface BoardPreviewProps {
  foundationCount: number;
  columnCards: number[];
  data: CardData[];
  shuffleSeed?: number;
  maxMoves?: number;
  isAutoPlaying?: boolean;
  autoPlayStrategy?: 'tree' | 'priority';
  autoPlaySpeed?: number;
  instantTrigger?: number;
  showLog: boolean;
  setShowLog: (show: boolean) => void;
  logHeight: number;
  setLogHeight: (height: number) => void;
  onStopAutoPlay?: () => void;
  gameRule?: 'classic' | 'new';
  isEditorMode?: boolean;
  onSwapCards?: (sourceId: string, destId: string) => void;
  onCardClick?: (cardId: string) => void;
}

export default function BoardPreview({ 
  foundationCount, 
  columnCards, 
  data, 
  maxMoves, 
  isAutoPlaying, 
  autoPlayStrategy = 'tree', 
  autoPlaySpeed = 500, 
  instantTrigger = 0, 
  showLog,
  setShowLog,
  logHeight,
  setLogHeight,
  onStopAutoPlay, 
  gameRule = 'new',
  isEditorMode = false,
  onSwapCards,
  onCardClick
}: BoardPreviewProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [futureHistory, setFutureHistory] = useState<GameState[]>([]);
  const [showHiddenCards, setShowHiddenCards] = useState<boolean>(false);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [resetCount, setResetCount] = useState<number>(0);
  const [cardsDrawnSinceLastMove, setCardsDrawnSinceLastMove] = useState(0);
  const [autoReshuffleCount, setAutoReshuffleCount] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const activeLogRef = useRef<HTMLDivElement>(null);
  const isTimeTravelingRef = useRef(false);

  const totalReshuffles = useMemo(() => {
    let count = 0;
    const allStates = [...history];
    if (gameState) allStates.push(gameState);
    
    for (const state of allStates) {
      if (state.lastAction && state.lastAction.includes('Reshuffle')) {
        count++;
      }
    }
    return count;
  }, [history, gameState]);

  const totalRefills = useMemo(() => {
    let count = 0;
    const allStates = [...history];
    if (gameState) allStates.push(gameState);
    
    for (const state of allStates) {
      if (state.lastAction && state.lastAction.includes('Refill')) {
        count++;
      }
    }
    return count;
  }, [history, gameState]);

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
    if (!isAutoPlaying || !gameState) return;
    
    const interval = setInterval(() => {
      const bestMove = autoPlayStrategy === 'priority' 
        ? getCSharpAutoMove(gameState, gameRule)
        : getBestAutoMove(gameState, gameRule);
        
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
      const hasUnrevealed = gameState.cols.some(c => c.some(card => !card.isRevealed));
      if (hasUnrevealed) {
        // REFILL LOGIC
        const finalCols = gameState.cols.map(col => [...col]);
        let extractedCard = null;
        
        for (let i = 0; i < finalCols.length; i++) {
          const col = finalCols[i];
          const hiddenIdx = col.findIndex(c => !c.isRevealed);
          if (hiddenIdx !== -1) {
            extractedCard = col.splice(hiddenIdx, 1)[0];
            extractedCard.isRevealed = true;
            break;
          }
        }
        
        if (extractedCard) {
          setHistory(h => [...h, gameState]);
          setFutureHistory([]);
          setCardsDrawnSinceLastMove(0);
          setGameState({
            ...gameState,
            cols: finalCols,
            wastePile: [extractedCard],
            moves: gameState.moves + 1,
            lastAction: 'Bot bị kẹt & Hết Stock -> 🔄 Tự động Refill (Lấy 1 lá úp từ bàn)'
          });
          return;
        }
      }

      if (onStopAutoPlay) {
        onStopAutoPlay();
      }
    }, autoPlaySpeed);
    
    return () => clearInterval(interval);
  }, [isAutoPlaying, autoPlaySpeed, gameState, cardsDrawnSinceLastMove, autoPlayStrategy, onStopAutoPlay, gameRule]);

  useEffect(() => {
    if (instantTrigger > 0 && gameState && !isAutoPlaying) {
      let isCancelled = false;
      setIsCalculating(true);

      const runInstantPlay = async () => {
        let current = gameState;
        let path: GameState[] = [];
        let stuck = false;
        let steps = 0;
        let reshuffleCount = 0;
        let totalReshufflesInInstant = 0;
        let localCardsDrawn = 0;

        while (!stuck && steps < 500) {
          if (isCancelled) break;
          
          // Yield to main thread every 5 steps to prevent UI freeze
          if (steps > 0 && steps % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
            if (isCancelled) break;
          }

          const bestMove = autoPlayStrategy === 'priority' 
            ? getCSharpAutoMove(current, gameRule)
            : getBestAutoMove(current, gameRule);
            
          if (bestMove) {
            path.push(current);
            current = bestMove;
            localCardsDrawn = 0;
            reshuffleCount = 0;
            steps++;
          } else {
            const deckSize = current.drawPile.length + current.wastePile.length;
            if (localCardsDrawn > deckSize + 1 && deckSize > 0) {
              if (reshuffleCount < 5) {
                // Super reshuffle logic
                const pool = [...current.drawPile, ...current.wastePile];
                const newCols = current.cols.map(col => {
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

                const finalCols = current.cols.map((oldCol, colIndex) => {
                  const newCol = [];
                  const faceUpCards = newCols[colIndex];
                  const unrevealedCount = oldCol.length - faceUpCards.length;
                  for (let i = 0; i < unrevealedCount; i++) {
                    newCol.push({ ...pool.pop()!, isRevealed: false });
                  }
                  newCol.push(...faceUpCards);
                  return newCol;
                });

                const totalMixed = current.drawPile.length + current.wastePile.length + current.cols.reduce((sum, c) => sum + c.filter(card => !card.isRevealed).length, 0);
                const newDrawPile = pool.map(c => ({ ...c, isRevealed: true }));
                path.push(current);
                current = { 
                  ...current, 
                  cols: finalCols, 
                  drawPile: newDrawPile, 
                  wastePile: [], 
                  moves: current.moves, 
                  lastAction: 'Bot bị kẹt -> 🔀 Tự động Super Reshuffle',
                  actionDetails: `Đã trộn lại ngẫu nhiên ${totalMixed} lá bài (bao gồm các lá úp và Stock).` 
                };
                localCardsDrawn = 0;
                reshuffleCount++;
                totalReshufflesInInstant++;
                steps++;
              } else {
                stuck = true;
              }
            } else {
              localCardsDrawn++;
              if (current.drawPile.length > 0) {
                const newDraw = [...current.drawPile];
                const card = newDraw.shift()!;
                path.push(current);
                current = { ...current, drawPile: newDraw, wastePile: [...current.wastePile, card], moves: current.moves + 1, lastAction: 'Bot: Rút 1 lá từ Stock' };
                steps++;
              } else if (current.wastePile.length > 0) {
                path.push(current);
                current = { ...current, drawPile: [...current.wastePile], wastePile: [], moves: current.moves + 1, lastAction: 'Bot: Chuyển Waste về Stock' };
                steps++;
              } else {
                // REFILL LOGIC
                const hasUnrevealed = current.cols.some(c => c.some(card => !card.isRevealed));
                if (hasUnrevealed) {
                  const finalCols = current.cols.map(col => [...col]);
                  const extractedCards: PlayableCard[] = [];
                  const extractedCols: number[] = [];
                  
                  for (let i = 0; i < finalCols.length; i++) {
                    const col = finalCols[i];
                    const hiddenIdx = col.findIndex(c => !c.isRevealed);
                    if (hiddenIdx !== -1) {
                      const card = col.splice(hiddenIdx, 1)[0];
                      card.isRevealed = true;
                      extractedCards.push(card);
                      extractedCols.push(i + 1);
                    }
                  }
                  
                  if (extractedCards.length > 0) {
                    path.push(current);
                    current = {
                      ...current,
                      cols: finalCols,
                      wastePile: extractedCards,
                      moves: current.moves,
                      lastAction: 'Bot bị kẹt & Hết Stock -> 🔄 Tự động Refill (Lấy 1 lá úp từ bàn)',
                      actionDetails: `Đã lật ${extractedCards.length} lá từ các cột ${extractedCols.join(', ')} lên Waste pile.`
                    };
                    localCardsDrawn = 0;
                    steps++;
                    continue;
                  }
                }
                stuck = true;
              }
            }
          }
        }
        
        if (!isCancelled) {
          if (path.length > 0) {
            setHistory(h => [...h, ...path]);
            setFutureHistory([]);
            setGameState(current);
            if (reshuffleCount > 0) {
              setAutoReshuffleCount(c => c + reshuffleCount);
            }
          }
          if (isAutoPlaying) {
            onStopAutoPlay?.();
          }
          setIsCalculating(false);
        }
      };

      runInstantPlay();

      return () => {
        isCancelled = true;
        setIsCalculating(false);
      };
    }
  }, [instantTrigger]);

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
    
    // Generate custom drag image for dragging a stack
    if (source.type === 'col') {
      const colCards = gameState?.cols[source.index];
      if (colCards && source.startIndex < colCards.length - 1) {
        const cardElement = e.currentTarget as HTMLElement;
        const dragContainer = document.createElement('div');
        dragContainer.style.position = 'absolute';
        dragContainer.style.top = '-1000px';
        dragContainer.style.left = '-1000px';
        dragContainer.style.pointerEvents = 'none';
        
        const colContainer = cardElement.parentElement;
        if (colContainer) {
          const cardNodes = Array.from(colContainer.children);
          // The first child is the empty slot dropzone, so cards start at index 1
          const rootDomIndex = source.startIndex + 1;
          
          if (rootDomIndex < cardNodes.length) {
            for (let i = rootDomIndex; i < cardNodes.length; i++) {
               const clone = cardNodes[i].cloneNode(true) as HTMLElement;
               const currentTop = parseInt(clone.style.top || '0');
               const firstTop = parseInt((cardNodes[rootDomIndex] as HTMLElement).style.top || '0');
               clone.style.top = `${currentTop - firstTop}px`;
               clone.style.left = '0px';
               clone.style.margin = '0px';
               // Remove dragging class from clones so they don't look weird
               clone.classList.remove('cursor-grab', 'active:cursor-grabbing', 'hover:-translate-y-1');
               dragContainer.appendChild(clone);
            }
            document.body.appendChild(dragContainer);
            // Fallback to center if offsetX/Y are not available (e.g. mobile/touch)
            const offsetX = e.nativeEvent.offsetX ?? 48;
            const offsetY = e.nativeEvent.offsetY ?? 48;
            e.dataTransfer.setDragImage(dragContainer, offsetX, offsetY);
            
            setTimeout(() => {
              if (dragContainer.parentNode) document.body.removeChild(dragContainer);
            }, 0);
          }
        }
      }
    }
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
    if (isEditorMode) return;
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
    if (history.length > 0 && !isAutoPlaying) {
      const prevState = history[history.length - 1];
      setFutureHistory(prev => [gameState!, ...prev]);
      setGameState(prevState);
      setHistory(history.slice(0, -1));
    }
  };

  const handleTimeTravel = (historyIndex: number) => {
    if (isAutoPlaying || !gameState) return;
    isTimeTravelingRef.current = true;
    const fullTimeline = [...history, gameState, ...futureHistory];
    const targetState = fullTimeline[historyIndex];
    if (!targetState) return;
    
    setHistory(fullTimeline.slice(0, historyIndex));
    setGameState(targetState);
    setFutureHistory(fullTimeline.slice(historyIndex + 1));
    setCardsDrawnSinceLastMove(0);
  };

  const handleReshuffle = (isAutoTrigger = false) => {
    const hasUnrevealed = gameState?.cols.some(c => c.some(card => !card.isRevealed));
    if (!gameState || isAutoPlaying || (gameState.drawPile.length === 0 && gameState.wastePile.length === 0 && !hasUnrevealed)) return;
    
    setHistory(h => [...h, gameState]);
    setFutureHistory([]);

    if (gameState.drawPile.length === 0 && gameState.wastePile.length === 0 && hasUnrevealed) {
      // REFILL LOGIC
      const finalCols = gameState.cols.map(col => [...col]);
      const extractedCards: PlayableCard[] = [];
      const extractedCols: number[] = [];
      
      for (let i = 0; i < finalCols.length; i++) {
        const col = finalCols[i];
        const hiddenIdx = col.findIndex(c => !c.isRevealed);
        if (hiddenIdx !== -1) {
          const card = col.splice(hiddenIdx, 1)[0];
          card.isRevealed = true;
          extractedCards.push(card);
          extractedCols.push(i + 1);
        }
      }
      
      if (extractedCards.length > 0) {
        setGameState({
          ...gameState,
          cols: finalCols,
          wastePile: extractedCards,
          moves: gameState.moves,
          lastAction: isAutoTrigger ? 'Bot bị kẹt -> 🔄 Tự động Refill' : 'Người chơi: 🔄 Refill (Rút úp)',
          actionDetails: `Đã lật ${extractedCards.length} lá từ các cột ${extractedCols.join(', ')} lên Waste pile.`
        });
        return;
      }
    }
    
    const generateShuffle = () => {
      const pool = [...gameState.drawPile, ...gameState.wastePile];
      const newCols = gameState.cols.map(col => {
        const newCol = [];
        for (const card of col) {
          if (!card.isRevealed) pool.push(card);
          else newCol.push(card);
        }
        return newCol;
      });

      // Foundation Feeder Strategy: find the Base card closest to completion in foundation
      let targetCategoryId: number | null = null;
      let minRemaining = Infinity;

      gameState.foundations.forEach(f => {
        if (f.length > 0) {
          const baseCard = f[f.length - 1];
          if (baseCard.kind === 1) {
            const absorbed = baseCard.absorbedCount || 0;
            const remaining = baseCard.category.elementCount - absorbed;
            if (remaining > 0 && remaining < minRemaining) {
              minRemaining = remaining;
              targetCategoryId = baseCard.category.id;
            }
          }
        }
      });

      // Shuffle pool first to randomize selections
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      const feederCards: typeof pool = [];
      const remainingPool: typeof pool = [];

      // Extract ALL matching Math cards for the target Foundation Base card
      for (const card of pool) {
        if (card.kind === 0 && targetCategoryId !== null && card.category.id == targetCategoryId) {
          feederCards.push(card);
        } else {
          remainingPool.push(card);
        }
      }

      // Distribute back to unrevealed slots with Anti-Burying logic
      const finalCols = gameState.cols.map((oldCol, colIndex) => {
        const newCol = [];
        const faceUpCards = newCols[colIndex];
        const unrevealedCount = oldCol.length - faceUpCards.length;
        
        // Anti-Burying: Don't place a Math card under its own Base card
        const forbiddenCategories = new Set<number>();
        faceUpCards.forEach(c => {
           if (c.kind === 1) forbiddenCategories.add(c.category.id);
        });

        for (let i = 0; i < unrevealedCount; i++) {
          if (remainingPool.length > 0) {
            let safeIndex = remainingPool.findIndex(c => !(c.kind === 0 && forbiddenCategories.has(c.category.id)));
            if (safeIndex === -1) safeIndex = 0; // Fallback if no safe card exists
            const card = remainingPool.splice(safeIndex, 1)[0];
            newCol.push({ ...card, isRevealed: false });
          }
        }
        newCol.push(...faceUpCards);
        return newCol;
      });

      // Place the rest + feeder cards into the draw pile randomly
      const finalDrawPool = [...feederCards, ...remainingPool];
      for (let i = finalDrawPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalDrawPool[i], finalDrawPool[j]] = [finalDrawPool[j], finalDrawPool[i]];
      }
      const newDrawPile = finalDrawPool.map(c => ({ ...c, isRevealed: true }));

      const actionText = isAutoTrigger ? 'Hệ thống: Hết nước đi -> 🔀 Tự động Super Reshuffle' : 'Người chơi: 🔀 Super Reshuffle';
      const feederNames = feederCards.map(c => `[${c.value || c.wordImageKey || '?'}${c.category.name ? ` - ${c.category.name}` : ''}]`).join(', ');
      const actionDetails = feederCards.length > 0 ? `Đã gom các lá bài ưu tiên (Feeder Cards): ${feederNames} đưa vào Stock. Tổng cộng đã trộn lại ${pool.length} lá bài.` : `Đã gom ${pool.length} lá bài úp và Stock để trộn lại ngẫu nhiên.`;
      
      return { ...gameState, cols: finalCols, drawPile: newDrawPile, wastePile: [], moves: gameState.moves, lastAction: actionText, actionDetails };
    };

    const bestState = generateShuffle();
    setGameState(bestState);
    setCardsDrawnSinceLastMove(0);
    if (isAutoTrigger) {
      setAutoReshuffleCount(c => c + 1);
    }
  };

  const handleLogResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, startHeight + (startY - moveEvent.clientY)));
      setLogHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleJumpToEvent = (eventType: 'Reshuffle' | 'Refill') => {
    const fullTimeline = [...history, gameState, ...futureHistory];
    const currentIndex = history.length;
    
    // Find next event after current index
    let nextIndex = -1;
    for (let i = currentIndex + 1; i < fullTimeline.length; i++) {
      if (fullTimeline[i]?.lastAction?.includes(eventType)) {
        nextIndex = i;
        break;
      }
    }
    
    // Wrap around if not found
    if (nextIndex === -1) {
      for (let i = 0; i <= currentIndex; i++) {
        if (fullTimeline[i]?.lastAction?.includes(eventType)) {
          nextIndex = i;
          break;
        }
      }
    }

    if (nextIndex !== -1 && nextIndex !== currentIndex) {
      handleTimeTravel(nextIndex);
    }
  };

  const handleExportLog = () => {
    const fullTimeline = [...history, gameState, ...futureHistory];
    let logText = "NHẬT KÝ NƯỚC ĐI SOLITAIRE\n";
    logText += "================================\n\n";

    fullTimeline.forEach((h, i) => {
      if (h?.lastAction) {
        logText += `[Bước ${h.moves}] ${h.lastAction}\n`;
        if (h.actionDetails) {
          logText += `   -> Chi tiết: ${h.actionDetails}\n`;
        }
        logText += "\n";
      }
    });

    logText += "================================\n";
    logText += `Tổng số bước: ${gameState?.moves || 0}\n`;
    logText += `Tổng số lần Reshuffle: ${totalReshuffles}\n`;
    logText += `Tổng số lần Refill: ${totalRefills}\n`;

    const blob = new Blob([logText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    a.download = `solitaire_log_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!gameState || isAutoPlaying || futureHistory.length > 0) return;

    const hasUnrevealed = gameState.cols.some(c => c.some(card => !card.isRevealed));
    if (!hasUnrevealed && gameState.drawPile.length === 0 && gameState.wastePile.length === 0) return;

    const hasMoves = checkHasAvailableMoves(gameState, gameRule);
    if (!hasMoves && gameRule === 'new') {
      const timer = setTimeout(() => {
        handleReshuffle(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState, isAutoPlaying, gameRule, futureHistory.length]);

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

  const stockColsCount = Math.ceil(gameState.drawPile.length / 18);
  const extraLeftSpace = isEditorMode && stockColsCount > 1 ? (stockColsCount - 1) * 112 : 0;

  return (
    <div className="relative w-full h-full bg-[#1A4E2B] overflow-hidden flex flex-col p-6 font-sans">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
        <div className="bg-[#143d22]/80 backdrop-blur-sm p-1.5 rounded-xl border border-white/10 flex flex-col gap-1 shadow-lg">
          <button 
            onClick={() => setShowRules(true)}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center tooltip-trigger hover:bg-white/10 text-white/70 hover:text-white"
            title="Luật chơi (Rules)"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
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
            disabled={history.length === 0 || isAutoPlaying}
            className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Undo"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => handleReshuffle(false)}
            disabled={isAutoPlaying || !gameState || (gameState.drawPile.length === 0 && gameState.wastePile.length === 0 && !gameState.cols.some(c => c.some(card => !card.isRevealed)))}
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

      <div 
        className="flex-1 w-full mx-auto flex flex-col gap-8 transition-all duration-300 overflow-x-auto"
        style={{ paddingLeft: `${extraLeftSpace}px` }}
      >
        
        {/* Top Area: Perfectly Aligned with Tableau */}
        <div className="flex justify-center gap-4 px-4 mt-8 min-w-max">
          
          {/* Stock (Col 1) */}
          <div className="w-24 relative">
            <div className="absolute -top-7 left-0 right-0 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase">Stock</div>
            <div 
              className={`w-24 h-36 rounded-lg border-2 border-white/20 bg-[#143d22] flex items-center justify-center relative shadow-inner cursor-pointer hover:bg-[#1a4a2a] transition-colors select-none ${isEditorMode ? 'border-transparent bg-transparent shadow-none hover:bg-transparent cursor-default' : ''}`}
              onClick={!isEditorMode ? handleDrawClick : undefined}
            >
              <AnimatePresence>
                {gameState.drawPile.map((card, idx) => {
                  const isFaceUp = isEditorMode; // In editor mode, stock cards are face up
                  const col = Math.floor(idx / 18);
                  const row = idx % 18;
                  const isCovered = row < 17 && idx < gameState.drawPile.length - 1; // Covered if not the last card in the column or pile
                  return (
                    <motion.div
                      key={card.id}
                      layoutId={card.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className={isEditorMode 
                        ? `w-24 h-36 rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] absolute top-0 left-0 flex flex-col cursor-grab active:cursor-grabbing hover:-translate-y-1 ${card.kind === 1 ? 'bg-amber-50 border-amber-300 border-2' : 'bg-white border-slate-200 border'}` 
                        : "absolute inset-0 bg-blue-800 rounded-md border-2 border-white/80 shadow-lg flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-700 to-blue-900"}
                      style={isEditorMode ? { top: `${row * 32}px`, left: `${-col * 112}px`, zIndex: idx } : undefined}
                      draggable={isEditorMode}
                      onDragStart={isEditorMode ? (e: any) => { e.dataTransfer.setData('text/editor-card', card.__id); } : undefined}
                      onDrop={isEditorMode ? (e: any) => {
                        e.preventDefault();
                        const sourceId = e.dataTransfer.getData('text/editor-card');
                        if (sourceId && onSwapCards) onSwapCards(sourceId, card.__id!);
                      } : undefined}
                      onDragOver={isEditorMode ? (e) => e.preventDefault() : undefined}
                      onClick={isEditorMode ? (e) => { e.stopPropagation(); if (onCardClick) onCardClick(card.__id!); } : undefined}
                    >
                      {!isEditorMode && idx === gameState.drawPile.length - 1 && <div className="text-white/50 font-bold text-xl">{gameState.drawPile.length}</div>}
                      {isEditorMode && renderCard(card, isCovered, 'vertical')}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {gameState.drawPile.length === 0 && !isEditorMode && (
                <div className="w-full h-full rounded-md flex items-center justify-center text-white/20 text-3xl font-bold">
                  ↺
                </div>
              )}
            </div>
          </div>

          {/* Waste (Col 2) */}
          <div className="w-24 relative">
            <div className="absolute -top-7 left-0 right-0 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase">Waste</div>
            <div className="w-24 h-36 relative border-2 border-transparent">
              {gameState.wastePile.length === 0 && (
                <div className="w-24 h-36 rounded-lg border-2 border-white/10 bg-[#143d22]/50 absolute top-0 left-0" />
              )}
              <AnimatePresence>
                {gameState.wastePile.map((card, idx, arr) => {
                  const displayIdx = arr.length - 1 - idx;
                  if (displayIdx > 2) return null;
                  
                  const isTop = idx === arr.length - 1;
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

          {/* Spacer (Col 3) */}
          <div className="w-24 relative"></div>

          {/* Foundations (Cols 4-7) */}
          {gameState.foundations.map((foundCards, i) => (
            <div key={i} className="w-24 relative">
              {i === 0 && <div className="absolute -top-7 left-0 right-0 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase whitespace-nowrap">Foundation</div>}
              <div 
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
            </div>
          ))}
        </div>

        {/* Bottom Area: Tableau (Columns) */}
        <div className="relative flex-1 flex flex-col pt-8 mt-4">
          <div className="absolute top-0 left-0 right-0 text-center text-[12px] font-bold text-white/50 tracking-widest uppercase">Tableau</div>
          <div className="flex-1 flex justify-center gap-4 px-4 pb-8 min-w-max">
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
                const isFaceUp = card.isRevealed || showHiddenCards || isEditorMode;

                // Check if this card and all cards below it form a valid stack
                // A valid stack must be all face up, all Kind 0 (Math), and same category ID
                let isDraggable = isEditorMode ? true : isTopCard;
                if (!isEditorMode && !isTopCard && isFaceUp && card.kind === 0) {
                  let isValidStack = true;
                  for (let k = cardIndex; k < colCards.length; k++) {
                    const c = colCards[k];
                    if (c.kind !== 0 || c.category.id != card.category.id || !(c.isRevealed || showHiddenCards)) {
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
                      if (isEditorMode) {
                        e.dataTransfer.setData('text/editor-card', card.__id);
                        return;
                      }
                      if (isDraggable) {
                        let rootIndex = cardIndex;
                        if (card.kind === 0) {
                          while (rootIndex > 0) {
                            const prevCard = colCards[rootIndex - 1];
                            if (prevCard.isRevealed && prevCard.kind === 0 && prevCard.category.id == card.category.id) {
                              rootIndex--;
                            } else {
                              break;
                            }
                          }
                        }
                        handleDragStart(e, { type: 'col', index: colIndex, startIndex: rootIndex });
                      } else {
                        e.preventDefault();
                      }
                    }}
                    onDrop={isEditorMode ? (e: any) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const sourceId = e.dataTransfer.getData('text/editor-card');
                      if (sourceId && onSwapCards) onSwapCards(sourceId, card.__id!);
                    } : undefined}
                    onDragOver={isEditorMode ? (e) => e.preventDefault() : undefined}
                    onClick={isEditorMode ? (e) => { e.stopPropagation(); if (onCardClick) onCardClick(card.__id!); } : undefined}
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
        <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-white font-medium border border-white/20 shadow-lg z-50 flex items-center gap-3 whitespace-nowrap text-sm shrink-0">
          <span className="text-yellow-300">Left: {(maxMoves || 0) - gameState.moves}</span>
          <span className="text-white/30">|</span>
          <span>Moves: {gameState.moves}</span>
          <span className="text-white/30">|</span>
          <span>Cards: {cardsLeft}</span>
        </div>
      </div>

      {/* Game Log Drawer */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-[#0f2e1a]/60 backdrop-blur-sm shadow-[0_-10px_30px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out z-40 flex flex-col ${showLog ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: `${logHeight}px` }}
      >
        {/* Resize Handle */}
        <div 
          className="absolute top-0 left-0 right-0 h-3 cursor-row-resize flex justify-center items-center group/resize"
          onMouseDown={handleLogResizeMouseDown}
        >
          <div className="w-16 h-1 bg-white/20 rounded-full group-hover/resize:bg-white/60 transition-colors"></div>
        </div>

        <div className="flex justify-between items-center px-6 py-3 border-b border-white/10 shrink-0 mt-2">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-400" />
            Nhật Ký Nước Đi ({gameState?.moves || 0} bước)
          </h3>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleJumpToEvent('Reshuffle')}
              className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded font-mono border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors cursor-pointer" 
              title="Click để nhảy đến lần Reshuffle tiếp theo"
            >
              Reshuffles: {totalReshuffles}
            </button>
            <button 
              onClick={() => handleJumpToEvent('Refill')}
              className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded font-mono border border-purple-500/30 hover:bg-purple-500/30 transition-colors cursor-pointer" 
              title="Click để nhảy đến lần Refill tiếp theo"
            >
              Refills: {totalRefills}
            </button>
            <button 
              onClick={handleExportLog}
              className="p-1.5 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded-lg transition-colors border border-emerald-500/30 ml-2"
              title="Xuất nhật ký ra file text"
            >
              <Download className="w-5 h-5" />
            </button>
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
                    {h.lastAction.split('\n').map((line, lineIdx) => {
                      const isSystemEvent = line.includes('Reshuffle') || line.includes('Refill');
                      return (
                        <div key={lineIdx} className="flex items-start">
                          {lineIdx === 0 ? (
                            isSystemEvent ? (
                              <span className="w-10 shrink-0 inline-block text-white/30 text-xs mt-0.5">--</span>
                            ) : (
                              <span className={`${h === gameState ? 'text-indigo-400/60' : 'text-white/40'} w-10 shrink-0 inline-block`}>#{h.moves}</span>
                            )
                          ) : (
                            <span className="w-10 shrink-0 inline-block"></span>
                          )}
                          <span>{line}</span>
                        </div>
                      );
                    })}
                    {h.actionDetails && (
                      <div className="flex items-start mt-1">
                        <span className="w-10 shrink-0 inline-block"></span>
                        <span className="text-xs text-indigo-300/80 italic">{h.actionDetails}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {showRules && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-solitaire-green" />
                Luật Chơi (Default)
              </h2>
              <button onClick={() => setShowRules(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 text-slate-700 text-[15px] leading-relaxed">
              <p><strong className="text-indigo-600">1. Math vào Math:</strong> Kéo 1 thẻ Math (hoặc 1 chồng thẻ) lên trên thẻ Math khác <span className="font-semibold text-slate-900">cùng nhóm (Category)</span>.</p>
              <p><strong className="text-indigo-600">2. Kéo vào ô trống:</strong> Cả thẻ Math và thẻ Base đều được phép kéo vào một cột đang trống trên bàn chơi.</p>
              <p><strong className="text-indigo-600">3. Base ăn Math:</strong> Có thể cầm thẻ Base đè lên thẻ Math cùng nhóm để "ăn" (tuyệt đối không kéo ngược lại).</p>
              <p><strong className="text-indigo-600">4. Foundation:</strong> <span className="font-semibold text-slate-900">Chỉ duy nhất thẻ Base</span> mới được kéo lên các ô Foundation ở góc trên cùng.</p>
              <p><strong className="text-indigo-600">5. Rút bài & Kẹt:</strong> Khi bí bước, bạn có thể rút bài từ Stock (Nọc) hoặc bấm nút Super Reshuffle (Xáo Trộn) để đi tiếp.</p>
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setShowRules(false)} 
                className="bg-solitaire-green text-white px-6 py-2.5 rounded-lg font-bold hover:bg-[#143d22] transition-colors shadow-md w-full"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {isCalculating && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-4 transition-all duration-300">
          <div className="bg-[#143d22] p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 border-2 border-amber-400/30">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-amber-400/20 border-t-amber-400 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-amber-400 rounded-full animate-pulse opacity-50"></div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <h3 className="text-white font-black text-2xl uppercase tracking-wider drop-shadow-md">
                Đang Tính Toán...
              </h3>
              <p className="text-amber-200/80 text-sm font-medium animate-pulse">
                Hệ thống đang quét hàng ngàn trường hợp
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
