import { useState, useEffect, useRef } from 'react';
import { Download, Plus, Trash2, LayoutGrid, Upload } from 'lucide-react';

import CardBuilder from './components/CardBuilder';
import type { CardData } from './components/CardBuilder';
import BoardPreview from './components/BoardPreview';

interface LevelConfig {
  levelId: number;
  foundationCount: number;
  columnCards: number[];
  maxMoves: number;
  forceUppercase?: number;
  generateNewSeedOnShuffle?: number;
  shuffleSeed?: number;
  data: CardData[];
}

function App() {
  const [selectedLevelId, setSelectedLevelId] = useState<number>(1);
  const [gameRule, setGameRule] = useState<'classic' | 'new'>('new');
  const [levelData, setLevelData] = useState<LevelConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(500);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content) as LevelConfig;
        
        // Basic validation
        if (parsedData && typeof parsedData.levelId === 'number' && Array.isArray(parsedData.data)) {
          setLevelData(parsedData);
          setSelectedLevelId(parsedData.levelId);
        } else {
          setError('Invalid JSON format. Missing required fields.');
        }
      } catch (err: any) {
        setError(`Failed to parse JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
    
    // Reset input so the same file can be imported again if needed
    if (event.target) {
      event.target.value = '';
    }
  };
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = document.body.clientWidth - e.clientX;
      if (newWidth > 350 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Generate a list of level IDs (1 to 500)
  const levelIds = Array.from({ length: 500 }, (_, i) => i + 1);

  useEffect(() => {
    setIsAutoPlaying(false);
    loadLevel(selectedLevelId);
  }, [selectedLevelId]);

  const loadLevel = async (id: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/level/Level_${id}.json?t=${new Date().getTime()}`);
      if (!response.ok) {
        throw new Error(`Failed to load Level ${id}. File might not exist.`);
      }
      const data: LevelConfig = await response.json();
      setLevelData(data);
    } catch (err: any) {
      setError(err.message);
      setLevelData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!levelData) return;
    
    // Create a Blob from the JSON string
    const jsonString = JSON.stringify(levelData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Level_${levelData.levelId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden text-slate-800">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-solitaire-green flex items-center gap-2">
            <LayoutGrid className="w-6 h-6" />
            Level Editor
          </h1>
          
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-sm font-medium text-slate-600">Select Level:</span>
            <select 
              value={selectedLevelId}
              onChange={(e) => setSelectedLevelId(parseInt(e.target.value))}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
            >
              {levelIds.map(id => (
                <option key={id} value={id}>Level {id}</option>
              ))}
            </select>
          </div>
          
          {levelData && (
            <div className="flex gap-4 text-sm text-slate-500 ml-4 border-l pl-4 border-slate-300">
              <span>Cards: <strong className="text-slate-700">{levelData.data.length}</strong></span>
              <span>Foundations: <strong className="text-slate-700">{levelData.foundationCount}</strong></span>
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setGameRule(prev => prev === 'classic' ? 'new' : 'classic')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border ${gameRule === 'new' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
          >
            Rule: {gameRule === 'new' ? 'Default (New)' : 'Classic'}
          </button>
          
          <input 
            type="file" 
            accept=".json" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImport} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import JSON
          </button>
          
          <button 
            onClick={handleDownload}
            disabled={!levelData}
            className="flex items-center gap-2 bg-solitaire-green hover:bg-solitaire-dark text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download JSON
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Board Preview Area */}
        <div className="flex-1 relative bg-[#1A4E2B] flex flex-col">
          {isLoading && <div className="absolute inset-0 flex items-center justify-center text-white font-medium bg-black/20 z-20">Loading Level {selectedLevelId}...</div>}
          {error && <div className="absolute inset-0 flex items-center justify-center z-20"><div className="bg-red-50 text-red-600 p-4 rounded-lg shadow-lg font-medium">{error}</div></div>}
          
          {!isLoading && !error && levelData && (
            <BoardPreview 
              foundationCount={levelData.foundationCount} 
              columnCards={levelData.columnCards || []} 
              data={levelData.data || []} 
              shuffleSeed={levelData.shuffleSeed}
              maxMoves={levelData.maxMoves}
              gameRule={gameRule}
              isAutoPlaying={isAutoPlaying}
              onStopAutoPlay={() => setIsAutoPlaying(false)}
            />
          )}
        </div>

        {/* Right: Config Sidebar */}
        <div 
          className="shrink-0 bg-slate-50 border-l border-slate-200 overflow-y-auto flex flex-col shadow-xl z-10 relative"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* Drag Handle */}
          <div 
            className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-solitaire-green/50 cursor-col-resize z-50 group transition-colors"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute top-1/2 -left-2 w-4 h-8 -mt-4 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="w-1 h-6 bg-solitaire-green rounded-full shadow-md"></div>
            </div>
          </div>

          {!isLoading && !error && levelData && (
            <div className="p-4 space-y-4">
              
              {/* Global Settings */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-3 border-b pb-2">
                  <h3 className="text-lg font-semibold">Global Settings</h3>
                  <button 
                    onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm ${isAutoPlaying ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 'bg-solitaire-green text-white hover:bg-solitaire-dark border border-transparent'}`}
                  >
                    {isAutoPlaying ? 'Stop Auto Play' : 'Start Auto Play'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Level ID</label>
                    <input 
                      type="number" 
                      value={levelData.levelId}
                      onChange={(e) => setLevelData({...levelData, levelId: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solitaire-green focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Max Moves</label>
                    <input 
                      type="number" 
                      value={levelData.maxMoves}
                      onChange={(e) => setLevelData({...levelData, maxMoves: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solitaire-green focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Foundation Count</label>
                    <select 
                      value={levelData.foundationCount}
                      onChange={(e) => setLevelData({...levelData, foundationCount: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solitaire-green focus:border-transparent text-sm"
                    >
                      <option value={3}>3 Slots</option>
                      <option value={4}>4 Slots</option>
                      <option value={5}>5 Slots</option>
                    </select>
                  </div>

                </div>
              </div>

              {/* Board Layout Builder */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-3 border-b pb-2">
                  <h3 className="text-lg font-semibold">Board Layout</h3>
                  <button 
                    onClick={() => {
                      const newCols = [...(levelData.columnCards || [])];
                      newCols.push(4); // Default new column has 4 cards
                      setLevelData({...levelData, columnCards: newCols});
                    }}
                    className="flex items-center gap-1 text-sm text-solitaire-green font-medium hover:text-solitaire-dark"
                  >
                    <Plus className="w-4 h-4" /> Add Col
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  {(levelData.columnCards || []).map((colCards, index) => (
                    <div key={index} className="flex flex-col items-center bg-slate-50 border border-slate-200 p-2 rounded-lg">
                      <div className="flex justify-between w-full items-center mb-2 px-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Col {index + 1}</span>
                        <button 
                          onClick={() => {
                            const newCols = [...levelData.columnCards];
                            newCols.splice(index, 1);
                            setLevelData({...levelData, columnCards: newCols});
                          }}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Remove Column"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <input 
                        type="number" 
                        value={colCards}
                        onChange={(e) => {
                          const newCols = [...levelData.columnCards];
                          newCols[index] = parseInt(e.target.value) || 0;
                          setLevelData({...levelData, columnCards: newCols});
                        }}
                        className="w-full text-center px-2 py-1 border border-slate-300 rounded-md font-bold text-lg focus:outline-none focus:ring-2 focus:ring-solitaire-green"
                      />
                    </div>
                  ))}
                </div>
                
                {/* Layout Validation */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Cards on Board:</span>
                    <strong className="text-slate-800">{(levelData.columnCards || []).reduce((a, b) => a + b, 0)}</strong>
                  </div>
                  
                  {((levelData.columnCards || []).reduce((a, b) => a + b, 0) > levelData.data.length) && (
                    <div className="text-xs text-red-600 font-medium bg-red-50 px-3 py-2 rounded-lg border border-red-100 flex items-center">
                      ⚠️ Not enough cards for this layout!
                    </div>
                  )}
                </div>
              </div>

              {/* Card Builder */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4">
                  <CardBuilder 
                    levelId={levelData.levelId} 
                    data={levelData.data} 
                    onChange={(newData) => setLevelData({...levelData, data: newData})} 
                  />
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
