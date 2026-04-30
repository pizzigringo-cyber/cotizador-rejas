/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Material, MaterialType } from './types';

export const DEFAULT_MATERIALS: Material[] = [
  { id: 'm1', name: 'Hierro Redondo 12mm', type: MaterialType.IRON_ROUND, unit: 'm', pricePerUnit: 2500, gauge: '12mm' },
  { id: 'm2', name: 'Hierro Redondo 14mm', type: MaterialType.IRON_ROUND, unit: 'm', pricePerUnit: 3200, gauge: '14mm' },
  { id: 'm3', name: 'Hierro Cuadrado 12mm', type: MaterialType.IRON_SQUARE, unit: 'm', pricePerUnit: 2800, gauge: '12mm' },
  { id: 'm4', name: 'Hierro Cuadrado 14mm', type: MaterialType.IRON_SQUARE, unit: 'm', pricePerUnit: 3500, gauge: '14mm' },
  { id: 'm5', name: 'Planchuela 1 1/4" x 3/16"', type: MaterialType.FLAT_BAR, unit: 'm', pricePerUnit: 1800 },
  { id: 'm6', name: 'Perfil Ángulo 1" x 1/8"', type: MaterialType.FRAME_PROFILE, unit: 'm', pricePerUnit: 2200 },
  { id: 'm7', name: 'Tubo Rectangular 40x20', type: MaterialType.LEAF_PROFILE, unit: 'm', pricePerUnit: 4500 },
  { id: 'a1', name: 'Bisagra Munición 100mm', type: MaterialType.ACCESSORY, unit: 'unit', pricePerUnit: 1200 },
  { id: 'a2', name: 'Cerradura de Seguridad', type: MaterialType.ACCESSORY, unit: 'unit', pricePerUnit: 8500 },
  { id: 'a3', name: 'Caja Porta Cerradura', type: MaterialType.ACCESSORY, unit: 'unit', pricePerUnit: 2500 },
  { id: 'a4', name: 'Picaporte', type: MaterialType.ACCESSORY, unit: 'unit', pricePerUnit: 4000 },
];
