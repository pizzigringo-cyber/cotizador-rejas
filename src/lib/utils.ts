/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Material, QuoteProject, MaterialType, CalculationResult, BarOrientation, QuoteType } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateQuote(project: QuoteProject, materials: Material[]): CalculationResult {
  const barMaterial = materials.find(m => m.id === project.barMaterialId);
  const frameMaterial = project.hasFrame ? materials.find(m => m.id === project.frameMaterialId) : null;
  const leafFrameMaterial = project.type === QuoteType.DOOR ? materials.find(m => m.id === project.leafFrameMaterialId) : null;
  
  const results: CalculationResult = {
    totalCost: 0,
    materials: [],
    cutList: [],
    clearances: []
  };

  // Colors for adjustments
  const colors = [
    'text-blue-500', 'text-emerald-500', 'text-amber-500', 
    'text-purple-500', 'text-rose-500', 'text-indigo-500', 
    'text-orange-500', 'text-teal-500'
  ];
  let colorIndex = 0;
  const getNextColor = () => colors[colorIndex++ % colors.length];

  // 1. Initial Dimensions and Clearances
  const discount = project.globalDiscount || 0;
  let effectiveWidth = Math.max(0, project.width - discount);
  let effectiveHeight = Math.max(0, project.height - discount);

  let globalDiscountColor: string | undefined;
  if (discount > 0) {
    globalDiscountColor = getNextColor();
    results.clearances.push({ 
      description: 'Ajuste de medida final (holgura)', 
      value: discount,
      color: globalDiscountColor
    });
  }

  if (project.hasFrame) {
    if (frameMaterial) {
      const isFlatBar = frameMaterial.type === MaterialType.FLAT_BAR;
      
      let frameQty = 0;
      
      if (isFlatBar) {
        // Straight cuts
        // Verticals are full height
        // Horizontals are width - (2 * thickness)
        let thickness = 4.75; // Default 3/16"
        if (frameMaterial.name.includes('1/8')) thickness = 3.2;
        if (frameMaterial.name.includes('1/4')) thickness = 6.4;
        if (frameMaterial.name.includes('3/16')) thickness = 4.75;

        const verticalLength = effectiveHeight;
        const horizontalLength = Math.max(0, effectiveWidth - (2 * thickness));

        results.cutList.push({ 
          item: 'Marco Lateral (Planchuela)', 
          length: verticalLength, 
          originalLength: project.height, 
          color: globalDiscountColor,
          count: 2 
        });
        results.cutList.push({ 
          item: 'Marco Superior/Inferior (Planchuela)', 
          length: horizontalLength, 
          originalLength: project.width, 
          color: globalDiscountColor,
          count: 2 
        });
        
        frameQty = (verticalLength * 2 + horizontalLength * 2) / 1000;
        const thicknessColor = getNextColor();
        results.clearances.push({ 
          description: 'Descuento por espesor de planchuela (solape horizontal)', 
          value: Math.round(thickness * 2),
          color: thicknessColor
        });
        // Update horizontal length color to show it was affected by thickness
        results.cutList[results.cutList.length - 1].color = thicknessColor;
      } else {
        // Tube/Profile - 45 degree cuts
        results.cutList.push({ 
          item: 'Marco Lateral (Caño/Perfil)', 
          length: effectiveHeight, 
          originalLength: project.height, 
          color: globalDiscountColor,
          count: 2 
        });
        results.cutList.push({ 
          item: 'Marco Superior/Inferior (Caño/Perfil)', 
          length: effectiveWidth, 
          originalLength: project.width, 
          color: globalDiscountColor,
          count: 2 
        });
        
        frameQty = (effectiveHeight * 2 + effectiveWidth * 2) / 1000;
      }
      
      if (project.installationType === 'recessed') {
        const legCount = 6;
        const legLength = 100;
        frameQty += (legCount * legLength) / 1000;
        results.cutList.push({ item: 'Grapas de empotrar', length: legLength, count: legCount });
      }

      const frameCost = frameQty * frameMaterial.pricePerUnit;
      results.materials.push({ material: frameMaterial, quantity: frameQty, cost: frameCost });
      results.totalCost += frameCost;
    }
  } else {
    // NO FRAME - Perforated flat bars (Planchuelas Perforadas)
    // These hold the bars. If vertical bars, we need horizontal perforated bars.
    const perfBarLength = project.width + 200; // Always based on original vano width + embedding (100mm per side)
    const perfBarCount = effectiveHeight > 1500 ? 3 : 2; 
    
    const flatBar = materials.find(m => m.type === MaterialType.FLAT_BAR) || barMaterial; 
    
    if (flatBar) {
      const qty = (perfBarLength * perfBarCount) / 1000;
      const cost = qty * flatBar.pricePerUnit;
      results.materials.push({ material: flatBar, quantity: qty, cost });
      results.totalCost += cost;
      
      const barDesc = barMaterial?.gauge || barMaterial?.name || '';
      results.cutList.push({ 
        item: `Planchuela Perforada (para ${barDesc})`, 
        length: perfBarLength, 
        count: perfBarCount 
      });
    }
  }

  // 2. Door/Window Specific Logic
  let internalWidth = effectiveWidth;
  let internalHeight = effectiveHeight;
  
  if (project.hasFrame && frameMaterial) {
    const isFlatBar = frameMaterial.type === MaterialType.FLAT_BAR;
    let frameThickness = 40; 

    if (isFlatBar) {
      frameThickness = 4.75;
      if (frameMaterial.name.includes('1/8')) frameThickness = 3.2;
      if (frameMaterial.name.includes('1/4')) frameThickness = 6.4;
      if (frameMaterial.name.includes('3/16')) frameThickness = 4.75;
    } else {
      const sizeMatch = frameMaterial.name.match(/(\d+)\s*[xX]\s*(\d+)/);
      if (sizeMatch) {
        const dim1 = Number(sizeMatch[1]);
        const dim2 = Number(sizeMatch[2]);
        if (dim1 !== dim2) {
          const maxDim = Math.max(dim1, dim2);
          const minDim = Math.min(dim1, dim2);
          frameThickness = project.frameRotated ? maxDim : minDim;
        } else {
          frameThickness = dim1;
        }
      }
    }

    internalWidth -= (frameThickness * 2);
    const frameInternalColor = getNextColor();
    
    // Perimeter frame (both superior and inferior)
    internalHeight -= (frameThickness * 2);
    results.clearances.push({ 
      description: `Espacio interno (Marco Sup/Inf ${frameThickness}mm x2)`, 
      value: Math.round(frameThickness * 2),
      color: frameInternalColor
    });
  }

  let finalBarAreaWidth = internalWidth;
  let finalBarAreaHeight = internalHeight;
  let finalBarColor: string | undefined;

  if (project.type === QuoteType.DOOR && leafFrameMaterial) {
    const leafCount = project.isDoubleLeaf ? 2 : 1;
    
    // THE 5mm CLEARANCE requested (5mm above and 5mm below between frame and leaf)
    const leafOpeningClearance = 5; 
    const totalLeafClearance = 10 + (leafOpeningClearance * 2); // 10 for meeting/latch + 5 each side
    
    const leafWidth = project.isDoubleLeaf 
      ? (internalWidth - totalLeafClearance) / 2 
      : internalWidth - (leafOpeningClearance * 2);
    
    // Door leaf height = Internal height - 5mm top - 5mm bottom
    const leafHeight = internalHeight - (leafOpeningClearance * 2); 
    
    const leafClearanceColor = getNextColor();

    if (project.isDoubleLeaf) {
      results.clearances.push({ 
        description: `Luz perimetral hoja (5mm) y encuentro (10mm)`, 
        value: Math.round(totalLeafClearance),
        color: leafClearanceColor
      });
    } else {
      results.clearances.push({ 
        description: `Luz perimetral hoja (5mm c/lado y arriba/abajo)`, 
        value: Math.round(leafOpeningClearance * 2),
        color: leafClearanceColor
      });
    }

    const leafQty = ((leafWidth * 2 + leafHeight * 2) * leafCount) / 1000;
    const leafCost = leafQty * leafFrameMaterial.pricePerUnit;
    results.materials.push({ material: leafFrameMaterial, quantity: leafQty, cost: leafCost });
    results.totalCost += leafCost;
    
    results.cutList.push({ 
      item: 'Bastidor Hoja Lateral', 
      length: leafHeight, 
      originalLength: internalHeight,
      color: leafClearanceColor,
      count: 2 * leafCount 
    });
    results.cutList.push({ 
      item: 'Bastidor Hoja Superior/Inferior', 
      length: leafWidth, 
      originalLength: internalWidth,
      color: leafClearanceColor,
      count: 2 * leafCount 
    });

    // Calculate dimensions INSIDE the leaf for the bars
    let leafThickness = 40;
    const leafSizeMatch = leafFrameMaterial.name.match(/(\d+)\s*[xX]\s*(\d+)/);
    if (leafSizeMatch) {
      const d1 = Number(leafSizeMatch[1]);
      const d2 = Number(leafSizeMatch[2]);
      // For leaf, we usually use the MIN dimension as the visible face thickness
      leafThickness = Math.min(d1, d2);
    }
    
    finalBarAreaWidth = leafWidth - (leafThickness * 2);
    finalBarAreaHeight = leafHeight - (leafThickness * 2);

    const barAreaColor = getNextColor();
    results.clearances.push({ 
      description: `Espacio para barrotes dentro de hoja (perfil ${leafThickness}mm)`, 
      value: Math.round(leafThickness * 2),
      color: barAreaColor
    });
    finalBarColor = barAreaColor;
  } else {
    finalBarColor = results.clearances.length > 0 ? results.clearances[results.clearances.length - 1].color : undefined;
  }

  // 3. Bars Calculation
  if (barMaterial) {
    const barSpacing = project.barSpacing || 120;
    let barCount = 0;
    let barLength = 0;
    let originalBarLength = 0;

    if (project.orientation === BarOrientation.VERTICAL) {
      barCount = Math.floor(finalBarAreaWidth / barSpacing);
      barLength = finalBarAreaHeight;
      originalBarLength = project.height;
    } else {
      barCount = Math.floor(finalBarAreaHeight / barSpacing);
      barLength = finalBarAreaWidth;
      originalBarLength = project.width;
    }

    const totalBarQty = (barCount * barLength) / 1000;
    const barCost = totalBarQty * barMaterial.pricePerUnit;
    
    results.materials.push({ material: barMaterial, quantity: totalBarQty, cost: barCost });
    results.totalCost += barCost;
    results.cutList.push({ 
      item: `Barrotes ${project.orientation === BarOrientation.VERTICAL ? 'Verticales' : 'Horizontales'}`, 
      length: barLength, 
      originalLength: originalBarLength,
      color: finalBarColor,
      count: barCount 
    });
  }

  // 4. Accessories (for Doors)
  if (project.type === QuoteType.DOOR) {
    if (project.hingeCount) {
      const hinge = materials.find(m => m.type === MaterialType.ACCESSORY && m.name.toLowerCase().includes('bisagra'));
      if (hinge) {
        const qty = project.hingeCount;
        const cost = qty * hinge.pricePerUnit;
        results.materials.push({ material: hinge, quantity: qty, cost });
        results.totalCost += cost;
      }
    }
    
    if (project.hasLock) {
      const lock = materials.find(m => m.type === MaterialType.ACCESSORY && m.name.toLowerCase().includes('cerradura'));
      if (lock) {
        results.materials.push({ material: lock, quantity: 1, cost: lock.pricePerUnit });
        results.totalCost += lock.pricePerUnit;
      }
    }
  }

  return results;
}
