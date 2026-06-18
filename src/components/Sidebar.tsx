import React from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';

interface SidebarProps {
  onAddCard: () => void;
  onClearBoard: () => void;
  onExport: () => void;
  cardCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ onAddCard, onClearBoard, onExport, cardCount }) => {
  return (
    <div className="sidebar">
      <div className="panel-header">
        <span>Toolbox</span>
      </div>
      <div className="panel-content flex-col gap-4">
        <button className="btn btn-primary w-full justify-center mb-4" onClick={onAddCard}>
          <Plus size={18} />
          Add Random Card
        </button>

        <div className="flex-col gap-2 mb-4">
          <span className="label">Statistics</span>
          <div className="flex justify-between items-center text-sm text-muted">
            <span>Total Cards:</span>
            <span className="font-bold text-main">{cardCount}</span>
          </div>
        </div>

        <button className="btn w-full justify-center text-red-400 border-red-900 hover:bg-red-900/30 mb-4" onClick={onClearBoard}>
          <Trash2 size={18} />
          Clear Board
        </button>

        <div className="flex-1"></div>

        <button className="btn btn-primary w-full justify-center" onClick={onExport}>
          <Save size={18} />
          Export JSON
        </button>
      </div>
    </div>
  );
};
