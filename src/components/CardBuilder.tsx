import { useMemo, useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Image as ImageIcon, Type, GripVertical, Wand2, RefreshCw, Shuffle } from 'lucide-react';

interface Category {
  id: number;
  elementCount: number;
  displayName: number;
  hasImage: number;
}

export interface CardData {
  kind: number;
  wordVisualType: number;
  category: Category;
  wordText?: string;
  wordImageKey?: string | null;
  __id?: string;
}

interface CardBuilderProps {
  levelId: number;
  data: CardData[];
  onChange: (newData: CardData[]) => void;
  selectedCardId?: string | null;
}

// Helper to group cards by category ID but preserve original array index
const groupByCategory = (data: CardData[]) => {
  const groups: Record<number, { cat: Category; kind0: { card: CardData, index: number }[]; kind1: { card: CardData, index: number } | null }> = {};
  data.forEach((card, index) => {
    const id = card.category.id;
    if (!groups[id]) {
      groups[id] = { cat: { ...card.category }, kind0: [], kind1: null };
    }
    if (card.kind === 1) {
      groups[id].kind1 = { card, index };
    } else {
      groups[id].kind0.push({ card, index });
    }
  });
  return Object.values(groups).sort((a, b) => a.cat.id - b.cat.id);
};

export default function CardBuilder({ levelId, data, onChange, selectedCardId }: CardBuilderProps) {
  const [activeTab, setActiveTab] = useState<'categories' | 'deckOrder'>('categories');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Initialize unique keys for drag and drop to prevent flicker
  useEffect(() => {
    let needsUpdate = false;
    const newData = data.map(c => {
      if (!c.__id) {
        needsUpdate = true;
        return { ...c, __id: Math.random().toString(36).substring(7) };
      }
      return c;
    });
    if (needsUpdate) {
      onChange(newData);
    }
  }, [data, onChange]);

  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (selectedCardId) {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      if (highlightedElementRef.current) {
        highlightedElementRef.current.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
      }

      const element = document.getElementById(`card-row-${selectedCardId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
        highlightedElementRef.current = element;

        highlightTimeoutRef.current = setTimeout(() => {
          element.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
          highlightedElementRef.current = null;
        }, 1000);
      }
    }
  }, [selectedCardId]);

  const categories = useMemo(() => groupByCategory(data), [data]);

  const emitChange = (newData: CardData[]) => {
    // Recalculate elementCount for each category
    const counts: Record<number, number> = {};
    newData.forEach(c => {
      if (c.kind === 0) counts[c.category.id] = (counts[c.category.id] || 0) + 1;
    });

    const finalData = newData.map(c => ({
      ...c,
      category: {
        ...c.category,
        elementCount: counts[c.category.id] || 0
      }
    }));
    onChange(finalData);
  };

  const handleAddCategory = () => {
    const totalCards = data.length;
    const newId = (levelId * 100) + totalCards;
    
    const newCat: Category = {
      id: newId,
      elementCount: 0,
      displayName: 10,
      hasImage: 0
    };

    const newBaseCard: CardData = { kind: 1, wordVisualType: 0, category: newCat, __id: Math.random().toString(36).substring(7) };
    emitChange([...data, newBaseCard]);
  };

  const recalculateIdsAndEmit = (newData: CardData[]) => {
    const uniqueIds = Array.from(new Set(newData.map(c => c.category.id))).sort((a,b) => a - b);
    let currentCumulative = 0;
    const idMap: Record<number, number> = {};
    uniqueIds.forEach(id => {
      idMap[id] = (levelId * 100) + currentCumulative;
      currentCumulative += newData.filter(c => c.category.id === id).length;
    });

    const finalData = newData.map(c => ({
      ...c,
      category: { ...c.category, id: idMap[c.category.id] }
    }));
    emitChange(finalData);
  };

  const handleRemoveCategory = (catId: number) => {
    const newData = data.filter(c => c.category.id !== catId);
    recalculateIdsAndEmit(newData);
  };

  const handleAddCard = (catId: number) => {
    const existing = data.find(c => c.category.id === catId);
    if (!existing) return;
    
    const newMathCard: CardData = {
      kind: 0, 
      wordVisualType: 0, 
      category: existing.category, 
      wordText: "1+1",
      __id: Math.random().toString(36).substring(7)
    };
    
    const newData = [...data, newMathCard];
    recalculateIdsAndEmit(newData);
  };

  const handleRemoveCard = (originalIndex: number) => {
    const newData = data.filter((_, i) => i !== originalIndex);
    recalculateIdsAndEmit(newData);
  };

  const handleUpdateCategoryDisplay = (catId: number, val: number) => {
    const newData = data.map(c => {
      if (c.category.id === catId) {
        return { ...c, category: { ...c.category, displayName: val } };
      }
      return c;
    });
    emitChange(newData);
  };

  const handleUpdateCard = (originalIndex: number, field: string, val: any) => {
    const newData = [...data];
    newData[originalIndex] = { ...newData[originalIndex], [field]: val };
    emitChange(newData);
  };

  const evalFormula = (formula: string): number | null => {
    if (!formula) return null;
    const match = formula.match(/^\s*(\d+)\s*([+\-X*/x])\s*(\d+)\s*$/);
    if (!match) return null;
    const a = parseInt(match[1]);
    const op = match[2].toUpperCase();
    const b = parseInt(match[3]);
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*':
      case 'X': return a * b;
      case '/': return b !== 0 ? a / b : null;
    }
    return null;
  };

  const generateNewFormula = (card: CardData, targetResult: number): string => {
    const ops = ['+', '-', 'X', '/'];
    let op = ops[Math.floor(Math.random() * ops.length)];
    if (card.wordText) {
      const match = card.wordText.match(/[+\-X*/x]/);
      if (match) {
        op = match[0].toUpperCase();
        if (op === '*') op = 'X';
      }
    }
    let a, b;
    switch (op) {
      case '+':
        a = Math.floor(Math.random() * targetResult) || 1;
        b = targetResult - a;
        break;
      case '-':
        b = Math.floor(Math.random() * 20) + 1;
        a = targetResult + b;
        break;
      case '*':
      case 'X':
        const factors = [];
        for (let i = 1; i <= targetResult; i++) {
          if (targetResult % i === 0) factors.push(i);
        }
        a = factors[Math.floor(Math.random() * factors.length)];
        b = targetResult / a;
        break;
      case '/':
        b = Math.floor(Math.random() * 10) + 1;
        a = targetResult * b;
        break;
      default:
        a = 1; b = 1;
        break;
    }
    if ((op === '+' || op === 'X') && Math.random() > 0.5) {
      const temp = a; a = b; b = temp;
    }
    return `${a} ${op} ${b}`;
  };

  const handleGenerateFormulas = (categoryId: number, targetResult: number) => {
    const newData = [...data];
    let changed = false;

    newData.forEach((card, index) => {
      if (card.category.id === categoryId && card.kind === 0 && card.wordVisualType === 0) {
        const newFormula = generateNewFormula(card, targetResult);
        if (card.wordText !== newFormula) {
          newData[index] = { ...card, wordText: newFormula };
          changed = true;
        }
      }
    });

    if (changed) {
      emitChange(newData);
    }
  };

  const handleRegenerateAllCategories = () => {
    if (!confirm("Hành động này sẽ tạo lại ngẫu nhiên tất cả Result của các category (vẫn giữ độ lớn tương đương) và tự động tạo lại tất cả công thức toán. Bạn có chắc chắn không?")) return;
    
    const newData = [...data];
    let changed = false;

    const isComposite = (n: number) => {
      if (n <= 3) return false;
      for (let i = 2; i <= Math.sqrt(n); i++) {
        if (n % i === 0) return true;
      }
      return false;
    };

    const uniqueCatIds = Array.from(new Set(newData.map(c => c.category.id)));
    
    uniqueCatIds.forEach(catId => {
      const sampleCard = newData.find(c => c.category.id === catId);
      if (!sampleCard) return;
      const oldResult = sampleCard.category.displayName;
      
      const hasMultiplication = newData.some(c => c.category.id === catId && c.kind === 0 && c.wordVisualType === 0 && c.wordText && c.wordText.match(/[*Xx]/));

      let newResult = oldResult;
      const min = Math.max(1, Math.floor(oldResult * 0.7));
      const max = Math.ceil(oldResult * 1.3) + 2;
      
      let attempts = 0;
      do {
        newResult = Math.floor(Math.random() * (max - min + 1)) + min;
        attempts++;
      } while (hasMultiplication && !isComposite(newResult) && attempts < 10);
      
      if (hasMultiplication && !isComposite(newResult)) {
         newResult = newResult * 2;
      }

      newData.forEach((card, idx) => {
        if (card.category.id === catId) {
          newData[idx] = { ...card, category: { ...card.category, displayName: newResult } };
          changed = true;
          
          if (card.kind === 0 && card.wordVisualType === 0) {
            newData[idx].wordText = generateNewFormula(newData[idx], newResult);
          }
        }
      });
    });

    if (changed) {
      emitChange(newData);
    }
  };

  // Drag and drop handlers for Deck Order
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.4';
      }
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newData = [...data];
    const [moved] = newData.splice(draggedIndex, 1);
    newData.splice(index, 0, moved);
    
    // We update without re-calculating category IDs to preserve groups
    emitChange(newData);
    setDraggedIndex(index);
  };

  const handleShuffleCards = () => {
    if (confirm('Bạn có chắc muốn xáo trộn ngẫu nhiên toàn bộ thứ tự bài trong Deck không?')) {
      const newData = [...data];
      for (let i = newData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newData[i], newData[j]] = [newData[j], newData[i]];
      }
      emitChange(newData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-slate-200 pb-2 mb-6">
        <button 
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'categories' ? 'border-solitaire-green text-solitaire-green' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Categories
        </button>
        <button 
          onClick={() => setActiveTab('deckOrder')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'deckOrder' ? 'border-solitaire-green text-solitaire-green' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Deck Order
        </button>
      </div>

      {activeTab === 'categories' && (
        <>
          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <h3 className="text-lg font-semibold">Categories ({categories.length})</h3>
            <div className="flex gap-2">
              <button 
                onClick={handleRegenerateAllCategories}
                className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-200 transition-colors"
                title="Tạo lại kết quả ngẫu nhiên cho tất cả danh mục (có cùng độ lớn) và sinh lại các công thức tương ứng"
              >
                <RefreshCw className="w-4 h-4" /> Auto Regenerate All
              </button>
              <button 
                onClick={handleAddCategory}
                className="flex items-center gap-2 bg-solitaire-green text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-solitaire-dark transition-colors"
              >
                <Plus className="w-4 h-4" /> New Category
              </button>
            </div>
          </div>

          {/* Quick Navigation List */}
          <div className="flex flex-wrap gap-2 mb-6 bg-white p-3 rounded-xl shadow-[0_4px_15px_-3px_rgba(0,0,0,0.1)] border border-slate-200 sticky top-0 z-20">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 w-full mb-1 flex items-center gap-1">Quick Jump ({categories.length})</span>
            {categories.map((group) => (
              <button 
                key={group.cat.id}
                onClick={() => {
                  document.getElementById(`category-${group.cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="bg-slate-50 border border-slate-200 hover:border-solitaire-green hover:text-solitaire-green text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <span className="text-amber-600 font-black text-sm">[{group.cat.displayName}]</span> <span className="text-slate-400 ml-1 text-[10px] font-normal">({group.kind0.length} Math)</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {categories.map((group) => (
              <div key={group.cat.id} id={`category-${group.cat.id}`} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm bg-white transition-shadow scroll-mt-24">
                <div className="bg-slate-50 border-b border-slate-200 p-2 flex justify-between items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-semibold text-slate-600">Result:</span>
                      <input 
                        type="number"
                        value={group.cat.displayName}
                        onChange={(e) => handleUpdateCategoryDisplay(group.cat.id, parseInt(e.target.value) || 0)}
                        className="w-14 px-1.5 py-0.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-solitaire-green outline-none font-bold text-center"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-yellow-200">
                        1 Base
                      </span>
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-200">
                        {group.kind0.length} Math
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {(() => {
                      const targetResult = group.cat.displayName;
                      const hasInvalidFormulas = group.kind0.some(item => {
                        if (item.card.wordVisualType !== 0) return false;
                        if (!item.card.wordText) return true;
                        return evalFormula(item.card.wordText) !== targetResult;
                      });
                      return hasInvalidFormulas ? (
                        <button 
                          onClick={() => handleGenerateFormulas(group.cat.id, targetResult)}
                          className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 hover:bg-indigo-100 transition-all shadow-[0_0_8px_rgba(79,70,229,0.3)] animate-pulse"
                          title="Có công thức không khớp kết quả. Bấm để tạo tự động!"
                        >
                          <Wand2 className="w-3 h-3" /> Auto Fix
                        </button>
                      ) : null;
                    })()}
                    <button 
                      onClick={() => handleAddCard(group.cat.id)}
                      className="flex items-center gap-1 text-[10px] text-solitaire-green font-bold bg-green-50 px-2 py-1 rounded-md border border-green-200 hover:bg-green-100 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Math
                    </button>
                    <button 
                      onClick={() => handleRemoveCategory(group.cat.id)}
                      className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors border border-transparent hover:border-red-200"
                      title="Delete Category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-2 bg-white">
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {group.kind0.map((item, idx) => (
                      <div key={item.card.__id || idx} className="border border-slate-200 rounded p-1.5 relative group hover:border-solitaire-green transition-all bg-slate-50/50">
                        <button 
                          onClick={() => handleRemoveCard(item.index)}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        
                        <div className="flex gap-1 mb-1 justify-center">
                          <button 
                            onClick={() => handleUpdateCard(item.index, 'wordVisualType', 0)}
                            className={`p-1 rounded ${item.card.wordVisualType === 0 ? 'bg-solitaire-green text-white' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}
                            title="Text Card"
                          >
                            <Type className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => handleUpdateCard(item.index, 'wordVisualType', 1)}
                            className={`p-1 rounded ${item.card.wordVisualType === 1 ? 'bg-solitaire-green text-white' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}
                            title="Image Card"
                          >
                            <ImageIcon className="w-3 h-3" />
                          </button>
                        </div>
                        
                        {item.card.wordVisualType === 0 ? (
                          <div className="relative">
                            <input 
                              type="text" 
                              value={item.card.wordText || ''}
                              onChange={(e) => handleUpdateCard(item.index, 'wordText', e.target.value)}
                              placeholder="e.g. 1+1"
                              className={`w-full px-1 py-0.5 text-center text-sm font-bold border rounded focus:ring-1 focus:ring-solitaire-green outline-none ${(() => {
                                const val = item.card.wordText || '';
                                if (!val) return 'border-slate-300';
                                return evalFormula(val) === group.cat.displayName ? 'border-solitaire-green bg-green-50/30' : 'border-red-400 bg-red-50/30 text-red-600';
                              })()}`}
                            />
                          </div>
                        ) : (
                          <input 
                            type="text" 
                            value={item.card.wordImageKey || ''}
                            onChange={(e) => handleUpdateCard(item.index, 'wordImageKey', e.target.value)}
                            placeholder="Image URL/Key"
                            className="w-full px-1 py-0.5 text-center text-xs border border-slate-300 rounded focus:ring-1 focus:ring-solitaire-green outline-none"
                          />
                        )}
                      </div>
                    ))}
                    {group.kind0.length === 0 && (
                      <div className="col-span-full py-1 text-center text-[10px] text-slate-400 italic">
                        No Math Cards yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'deckOrder' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-blue-50 text-blue-800 p-4 rounded-lg text-sm">
            <div>
              <strong>Hướng dẫn:</strong> Thứ tự từ trên xuống dưới trong danh sách này chính là thứ tự bài sẽ được chia (từ lớp dưới cùng đến lớp trên cùng của Tableau). Bạn có thể dùng chuột kéo thẻ bài bằng icon <GripVertical className="inline w-4 h-4"/> để sắp xếp lại vị trí.
            </div>
            <button 
              onClick={handleShuffleCards}
              className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition-colors shadow-sm ml-4 shrink-0"
            >
              <Shuffle className="w-4 h-4" /> Shuffle Cards
            </button>
          </div>
          
          <div className="flex flex-col gap-2">
            {data.map((card, idx) => (
              <div 
                key={card.__id || idx}
                id={`card-row-${card.__id}`}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, idx)}
                className={`flex items-center gap-4 bg-white border ${draggedIndex === idx ? 'border-solitaire-green shadow-md z-10' : 'border-slate-200'} rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-solitaire-green transition-all relative`}
              >
                <div className="text-slate-400 cursor-grab">
                  <GripVertical className="w-5 h-5" />
                </div>
                
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                  {idx + 1}
                </div>

                <div className="flex-1 flex items-center gap-4">
                  {card.kind === 1 ? (
                    <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded border border-yellow-200">
                      Base Card
                    </span>
                  ) : (
                    <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded border border-blue-200">
                      Math Card
                    </span>
                  )}
                  
                  <span className="text-sm font-bold text-slate-700">
                    [{card.category.displayName}]
                  </span>
                </div>

                <div className="text-sm font-medium text-slate-600 truncate max-w-[200px]">
                  {card.kind === 1 ? "—" : (card.wordVisualType === 0 ? card.wordText : `[Img] ${card.wordImageKey}`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
