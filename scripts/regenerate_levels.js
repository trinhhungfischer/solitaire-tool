import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.join(__dirname, '../public/level');
const outputDir = path.join(__dirname, '../private/new_level');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const isComposite = (n) => {
  if (n <= 3) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) return true;
  }
  return false;
};

const generateNewFormula = (card, targetResult) => {
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
  return `${a}${op}${b}`;
};

for (let i = 4; i <= 500; i++) {
  const fileName = `Level_${i}.json`;
  const inputPath = path.join(inputDir, fileName);
  
  if (!fs.existsSync(inputPath)) {
    console.log(`Skipping Level ${i} - not found`);
    continue;
  }

  try {
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const levelData = JSON.parse(rawData);

    if (levelData && levelData.data) {
      // Find all unique categories
      const uniqueCatIds = Array.from(new Set(levelData.data.map(c => c.category.id)));

      // Keep track of used results in this level to prevent duplicates
      const usedResults = new Set();

      uniqueCatIds.forEach(catId => {
        const sampleCard = levelData.data.find(c => c.category.id === catId);
        if (!sampleCard) return;
        const oldResult = sampleCard.category.displayName;

        const hasMultiplication = levelData.data.some(c => c.category.id === catId && c.kind === 0 && c.wordVisualType === 0 && c.wordText && String(c.wordText).match(/[*Xx]/));

        let newResult = oldResult;
        const min = Math.max(1, Math.floor(oldResult * 0.7));
        const max = Math.ceil(oldResult * 1.3) + 5; // give slightly larger range to ensure we can find unique values

        let attempts = 0;
        let isUnique = false;
        let isComp = false;

        do {
          newResult = Math.floor(Math.random() * (max - min + 1)) + min;
          isComp = !hasMultiplication || isComposite(newResult);
          isUnique = !usedResults.has(newResult);
          attempts++;
          
          if (attempts > 50) {
            // Fallback: just find any unused number by scanning upwards
            while (usedResults.has(newResult) || (hasMultiplication && !isComposite(newResult))) {
              newResult++;
            }
            break;
          }
        } while (!isComp || !isUnique);

        usedResults.add(newResult);

        levelData.data.forEach((card, idx) => {
          if (card.category.id === catId) {
            levelData.data[idx].category.displayName = newResult;

            if (card.kind === 0 && card.wordVisualType === 0) {
              levelData.data[idx].wordText = generateNewFormula(levelData.data[idx], newResult);
            }
          }
        });
      });

      const outputPath = path.join(outputDir, fileName);
      fs.writeFileSync(outputPath, JSON.stringify(levelData, null, 2), 'utf8');
      // console.log(`Processed Level ${i}`);
    } else {
      console.log(`Skipping Level ${i} - invalid data structure`);
    }
  } catch (err) {
    console.error(`Error processing Level ${i}:`, err);
  }
}
console.log("Done generating all levels from 4 to 500.");
