import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

import { BudgetRecord } from '../models/budget.model';
import { BudgetService } from './budget.service';

// 18 fixture budget lines spanning three years, five regions, three brands, and every
// status — enough to exercise the filter bar, sorting, pagination and status pills.
const MOCK_BUDGETS: BudgetRecord[] = [
  { id: 'BUD-2026-001', year: 2026, region: 'Punjab-North', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Full Cream 1L', amount: 12_000_000, status: 'approved' },
  { id: 'BUD-2026-002', year: 2026, region: 'Punjab-North', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Full Cream 250ml', amount: 4_500_000, status: 'pending' },
  { id: 'BUD-2026-003', year: 2026, region: 'Punjab-South', businessUnit: 'Beverages', brand: 'Tarang', masterSku: 'Tarang 200ml', amount: 6_800_000, status: 'approved' },
  { id: 'BUD-2026-004', year: 2026, region: 'Sindh', businessUnit: 'Dairy', brand: 'Nurpur', masterSku: 'Nurpur Butter 200g', amount: 3_200_000, status: 'draft' },
  { id: 'BUD-2026-005', year: 2026, region: 'Sindh', businessUnit: 'Beverages', brand: 'Tarang', masterSku: 'Tarang 1L', amount: 5_400_000, status: 'overdue' },
  { id: 'BUD-2026-006', year: 2026, region: 'KPK', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Low Fat 1L', amount: 2_900_000, status: 'rejected' },
  { id: 'BUD-2026-007', year: 2026, region: 'Punjab-North', businessUnit: 'Nutrition', brand: 'Nurpur', masterSku: 'Nurpur Cheese 400g', amount: 7_600_000, status: 'pending' },
  { id: 'BUD-2026-008', year: 2026, region: 'Balochistan', businessUnit: 'Beverages', brand: 'Tarang', masterSku: 'Tarang 200ml', amount: 1_800_000, status: 'draft' },
  { id: 'BUD-2026-009', year: 2026, region: 'Punjab-South', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Full Cream 1L', amount: 9_300_000, status: 'approved' },
  { id: 'BUD-2025-014', year: 2025, region: 'Punjab-North', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Full Cream 1L', amount: 11_200_000, status: 'approved' },
  { id: 'BUD-2025-015', year: 2025, region: 'Sindh', businessUnit: 'Beverages', brand: 'Tarang', masterSku: 'Tarang 1L', amount: 4_100_000, status: 'approved' },
  { id: 'BUD-2025-016', year: 2025, region: 'KPK', businessUnit: 'Nutrition', brand: 'Nurpur', masterSku: 'Nurpur Cheese 400g', amount: 3_700_000, status: 'rejected' },
  { id: 'BUD-2025-017', year: 2025, region: 'Punjab-South', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Low Fat 1L', amount: 5_900_000, status: 'overdue' },
  { id: 'BUD-2027-002', year: 2027, region: 'Punjab-North', businessUnit: 'Beverages', brand: 'Tarang', masterSku: 'Tarang 200ml', amount: 8_400_000, status: 'draft' },
  { id: 'BUD-2027-003', year: 2027, region: 'Sindh', businessUnit: 'Dairy', brand: 'Nurpur', masterSku: 'Nurpur Butter 200g', amount: 2_600_000, status: 'pending' },
  { id: 'BUD-2027-004', year: 2027, region: 'KPK', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Full Cream 250ml', amount: 3_050_000, status: 'draft' },
  { id: 'BUD-2027-005', year: 2027, region: 'Punjab-South', businessUnit: 'Nutrition', brand: 'Nurpur', masterSku: 'Nurpur Cheese 400g', amount: 6_150_000, status: 'pending' },
  { id: 'BUD-2027-006', year: 2027, region: 'Balochistan', businessUnit: 'Dairy', brand: 'Olpers', masterSku: 'Olpers Full Cream 1L', amount: 4_750_000, status: 'draft' },
];

@Injectable()
export class MockBudgetService extends BudgetService {
  getBudgets(): Observable<BudgetRecord[]> {
    // 500ms delay exercises the data table's loading (skeleton) state.
    return of(MOCK_BUDGETS.map((record) => ({ ...record }))).pipe(delay(500));
  }
}
