import { DataPoint, RegressionResult } from './types';

// Parse the tab-separated or space-separated volume string
export const parseVolumes = (latestYear: number, rawInput: string): DataPoint[] => {
  if (!rawInput) return [];
  
  // Split by tabs or multiple spaces/newlines
  const volumes = rawInput.trim().split(/[\t\s\n]+/).map(v => parseFloat(v)).filter(n => !isNaN(n));
  
  if (volumes.length === 0) return [];

  const data: DataPoint[] = [];
  
  // Input order: Newest to Oldest (as requested)
  // Example: LatestYear 2024, Vols: [5000, 4800, 4600] -> 2024:5000, 2023:4800, 2022:4600
  volumes.forEach((vol, index) => {
    const year = latestYear - index;
    data.push({ year, volume: vol });
  });

  // Sort by year ascending for calculations and charts
  data.sort((a, b) => a.year - b.year);

  // Calculate year-over-year growth rate
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1].volume;
    const curr = data[i].volume;
    data[i].growthRate = prev !== 0 ? ((curr - prev) / prev) * 100 : 0;
  }
  
  // First year has no growth rate relative to previous
  if(data.length > 0) data[0].growthRate = 0;

  return data;
};

// --- Statistics Helpers ---

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const mean = (arr: number[]) => sum(arr) / arr.length;

// R-squared calculation
const calculateRSquared = (actual: number[], predicted: number[]): number => {
  const yMean = mean(actual);
  const ssTot = sum(actual.map(y => Math.pow(y - yMean, 2)));
  const ssRes = sum(actual.map((y, i) => Math.pow(y - predicted[i], 2)));
  if (ssTot === 0) return 0;
  return 1 - (ssRes / ssTot);
};

// --- Regressions ---

export const calculateLinear = (data: DataPoint[]): RegressionResult => {
  const n = data.length;
  if (n < 2) return getEmptyResult('Lineal');

  const x = data.map(d => d.year);
  const y = data.map(d => d.volume);
  
  const sumX = sum(x);
  const sumY = sum(y);
  const sumXY = sum(x.map((xi, i) => xi * y[i]));
  const sumXX = sum(x.map(xi => xi * xi));

  const denominator = (n * sumXX - sumX * sumX);
  if (denominator === 0) return getEmptyResult('Lineal');

  const m = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - m * sumX) / n;

  const yPred = x.map(xi => m * xi + b);
  const r2 = calculateRSquared(y, yPred);

  // Growth Rate: Geometric mean of trend line endpoints
  const startY = m * x[0] + b;
  const endY = m * x[n-1] + b;
  const yearsDiff = x[n-1] - x[0];
  let growthRate = 0;
  if (yearsDiff > 0 && startY > 0 && endY > 0) {
      growthRate = (Math.pow(endY / startY, 1 / yearsDiff) - 1) * 100;
  }

  return {
    type: 'Lineal',
    formula: `y = ${m.toFixed(2)}x ${b >= 0 ? '+' : '-'} ${Math.abs(b).toFixed(2)}`,
    rSquared: r2,
    growthRate,
    points: data.map((d, i) => ({ x: d.year, y: d.volume, yPred: yPred[i] })),
    params: { a: b, b: m }
  };
};

export const calculateExponential = (data: DataPoint[]): RegressionResult => {
  // y = A * e^(Bx)  => ln(y) = ln(A) + Bx
  const n = data.length;
  if (n < 2) return getEmptyResult('Exponencial');

  const x = data.map(d => d.year);
  const y = data.map(d => d.volume);
  
  // Guard against non-positive volumes for log
  if (y.some(val => val <= 0)) {
     // Fallback or filter? For simplicity, we just won't compute if invalid data
     return getEmptyResult('Exponencial');
  }

  const ly = y.map(val => Math.log(val)); 

  const sumX = sum(x);
  const sumLY = sum(ly);
  const sumXLY = sum(x.map((xi, i) => xi * ly[i]));
  const sumXX = sum(x.map(xi => xi * xi));

  const denominator = (n * sumXX - sumX * sumX);
  if (denominator === 0) return getEmptyResult('Exponencial');

  const B = (n * sumXLY - sumX * sumLY) / denominator;
  const lnA = (sumLY - B * sumX) / n;
  const A = Math.exp(lnA);

  const yPred = x.map(xi => A * Math.exp(B * xi));
  const r2 = calculateRSquared(y, yPred);

  // Growth Rate for Exponential is constant B * 100 (approx) or (e^B - 1)*100
  const growthRate = (Math.exp(B) - 1) * 100;

  return {
    type: 'Exponencial',
    formula: `y = ${A.toExponential(4)} * e^(${B.toFixed(5)}x)`,
    rSquared: r2,
    growthRate,
    points: data.map((d, i) => ({ x: d.year, y: d.volume, yPred: yPred[i] })),
    params: { a: A, b: B }
  };
};

export const calculateLogarithmic = (data: DataPoint[]): RegressionResult => {
  // y = a + b * ln(x)
  const n = data.length;
  if (n < 2) return getEmptyResult('Logarítmica');

  // x must be > 0. Years like 2024 are fine.
  const x = data.map(d => d.year);
  const y = data.map(d => d.volume);

  const lx = x.map(val => Math.log(val));
  
  const sumLX = sum(lx);
  const sumY = sum(y);
  const sumLXY = sum(lx.map((lxi, i) => lxi * y[i]));
  const sumLXLX = sum(lx.map(lxi => lxi * lxi));

  const denominator = (n * sumLXLX - sumLX * sumLX);
  if (denominator === 0) return getEmptyResult('Logarítmica');

  const b = (n * sumLXY - sumLX * sumY) / denominator;
  const a = (sumY - b * sumLX) / n;

  const yPred = x.map(xi => a + b * Math.log(xi));
  const r2 = calculateRSquared(y, yPred);

  // Growth rate changes every year in Log model. We take average rate over range.
  // Using endpoints of trend
  const startY = a + b * Math.log(x[0]);
  const endY = a + b * Math.log(x[n-1]);
  const yearsDiff = x[n-1] - x[0];
  let growthRate = 0;
  if (yearsDiff > 0 && startY > 0 && endY > 0) {
    growthRate = (Math.pow(endY / startY, 1 / yearsDiff) - 1) * 100;
  }

  return {
    type: 'Logarítmica',
    formula: `y = ${a.toFixed(2)} + ${b.toFixed(2)} * ln(x)`,
    rSquared: r2,
    growthRate,
    points: data.map((d, i) => ({ x: d.year, y: d.volume, yPred: yPred[i] })),
    params: { a, b }
  };
};

function getEmptyResult(type: 'Lineal' | 'Exponencial' | 'Logarítmica'): RegressionResult {
    return {
        type,
        formula: 'N/A',
        rSquared: 0,
        growthRate: 0,
        points: [],
        params: { a: 0, b: 0 }
    };
}