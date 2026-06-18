export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface CardData {
  id: string; // Unique UUID
  suit: Suit;
  rank: Rank;
  x: number; // Position X on the grid
  y: number; // Position Y on the grid
  faceUp: boolean; // Is the card face up?
  layer: number; // Z-index or layer for overlapping cards
}

export interface LevelConfig {
  name: string;
  targetScore: number;
  timeLimit: number; // in seconds
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface LevelData {
  config: LevelConfig;
  cards: CardData[];
}
