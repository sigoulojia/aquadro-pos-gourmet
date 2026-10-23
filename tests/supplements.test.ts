import { describe, it, expect, beforeEach } from 'vitest';
import { supplementService, LEGACY_DEFAULT_SUPPLEMENT_IDS } from '../src/services/supplement.service';
import { db } from '../src/db/sqlite';

describe('Supplements Management & Persistence', () => {
  beforeEach(async () => {
    await db.initialize();
    // Vider pour démarrer sur un état propre
    await supplementService.clearAllSupplements();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('starts with an empty supplement list by default (no hardcoded demo items)', async () => {
    const supplements = await supplementService.getSupplements(true);
    expect(supplements).toEqual([]);
    expect(supplements.length).toBe(0);
  });

  it('adds a new supplement with custom stock and price, and persists it', async () => {
    const created = await supplementService.addSupplement({
      name_fr: 'Extra Mozzarella Di Bufala',
      name_ar: 'موزاريلا دي بوفالا إضافية',
      purchase_cost: 120,
      price: 250,
      current_stock: 45,
      min_stock_alert: 10,
      category: 'cheese'
    });

    expect(created.id).toBeDefined();
    expect(created.name_fr).toBe('Extra Mozzarella Di Bufala');
    expect(created.price).toBe(250);
    expect(created.purchase_cost).toBe(120);
    expect(created.current_stock).toBe(45);

    const list = await supplementService.getSupplements(true);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);
  });

  it('deletes a supplement permanently from database and cache', async () => {
    const item1 = await supplementService.addSupplement({
      name_fr: 'Olives Noires',
      price: 80,
      purchase_cost: 30,
      current_stock: 30,
      min_stock_alert: 5
    });

    const item2 = await supplementService.addSupplement({
      name_fr: 'Origan Sauvage',
      price: 50,
      purchase_cost: 15,
      current_stock: 100,
      min_stock_alert: 10
    });

    let list = await supplementService.getSupplements(true);
    expect(list.length).toBe(2);

    // Suppression de item1
    await supplementService.deleteSupplement(item1.id);

    list = await supplementService.getSupplements(true);
    expect(list.length).toBe(1);
    expect(list.find(s => s.id === item1.id)).toBeUndefined();
    expect(list[0].id).toBe(item2.id);

    // Vérification directe dans SQLite
    const rows = await db.select<{ id: string }>('SELECT id FROM pizza_supplements WHERE id = ?', [item1.id]);
    expect(rows.length).toBe(0);
  });

  it('purges legacy demo default supplements properly', async () => {
    // Simuler l'insertion d'un ancien élément par défaut
    const legacyId = LEGACY_DEFAULT_SUPPLEMENT_IDS[0]; // 'sup-fromage'
    await db.execute(
      `INSERT INTO pizza_supplements (id, name_fr, price, purchase_cost, current_stock, min_stock_alert, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [legacyId, 'Fromage Démo', 150, 60, 50, 5, 1, new Date().toISOString()]
    );

    // Ajouter un vrai supplément utilisateur
    const userItem = await supplementService.addSupplement({
      name_fr: 'Vrai Supplément',
      price: 200,
      purchase_cost: 80,
      current_stock: 20,
      min_stock_alert: 5
    });

    // Nettoyer les valeurs par défaut
    await supplementService.clearDefaultSupplements();

    const currentList = await supplementService.getSupplements(true);
    expect(currentList.some(s => s.id === legacyId)).toBe(false);
    expect(currentList.some(s => s.id === userItem.id)).toBe(true);
  });

  it('clears all supplements when clearAllSupplements is invoked', async () => {
    await supplementService.addSupplement({ name_fr: 'Test 1', price: 100 });
    await supplementService.addSupplement({ name_fr: 'Test 2', price: 200 });

    let list = await supplementService.getSupplements(true);
    expect(list.length).toBe(2);

    await supplementService.clearAllSupplements();

    list = await supplementService.getSupplements(true);
    expect(list.length).toBe(0);
  });
});
