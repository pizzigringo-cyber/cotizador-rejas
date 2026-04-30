/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum MaterialType {
  IRON_ROUND = 'iron_round',
  IRON_SQUARE = 'iron_square',
  FLAT_BAR = 'flat_bar', // Planchuela
  FRAME_PROFILE = 'frame_profile', // Perfil de marco
  LEAF_PROFILE = 'leaf_profile', // Perfil de hoja
  ACCESSORY = 'accessory' // Bisagras, cerraduras, etc.
}

export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  unit: 'm' | 'unit';
  pricePerUnit: number;
  gauge?: string; // 12mm, 14mm, etc.
}

export enum QuoteType {
  WINDOW = 'window',
  DOOR = 'door'
}

export enum BarOrientation {
  VERTICAL = 'vertical',
  HORIZONTAL = 'horizontal'
}

export interface QuoteProject {
  id: string;
  type: QuoteType;
  name: string;
  width: number; // Width of opening (vano)
  height: number; // Height of opening (vano)
  orientation: BarOrientation;
  barMaterialId: string;
  frameMaterialId?: string;
  leafFrameMaterialId?: string;
  hasFrame: boolean;
  barSpacing: number;
  globalDiscount: number; // New field for overall discount
  
  // Door specific
  hingeCount?: number;
  hasLock: boolean;
  lockBoxId?: string;
  handleId?: string;
  isDoubleLeaf?: boolean;
  installationType: 'recessed' | 'screwed'; // Empotrable o Tornillos
  
  createdAt: number;
}

export interface CalculationResult {
  totalCost: number;
  materials: {
    material: Material;
    quantity: number;
    cost: number;
  }[];
  cutList: {
    item: string;
    length: number;
    count: number;
  }[];
  clearances: {
    description: string;
    value: number;
  }[];
}
