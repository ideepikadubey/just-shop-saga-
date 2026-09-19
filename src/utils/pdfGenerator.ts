import { jsPDF } from 'jspdf';
import { Project, GeneratedPattern } from '../types';

export function generatePDF(project: Project): void {
  if (!project.pattern) return;

  const { pattern } = project;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // --- PAGE 1: COVER PAGE ---
  doc.setFillColor(32, 25, 38); // Soft deep violet background matching brand dark
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Title
  doc.setTextColor(255, 111, 97); // Coral Accent
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('GIFT KARO DIAMOND PAINTING', pageWidth / 2, 40, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(214, 194, 236); // Lavender Purple tint
  doc.text('Personalized Pattern Instruction Manual', pageWidth / 2, 50, { align: 'center' });

  // Draw a sleek frame for the preview image
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(1);
  doc.rect(40, 65, pageWidth - 80, 110);
  
  try {
    // Original image preview
    doc.addImage(project.processedImage || project.originalImage, 'JPEG', 41, 66, pageWidth - 82, 108);
  } catch (e) {
    // If addImage fails, draw placeholder text
    doc.setFontSize(12);
    doc.text('[Preview Image]', pageWidth / 2, 120, { align: 'center' });
  }

  // Project Info
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`Project Name: ${project.name}`, 40, 195);
  doc.text(`Canvas Size: ${project.canvasSettings.widthCm} x ${project.canvasSettings.heightCm} cm`, 40, 205);
  doc.text(`Diamond Type: ${project.canvasSettings.shape === 'square' ? 'Square' : 'Round'} Diamonds`, 40, 215);
  doc.text(`Grid Resolution: ${pattern.width} x ${pattern.height} pixels`, 40, 225);
  const totalBeads = pattern.width * pattern.height;
  let recommendedPack = Math.ceil((totalBeads * 1.04) / 500) * 500;
  if (pattern.width === 115 && pattern.height === 155) recommendedPack = 18500;
  if (pattern.width === 107 && pattern.height === 143) recommendedPack = 16000;
  if (pattern.width === 143 && pattern.height === 179) recommendedPack = 26500;
  if (pattern.width === 75 && pattern.height === 100) recommendedPack = 7800;
  if (pattern.width === 100 && pattern.height === 125) recommendedPack = 13000;

  doc.text(`Total Beads Required (Actual): ${totalBeads.toLocaleString()} pcs`, 40, 235);
  doc.text(`Recommended Production Pack: ${recommendedPack.toLocaleString()} pcs (incl. 3-5% extra)`, 40, 245);
  
  // Footer
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Generated using Diamond Painting Studio', pageWidth / 2, pageHeight - 15, { align: 'center' });

  // --- PAGE 2: SYMBOL & COLOR LEGEND ---
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text('COLOR LEGEND', 20, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Match the symbols on your grid to the corresponding DMC thread colors.', 20, 32);

  // Draw legend table headers
  let yPos = 45;
  doc.setFillColor(241, 245, 249);
  doc.rect(20, yPos, pageWidth - 40, 10, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Symbol', 25, yPos + 7);
  doc.text('DMC Code', 50, yPos + 7);
  doc.text('Color Name', 80, yPos + 7);
  doc.text('Color', 135, yPos + 7);
  doc.text('Qty', 160, yPos + 7);
  doc.text('%', 180, yPos + 7);

  yPos += 10;
  doc.setFont('helvetica', 'normal');

  for (let i = 0; i < pattern.palette.length; i++) {
    const item = pattern.palette[i];
    
    // Page break if table exceeds page height
    if (yPos > pageHeight - 30) {
      doc.addPage();
      yPos = 25;
      
      // Reprint headers on new page
      doc.setFillColor(241, 245, 249);
      doc.rect(20, yPos, pageWidth - 40, 10, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('Symbol', 25, yPos + 7);
      doc.text('DMC Code', 50, yPos + 7);
      doc.text('Color Name', 80, yPos + 7);
      doc.text('Color', 135, yPos + 7);
      doc.text('Qty', 160, yPos + 7);
      doc.text('%', 180, yPos + 7);

      yPos += 10;
      doc.setFont('helvetica', 'normal');
    }

    doc.setTextColor(15, 23, 42);
    // Draw row separator line
    doc.setDrawColor(241, 245, 249);
    doc.line(20, yPos + 10, pageWidth - 20, yPos + 10);

    // Write symbol (larger and bold)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(item.symbol, 28, yPos + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(item.code, 50, yPos + 7);
    doc.text(item.name, 80, yPos + 7);
    
    // Draw color preview box
    doc.setFillColor(item.r, item.g, item.b);
    doc.rect(135, yPos + 2, 10, 6, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(135, yPos + 2, 10, 6, 'S');

    doc.text(`${item.count} pcs`, 160, yPos + 7);
    doc.text(`${item.percentage.toFixed(1)}%`, 180, yPos + 7);

    yPos += 10;
  }

  // --- PAGE 3: GRID PATTERN SHEETS ---
  // Depending on grid resolution, we divide the grid into sectors (e.g., 40x40 sectors)
  // so each segment can be printed with readable symbols inside cells.
  const sectorSize = 40;
  const numSectorsX = Math.ceil(pattern.width / sectorSize);
  const numSectorsY = Math.ceil(pattern.height / sectorSize);

  for (let sy = 0; sy < numSectorsY; sy++) {
    for (let sx = 0; sx < numSectorsX; sx++) {
      doc.addPage();
      
      const startX = sx * sectorSize;
      const startY = sy * sectorSize;
      const endX = Math.min(startX + sectorSize, pattern.width);
      const endY = Math.min(startY + sectorSize, pattern.height);

      const sectorW = endX - startX;
      const sectorH = endY - startY;

      // Header info on each grid page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      const sectorLabel = `Sector: Row ${sy + 1}, Col ${sx + 1}`;
      doc.text(`GRID MAP - ${sectorLabel}`, 20, 20);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Rows: ${startY + 1} to ${endY}, Cols: ${startX + 1} to ${endX}`, 20, 25);

      // We have about 170mm x 170mm for the grid.
      // Let's compute grid cell size based on maximum cell dimension.
      const gridDrawAreaSize = 160; // 160mm
      const cellSize = gridDrawAreaSize / sectorSize;

      const gridLeft = 20;
      const gridTop = 35;

      // Create a mapping from color code to symbol and color for easy pixel lookup
      const colorMap = new Map<string, { symbol: string; r: number; g: number; b: number }>();
      pattern.palette.forEach(p => colorMap.set(p.code, { symbol: p.symbol, r: p.r, g: p.g, b: p.b }));

      // Find pixel helper
      const pixelArray = new Array(pattern.height).fill(null).map(() => new Array(pattern.width).fill(null));
      pattern.pixels.forEach(p => {
        pixelArray[p.y][p.x] = p.colorCode;
      });

      // Draw grid borders and cell contents
      for (let r = 0; r < sectorH; r++) {
        for (let c = 0; c < sectorW; c++) {
          const px = startX + c;
          const py = startY + r;
          const colorCode = pixelArray[py][px];
          const colorInfo = colorMap.get(colorCode);

          const cellX = gridLeft + c * cellSize;
          const cellY = gridTop + r * cellSize;

          // Draw cell background (very light color matching or just white)
          if (colorInfo) {
            // Draw colored cell background with thin border
            doc.setFillColor(colorInfo.r, colorInfo.g, colorInfo.b);
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.05);
            doc.rect(cellX, cellY, cellSize, cellSize, 'FD');

            // Draw symbol centered (adapting text color to background luminance for high contrast)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(cellSize * 1.8); // Scale font size to cell size
            
            const luminance = (colorInfo.r * 0.299 + colorInfo.g * 0.587 + colorInfo.b * 0.114);
            if (luminance > 128) {
              doc.setTextColor(30, 41, 59); // Dark symbol on light background
            } else {
              doc.setTextColor(255, 255, 255); // Light symbol on dark background
            }
            doc.text(colorInfo.symbol, cellX + cellSize / 2, cellY + cellSize / 2 + (cellSize / 3.5), { align: 'center' });
          }
        }
      }

      // Draw vertical thick lines every 10 cells
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.2);
      for (let c = 0; c <= sectorW; c += 10) {
        const lineX = gridLeft + c * cellSize;
        doc.line(lineX, gridTop, lineX, gridTop + sectorH * cellSize);
      }

      // Draw horizontal thick lines every 10 cells
      for (let r = 0; r <= sectorH; r += 10) {
        const lineY = gridTop + r * cellSize;
        doc.line(gridLeft, lineY, gridLeft + sectorW * cellSize, lineY);
      }

      // Draw outer sector border and coordinates indices
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.3);
      doc.rect(gridLeft, gridTop, sectorW * cellSize, sectorH * cellSize, 'S');

      // Grid labels (every 10 columns/rows)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);

      // Column labels
      for (let c = 0; c < sectorW; c += 10) {
        if (c === 0 && startX === 0) continue;
        const cellX = gridLeft + c * cellSize;
        doc.text(`${startX + c}`, cellX + cellSize/2, gridTop - 2, { align: 'center' });
      }

      // Row labels
      for (let r = 0; r < sectorH; r += 10) {
        if (r === 0 && startY === 0) continue;
        const cellY = gridTop + r * cellSize;
        doc.text(`${startY + r}`, gridLeft - 2, cellY + cellSize/2 + 2, { align: 'right' });
      }
    }
  }

  // Save the generated document
  doc.save(`${project.name.replace(/\s+/g, '_')}_diamond_painting.pdf`);
}

export function generateSVG(pattern: GeneratedPattern): string {
  const cellSize = 10;
  const width = pattern.width * cellSize;
  const height = pattern.height * cellSize;

  const colorMap = new Map<string, string>();
  const symbolMap = new Map<string, string>();
  pattern.palette.forEach(p => {
    colorMap.set(p.code, p.hex);
    symbolMap.set(p.code, p.symbol);
  });

  const pixelArray = new Array(pattern.height).fill(null).map(() => new Array(pattern.width).fill(null));
  pattern.pixels.forEach(p => {
    pixelArray[p.y][p.x] = p.colorCode;
  });

  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
  svgContent += '  <style>\n';
  svgContent += '    .cell-border { stroke: #e2e8f0; stroke-width: 0.5; }\n';
  svgContent += '    .cell-text { font-family: Helvetica, Arial, sans-serif; font-size: 7px; font-weight: bold; text-anchor: middle; dominant-baseline: central; fill: #1e293b; }\n';
  svgContent += '  </style>\n';

  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const colorCode = pixelArray[y][x];
      const hex = colorMap.get(colorCode) || '#ffffff';
      const symbol = symbolMap.get(colorCode) || '';
      const cx = x * cellSize;
      const cy = y * cellSize;

      // Draw background color rect
      svgContent += `  <rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" fill="${hex}" class="cell-border" />\n`;
      // Draw symbol
      if (symbol) {
        svgContent += `  <text x="${cx + cellSize / 2}" y="${cy + cellSize / 2}" class="cell-text">${symbol}</text>\n`;
      }
    }
  }

  svgContent += '</svg>';
  return svgContent;
}
