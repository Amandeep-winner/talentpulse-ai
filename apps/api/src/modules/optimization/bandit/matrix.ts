/**
 * Pure TypeScript linear algebra operations for Contextual Bandit models (LinUCB & Ridge Regression).
 * Zero external dependencies.
 */

export function dotProduct(u: number[], v: number[]): number {
  let sum = 0;
  for (let i = 0; i < u.length; i++) {
    sum += u[i]! * v[i]!;
  }
  return sum;
}

export function vectorAdd(u: number[], v: number[]): number[] {
  const res = new Array<number>(u.length);
  for (let i = 0; i < u.length; i++) {
    res[i] = u[i]! + v[i]!;
  }
  return res;
}

export function vectorScale(u: number[], s: number): number[] {
  const res = new Array<number>(u.length);
  for (let i = 0; i < u.length; i++) {
    res[i] = u[i]! * s;
  }
  return res;
}

export function vectorNorm(u: number[]): number {
  return Math.sqrt(dotProduct(u, u));
}

export function outerProduct(u: number[], v: number[]): number[][] {
  const m = u.length;
  const n = v.length;
  const res: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(n);
    const ui = u[i]!;
    for (let j = 0; j < n; j++) {
      row[j] = ui * v[j]!;
    }
    res.push(row);
  }
  return res;
}

export function createZeroMatrix(d: number): number[][] {
  const res: number[][] = [];
  for (let i = 0; i < d; i++) {
    res.push(new Array<number>(d).fill(0));
  }
  return res;
}

export function createIdentity(d: number, lambda = 1.0): number[][] {
  const res: number[][] = [];
  for (let i = 0; i < d; i++) {
    const row = new Array<number>(d).fill(0);
    row[i] = lambda;
    res.push(row);
  }
  return res;
}

export function matrixVectorMultiply(A: number[][], x: number[]): number[] {
  const d = A.length;
  const res = new Array<number>(d);
  for (let i = 0; i < d; i++) {
    let sum = 0;
    const row = A[i]!;
    for (let j = 0; j < row.length; j++) {
      sum += row[j]! * x[j]!;
    }
    res[i] = sum;
  }
  return res;
}

export function matrixAdd(A: number[][], B: number[][]): number[][] {
  const d = A.length;
  const res: number[][] = [];
  for (let i = 0; i < d; i++) {
    const rowA = A[i]!;
    const rowB = B[i]!;
    const newRow = new Array<number>(rowA.length);
    for (let j = 0; j < rowA.length; j++) {
      newRow[j] = rowA[j]! + rowB[j]!;
    }
    res.push(newRow);
  }
  return res;
}

export function matrixScale(A: number[][], s: number): number[][] {
  const d = A.length;
  const res: number[][] = [];
  for (let i = 0; i < d; i++) {
    const row = A[i]!;
    const newRow = new Array<number>(row.length);
    for (let j = 0; j < row.length; j++) {
      newRow[j] = row[j]! * s;
    }
    res.push(newRow);
  }
  return res;
}

/**
 * Direct matrix inversion using Gauss-Jordan elimination with partial pivoting.
 * O(d^3) complexity. Used for baseline validation and drift correction.
 */
export function directMatrixInverse(A: number[][]): number[][] {
  const n = A.length;
  // Augment A with identity matrix
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(2 * n);
    for (let j = 0; j < n; j++) {
      row[j] = A[i]![j]!;
      row[j + n] = i === j ? 1 : 0;
    }
    M.push(row);
  }

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    let maxVal = Math.abs(M[i]![i]!);
    for (let k = i + 1; k < n; k++) {
      const val = Math.abs(M[k]![i]!);
      if (val > maxVal) {
        maxVal = val;
        maxRow = k;
      }
    }

    if (maxVal < 1e-12) {
      throw new Error('Matrix is singular or near-singular and cannot be inverted');
    }

    // Swap pivot row
    if (maxRow !== i) {
      const temp = M[i]!;
      M[i] = M[maxRow]!;
      M[maxRow] = temp;
    }

    // Normalize pivot row
    const pivot = M[i]![i]!;
    for (let j = 0; j < 2 * n; j++) {
      M[i]![j] = M[i]![j]! / pivot;
    }

    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k]![i]!;
      if (Math.abs(factor) > 1e-12) {
        for (let j = 0; j < 2 * n; j++) {
          M[k]![j] = M[k]![j]! - factor * M[i]![j]!;
        }
      }
    }
  }

  // Extract inverse
  const inv: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n);
    for (let j = 0; j < n; j++) {
      row[j] = M[i]![j + n]!;
    }
    inv.push(row);
  }

  return inv;
}

/**
 * Sherman-Morrison rank-1 update of matrix inverse.
 * Given A_new = A + u * u^T, computes (A + u * u^T)^(-1) in O(d^2) time:
 * A_new^(-1) = A^(-1) - (A^(-1) * u * u^T * A^(-1)) / (1 + u^T * A^(-1) * u)
 */
export function shermanMorrisonUpdate(invA: number[][], u: number[]): number[][] {
  const d = invA.length;
  // w = invA * u
  const w = matrixVectorMultiply(invA, u);
  // denom = 1 + u^T * w
  const denom = 1.0 + dotProduct(u, w);

  if (Math.abs(denom) < 1e-12) {
    // Degenerate denominator, fallback to direct inverse of updated matrix
    const outer = outerProduct(u, u);
    const directInv = directMatrixInverse(matrixAdd(directMatrixInverse(invA), outer));
    return directInv;
  }

  // res[i][j] = invA[i][j] - (w[i] * w[j]) / denom
  const res: number[][] = [];
  for (let i = 0; i < d; i++) {
    const row = new Array<number>(d);
    const wi = w[i]!;
    const invRow = invA[i]!;
    for (let j = 0; j < d; j++) {
      row[j] = invRow[j]! - (wi * w[j]!) / denom;
    }
    res.push(row);
  }

  return res;
}

/**
 * Measures the Frobenius distance between two matrices.
 * Useful for numerical drift detection between Sherman-Morrison updates and direct inversion.
 */
export function matrixFrobeniusDistance(A: number[][], B: number[][]): number {
  let sumSq = 0;
  const d = A.length;
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const diff = A[i]![j]! - B[i]![j]!;
      sumSq += diff * diff;
    }
  }
  return Math.sqrt(sumSq);
}
