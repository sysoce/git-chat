export function renderQrToTerminal(matrix: boolean[][]): string {
  const border = 2;
  const size = matrix.length;
  const lines: string[] = [];
  const topBottom = '█'.repeat((size + border * 2) * 2);

  for (let b = 0; b < border; b++) lines.push(topBottom);

  for (let r = 0; r < size; r++) {
    let line = '██'.repeat(border);
    for (let c = 0; c < size; c++) {
      line += matrix[r]![c] ? '  ' : '██';
    }
    line += '██'.repeat(border);
    lines.push(line);
  }

  for (let b = 0; b < border; b++) lines.push(topBottom);

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
