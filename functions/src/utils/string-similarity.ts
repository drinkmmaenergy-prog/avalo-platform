/**
 * String similarity utilities for PACK 379
 */

/**
 * Calculate Levenshtein distance between two strings
 * (minimum number of single-character edits required to change one string into the other)
 */
export function levenshtein(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a 2D array for dynamic programming
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));
  
  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity ratio between two strings (0 to 1)
 */
export function similarityRatio(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshtein(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Find similar strings in an array
 */
export function findSimilarStrings(
  target: string,
  candidates: string[],
  threshold: number = 0.8
): Array<{ text: string; similarity: number }> {
  return candidates
    .map(text => ({
      text,
      similarity: similarityRatio(target.toLowerCase(), text.toLowerCase())
    }))
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}
