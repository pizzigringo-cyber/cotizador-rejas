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

  // 1. Initial Dimensions and Clearances
  const discount = project.globalDiscount || 0;
  let effectiveWidth = Math.max(0, project.width - discount);
  let effectiveHeight = Math.max(0, project.height - discount);

  // Clearances (Luces) - These are ADDITIONAL to global discount if applicable
  // But usually global discount is the "luz" the user wants.
  // I will treat globalDiscount as the primary way to adjust the size.
  
  results.clearances.push({ description: 'Ajuste de medida final (holgura)', value: discount });

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

        results.cutList.push({ item: 'Marco Lateral (Planchuela)', length: verticalLength, count: 2 });
        results.cutList.push({ item: 'Marco Superior/Inferior (Planchuela)', length: horizontalLength, count: 2 });
        
        frameQty = (verticalLength * 2 + horizontalLength * 2) / 1000;
        results.clearances.push({ description: 'Descuento por espesor de planchuela', value: Math.round(thickness * 2) });
      } else {
        // Tube/Profile - 45 degree cuts
        results.cutList.push({ item: 'Marco Lateral (Caño/Perfil)', length: effectiveHeight, count: 2 });
        results.cutList.push({ item: 'Marco Superior/Inferior (Caño/Perfil)', length: effectiveWidth, count: 2 });
        
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
    const perfBarLength = effectiveWidth + 200; // 100mm extra each side for embedding
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

  // 2. Leaf Frame (for Doors) [...]
  let internalWidth = effectiveWidth;
  let internalHeight = effectiveHeight;
  
  if (project.hasFrame && frameMaterial) {
    // If it has a frame, the leaf must fit INSIDE the frame
    // We'll subtract the profile size. Assuming 40mm as default if not specified
    const profileSize = 40; 
    internalWidth -= (profileSize * 2);
    internalHeight -= (profileSize * 2);
  }

  if (project.type === QuoteType.DOOR && leafFrameMaterial) {
    const leafCount = project.isDoubleLeaf ? 2 : 1;
    const leafWidth = project.isDoubleLeaf ? (internalWidth - 10) / 2 : internalWidth - 10;
    
    if (project.isDoubleLeaf) {
      results.clearances.push({ description: 'Descuento encuentro doble hoja', value: 10 });
    }

    const leafQty = ((leafWidth * 2 + internalHeight * 2) * leafCount) / 1000;
    const leafCost = leafQty * leafFrameMaterial.pricePerUnit;
    results.materials.push({ material: leafFrameMaterial, quantity: leafQty, cost: leafCost });
    results.totalCost += leafCost;
    
    results.cutList.push({ item: 'Bastidor Hoja Lateral', length: internalHeight, count: 2 * leafCount });
    results.cutList.push({ item: 'Bastidor Hoja Superior/Inferior', length: leafWidth, count: 2 * leafCount });
  }

  // 3. Bars Calculation
  if (barMaterial) {
    const barSpacing = project.barSpacing || 120; // Default 120mm
    let barCount = 0;
    let barLength = 0;

    if (project.orientation === BarOrientation.VERTICAL) {
      barCount = Math.floor(internalWidth / barSpacing);
      barLength = internalHeight;
    } else {
      barCount = Math.floor(internalHeight / barSpacing);
      barLength = internalWidth;
    }

    const totalBarQty = (barCount * barLength) / 1000;
    const barCost = totalBarQty * barMaterial.pricePerUnit;
    
    results.materials.push({ material: barMaterial, quantity: totalBarQty, cost: barCost });
    results.totalCost += barCost;
    results.cutList.push({ 
      item: `Barrotes ${project.orientation === BarOrientation.VERTICAL ? 'Verticales' : 'Horizontales'}`, 
      length: barLength, 
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
