import { useMemo } from 'react';
import { Plus, Trash2, Image as ImageIcon, Type } from 'lucide-react';

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
}

interface CardBuilderProps {
  levelId: number;
  data: CardData[];
  onChange: (newData: CardData[]) => void;
}

// Helper to group cards by category ID
const groupByCategory = (data: CardData[]) => {
  const groups: Record<number, { cat: Category; kind0: CardData[]; kind1: CardData | null }> = {};
  data.forEach(card => {
    const id = card.category.id;
    if (!groups[id]) {
      groups[id] = { cat: { ...card.category }, kind0: [], kind1: null };
    }
    if (card.kind === 1) {
      groups[id].kind1 = card;
    } else {
      groups[id].kind0.push(card);
    }
  });
  return Object.values(groups).sort((a, b) => a.cat.id - b.cat.id);
};

export default function CardBuilder({ levelId, data, onChange }: CardBuilderProps) {
  const categories = useMemo(() => groupByCategory(data), [data]);

  const updateData = (newCategories: typeof categories) => {
    // Re-flatten into a single array, updating elementCount for each
    const newData: CardData[] = [];
    newCategories.forEach(group => {
      const elementCount = group.kind0.length;
      const updatedCat = { ...group.cat, elementCount };
      
      // Push Kind 1
      if (group.kind1) {
        newData.push({ ...group.kind1, category: updatedCat });
      } else {
        // Fallback if missing kind 1 for some reason
        newData.push({
          kind: 1,
          wordVisualType: 0,
          category: updatedCat
        });
      }

      // Push all Kind 0
      group.kind0.forEach(c => {
        newData.push({ ...c, category: updatedCat });
      });
    });

    onChange(newData);
  };

  const handleAddCategory = () => {
    const totalCards = data.length;
    const newId = (levelId * 100) + totalCards;
    
    const newCat: Category = {
      id: newId,
      elementCount: 0,
      displayName: 10, // Default display name
      hasImage: 0
    };

    const newCategories = [...categories, {
      cat: newCat,
      kind1: { kind: 1, wordVisualType: 0, category: newCat },
      kind0: []
    }];
    updateData(newCategories);
  };

  const handleRemoveCategory = (catId: number) => {
    const newCategories = categories.filter(g => g.cat.id !== catId);
    // Note: Re-calculating IDs for all subsequent categories is required by the formula
    // ID = (Level ID * 100) + total preceding cards
    let cumulativeCards = 0;
    newCategories.forEach(g => {
      g.cat.id = (levelId * 100) + cumulativeCards;
      cumulativeCards += 1 + g.kind0.length; // 1 for kind1
    });
    updateData(newCategories);
  };

  const handleAddCard = (catId: number) => {
    const newCategories = categories.map(g => {
      if (g.cat.id === catId) {
        return {
          ...g,
          kind0: [...g.kind0, { kind: 0, wordVisualType: 0, category: g.cat, wordText: "1+1" }]
        };
      }
      return g;
    });
    
    // Recalculate IDs
    let cumulativeCards = 0;
    newCategories.forEach(g => {
      g.cat.id = (levelId * 100) + cumulativeCards;
      cumulativeCards += 1 + g.kind0.length;
    });
    updateData(newCategories);
  };

  const handleRemoveCard = (catId: number, cardIndex: number) => {
    const newCategories = categories.map(g => {
      if (g.cat.id === catId) {
        const newKind0 = [...g.kind0];
        newKind0.splice(cardIndex, 1);
        return { ...g, kind0: newKind0 };
      }
      return g;
    });
    
    // Recalculate IDs
    let cumulativeCards = 0;
    newCategories.forEach(g => {
      g.cat.id = (levelId * 100) + cumulativeCards;
      cumulativeCards += 1 + g.kind0.length;
    });
    updateData(newCategories);
  };

  const handleUpdateCategoryDisplay = (catId: number, val: number) => {
    const newCategories = categories.map(g => {
      if (g.cat.id === catId) return { ...g, cat: { ...g.cat, displayName: val } };
      return g;
    });
    updateData(newCategories);
  };

  const handleUpdateCard = (catId: number, cardIndex: number, field: 'wordText' | 'wordImageKey' | 'wordVisualType', val: any) => {
    const newCategories = categories.map(g => {
      if (g.cat.id === catId) {
        const newKind0 = [...g.kind0];
        newKind0[cardIndex] = { ...newKind0[cardIndex], [field]: val };
        return { ...g, kind0: newKind0 };
      }
      return g;
    });
    updateData(newCategories);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
        <h3 className="text-lg font-semibold">Categories ({categories.length})</h3>
        <button 
          onClick={handleAddCategory}
          className="flex items-center gap-2 bg-solitaire-green text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-solitaire-dark transition-colors"
        >
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {categories.map((group) => (
          <div key={group.cat.id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1">ID: {group.cat.id}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Result (Display Name):</span>
                    <input 
                      type="number"
                      value={group.cat.displayName}
                      onChange={(e) => handleUpdateCategoryDisplay(group.cat.id, parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-solitaire-green outline-none"
                    />
                  </div>
                </div>
                <div className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded border border-yellow-200 ml-4">
                  1 Base Card (Kind 1)
                </div>
                <div className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded border border-blue-200">
                  {group.kind0.length} Math Cards (elementCount)
                </div>
              </div>
              <button 
                onClick={() => handleRemoveCategory(group.cat.id)}
                className="text-red-500 hover:bg-red-50 p-2 rounded transition-colors"
                title="Delete Category"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-slate-600">Math Cards (Kind 0)</h4>
                <button 
                  onClick={() => handleAddCard(group.cat.id)}
                  className="flex items-center gap-1 text-xs text-solitaire-green font-medium hover:text-solitaire-dark"
                >
                  <Plus className="w-3 h-3" /> Add Card
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.kind0.map((card, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-3 relative group hover:border-solitaire-green transition-colors">
                    <button 
                      onClick={() => handleRemoveCard(group.cat.id, idx)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    
                    <div className="flex gap-2 mb-2">
                      <button 
                        onClick={() => handleUpdateCard(group.cat.id, idx, 'wordVisualType', 0)}
                        className={`p-1.5 rounded ${card.wordVisualType === 0 ? 'bg-solitaire-green text-white' : 'bg-slate-100 text-slate-400'}`}
                        title="Text Card"
                      >
                        <Type className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => handleUpdateCard(group.cat.id, idx, 'wordVisualType', 1)}
                        className={`p-1.5 rounded ${card.wordVisualType === 1 ? 'bg-solitaire-green text-white' : 'bg-slate-100 text-slate-400'}`}
                        title="Image Card"
                      >
                        <ImageIcon className="w-3 h-3" />
                      </button>
                    </div>

                    {card.wordVisualType === 0 ? (
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Equation Text</label>
                        <input 
                          type="text" 
                          value={card.wordText || ''}
                          onChange={(e) => handleUpdateCard(group.cat.id, idx, 'wordText', e.target.value)}
                          className="w-full mt-1 border-b border-slate-300 focus:border-solitaire-green outline-none font-medium pb-1"
                          placeholder="e.g. 4+4"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Image Key</label>
                        <input 
                          type="text" 
                          value={card.wordImageKey || ''}
                          onChange={(e) => handleUpdateCard(group.cat.id, idx, 'wordImageKey', e.target.value)}
                          className="w-full mt-1 border-b border-slate-300 focus:border-solitaire-green outline-none font-medium pb-1"
                          placeholder="e.g. 102110-8"
                        />
                      </div>
                    )}
                  </div>
                ))}
                
                {group.kind0.length === 0 && (
                  <div className="col-span-full text-center py-4 text-xs text-slate-400 italic">
                    No math cards in this category yet. Add one!
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {categories.length === 0 && (
          <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <p className="text-slate-500">No categories found in this level.</p>
            <button 
              onClick={handleAddCategory}
              className="mt-4 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50"
            >
              Create the first category
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
