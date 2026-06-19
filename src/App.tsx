import { useState, useEffect, useRef } from 'react';
import { Settings2, Plus, Trash2, Upload, Rewind, Play, Pause, FastForward, Zap, Download, LayoutGrid, Undo2 } from 'lucide-react';

import CardBuilder from './components/CardBuilder';
import type { CardData } from './components/CardBuilder';
import BoardPreview from './components/BoardPreview';

// In-memory cache to speed up level loading
const levelCache = new Map<number, any>();

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
  const [selectedLevelId, setSelectedLevelId] = useState<number>(() => {
    const saved = localStorage.getItem('SelectedLevelId');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [gameRule, setGameRule] = useState<'classic' | 'new'>('new');
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [levelData, setLevelData] = useState<LevelConfig | null>(null);
  const [editorHistory, setEditorHistory] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(500);
  const [autoPlayStrategy, setAutoPlayStrategy] = useState<'priority' | 'tree'>('priority');
  const [instantTrigger, setInstantTrigger] = useState(0);
  
  // Game Log Preserved State
  const [showLog, setShowLog] = useState(false);
  const [logHeight, setLogHeight] = useState(300);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(typeof window !== 'undefined' ? window.innerWidth / 3 : 400);

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
      const maxWidth = document.body.clientWidth * 0.8;
      if (newWidth > 300 && newWidth < maxWidth) {
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
    localStorage.setItem('SelectedLevelId', selectedLevelId.toString());
    setIsAutoPlaying(false);
    setEditorHistory([]); // clear history on level switch
    loadLevel(selectedLevelId);
  }, [selectedLevelId]);

  // Sync draft to localStorage whenever levelData changes
  useEffect(() => {
    if (levelData) {
      localStorage.setItem(`Draft_Level_${levelData.levelId}`, JSON.stringify(levelData));
    }
  }, [levelData]);

  const updateLevelDataWithHistory = (newData: LevelConfig) => {
    if (levelData) {
      setEditorHistory(prev => [...prev, JSON.stringify(levelData)]);
    }
    setLevelData(newData);
  };

  const handleUndo = () => {
    if (editorHistory.length > 0) {
      const prevStr = editorHistory[editorHistory.length - 1];
      const newHistory = editorHistory.slice(0, -1);
      setEditorHistory(newHistory);
      setLevelData(JSON.parse(prevStr));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditorMode && e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorMode, editorHistory]);

  const loadLevel = async (id: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const draft = localStorage.getItem(`Draft_Level_${id}`);
      if (draft) {
        setLevelData(JSON.parse(draft));
        setIsLoading(false);
        return;
      }

      if (levelCache.has(id)) {
        setLevelData(levelCache.get(id));
        setIsLoading(false);
        return;
      }

      // Allow browser to cache the file natively (removed ?t= cache buster)
      const response = await fetch(`/level/Level_${id}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load Level ${id}. File might not exist.`);
      }
      const data: LevelConfig = await response.json();
      levelCache.set(id, data);
      setLevelData(data);
    } catch (err: any) {
      setError(err.message);
      setLevelData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!levelData) return;
    
    // Deep clone the data to avoid mutating the React state
    const exportData = JSON.parse(JSON.stringify(levelData));
    
    // Recursively remove __id fields from the exported data
    const stripInternalIds = (obj: any) => {
      if (Array.isArray(obj)) {
        obj.forEach(stripInternalIds);
      } else if (obj !== null && typeof obj === 'object') {
        if ('__id' in obj) {
          delete obj.__id;
        }
        Object.values(obj).forEach(stripInternalIds);
      }
    };
    
    stripInternalIds(exportData);
    
    // Create a JSON string without the internal __id fields
    const jsonString = JSON.stringify(exportData, null, 2);
    
    try {
      if ('showSaveFilePicker' in window) {
        // Use File System Access API if available
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `Level_${levelData.levelId}.json`,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
      } else {
        // Fallback for browsers that don't support it
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Level_${levelData.levelId}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error saving file:', err);
        alert('Failed to save file. Please check console for details.');
      }
    }
  };

  const handleResetDraft = () => {
    if (confirm('Are you sure you want to discard ALL unsaved changes for ALL levels and reload from original files?')) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('Draft_Level_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      levelCache.clear();
      setEditorHistory([]);
      loadLevel(selectedLevelId);
    }
  };

  const handleSwapCards = (sourceId: string, destId: string) => {
    if (!levelData) return;
    const newData = [...levelData.data];
    const sourceIndex = newData.findIndex(c => c.__id === sourceId);
    const destIndex = newData.findIndex(c => c.__id === destId);
    if (sourceIndex >= 0 && destIndex >= 0 && sourceIndex !== destIndex) {
      const temp = newData[sourceIndex];
      newData[sourceIndex] = newData[destIndex];
      newData[destIndex] = temp;
      updateLevelDataWithHistory({ ...levelData, data: newData });
    }
  };

  const handleCardClick = (cardId: string) => {
    setSelectedCardId(cardId);
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
            onClick={() => setIsEditorMode(!isEditorMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border ${isEditorMode ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
            title="Kích hoạt chế độ thiết kế màn chơi"
          >
            Editor Mode: {isEditorMode ? 'ON' : 'OFF'}
          </button>
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
          <div className="flex gap-2">
            {isEditorMode && editorHistory.length > 0 && (
              <button
                onClick={handleUndo}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-2 transition-colors font-medium border border-slate-200"
                title="Undo previous action (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
                Undo
              </button>
            )}
            <button
              onClick={handleResetDraft}
              className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg flex items-center gap-2 transition-colors font-medium border border-red-200"
              title="Khôi phục lại file gốc toàn bộ màn chơi (xóa nháp)"
            >
              <Trash2 className="w-4 h-4" />
              Reset All
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg flex items-center gap-2 transition-colors font-medium border border-indigo-200"
              title="Import JSON"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button 
              onClick={handleDownload}
              disabled={!levelData}
              className="px-4 py-2 bg-solitaire-green hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>
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
              autoPlayStrategy={autoPlayStrategy}
              autoPlaySpeed={autoPlaySpeed}
              instantTrigger={instantTrigger}
              onStopAutoPlay={() => setIsAutoPlaying(false)}
              showLog={showLog}
              setShowLog={setShowLog}
              logHeight={logHeight}
              setLogHeight={setLogHeight}
              isEditorMode={isEditorMode}
              onSwapCards={handleSwapCards}
              onCardClick={handleCardClick}
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
                    {/* Level Configuration */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> Level Settings
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Level ID</label>
                    <input 
                      type="number" 
                      value={levelData.levelId}
                      onChange={(e) => setLevelData({...levelData, levelId: parseInt(e.target.value)})}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solitaire-green focus:border-transparent text-sm bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Max Moves</label>
                    <input 
                      type="number" 
                      value={levelData.maxMoves}
                      onChange={(e) => setLevelData({...levelData, maxMoves: parseInt(e.target.value)})}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solitaire-green focus:border-transparent text-sm bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Foundations</label>
                    <select 
                      value={levelData.foundationCount}
                      onChange={(e) => setLevelData({...levelData, foundationCount: parseInt(e.target.value)})}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solitaire-green focus:border-transparent text-sm bg-slate-50"
                    >
                      <option value={3}>3 Slots</option>
                      <option value={4}>4 Slots</option>
                      <option value={5}>5 Slots</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Auto Play Controls */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Play className="w-4 h-4" /> Auto Play
                  </h3>
                  <select 
                    value={autoPlayStrategy}
                    onChange={(e) => setAutoPlayStrategy(e.target.value as 'priority' | 'tree')}
                    className="p-1 rounded bg-slate-100 border text-sm"
                  >
                    <option value="priority">C# Priority</option>
                    <option value="tree">Tree Search</option>
                  </select>
                </div>
                
                <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <button 
                    onClick={() => setAutoPlaySpeed(s => Math.min(s + 200, 1000))} 
                    title="Chậm lại (Tăng Delay)" 
                    className="p-2 hover:bg-white rounded-md text-slate-500 hover:text-slate-700 transition-colors shadow-sm border border-transparent hover:border-slate-200"
                  >
                    <Rewind className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                    className={`px-4 py-2 flex items-center justify-center gap-2 rounded-md text-sm font-bold transition-all shadow-md min-w-[130px] ${isAutoPlaying ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-solitaire-green text-white hover:bg-solitaire-dark'}`}
                  >
                    {isAutoPlaying ? <><Pause className="w-4 h-4 fill-current" /> Pause</> : <><Play className="w-4 h-4 fill-current" /> Start</>}
                  </button>
                  <button 
                    onClick={() => setAutoPlaySpeed(s => Math.max(s - 200, 50))} 
                    title="Nhanh hơn (Giảm Delay)" 
                    className="p-2 hover:bg-white rounded-md text-slate-500 hover:text-slate-700 transition-colors shadow-sm border border-transparent hover:border-slate-200"
                  >
                    <FastForward className="w-4 h-4" />
                  </button>
                  <div className="w-px h-6 bg-slate-200 mx-1"></div>
                  <button 
                    onClick={() => setInstantTrigger(t => t + 1)} 
                    title="Instant Complete (Hoàn thành ngay)" 
                    className="p-2 hover:bg-yellow-400 bg-yellow-100 rounded-md text-yellow-700 transition-colors shadow-sm border border-yellow-200"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                  </button>
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
                      updateLevelDataWithHistory({...levelData, columnCards: newCols});
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
                            updateLevelDataWithHistory({...levelData, columnCards: newCols});
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
                          updateLevelDataWithHistory({...levelData, columnCards: newCols});
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
                    onChange={(newData) => updateLevelDataWithHistory({...levelData, data: newData})} 
                    selectedCardId={selectedCardId}
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
