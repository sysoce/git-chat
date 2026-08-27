export function renderQrToTerminal(matrix: boolean[][]): string {
  const size = matrix.length;
  const border = 2;
  const fullSize = size + border * 2;
  const grid: boolean[][] = Array.from({ length: fullSize }, () => Array(fullSize).fill(false));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      grid[r + border]![c + border] = matrix[r]![c] ?? false;
    }
  }

  const lines: string[] = [];
  for (let r = 0; r < fullSize; r += 2) {
    let line = '';
    for (let c = 0; c < fullSize; c++) {
      const top = grid[r]![c];
      const bottom = r + 1 < fullSize ? grid[r + 1]![c] : false;
      if (top && bottom) {
        line += '█';
      } else if (top && !bottom) {
        line += '▀';
      } else if (!top && bottom) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

export function renderQrToSvg(matrix: boolean[][], cellSize = 10, margin = 20): string {
  const size = matrix.length;
  const totalSize = size * cellSize + margin * 2;
  const rects: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r]![c]) {
        const x = margin + c * cellSize;
        const y = margin + r * cellSize;
        rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#000000"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}"><rect width="100%" height="100%" fill="#ffffff"/>${rects.join('')}</svg>`;
}
