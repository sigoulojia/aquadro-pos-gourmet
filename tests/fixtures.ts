import { db } from '../src/db/sqlite';

export async function seedTestFixtures() {
  await db.initialize();
  
  const prods = [
    {
      id: 'prod-001',
      sku: 'ON-WHEY-2KG',
      barcode: '748927028669',
      name_fr: 'Optimum Nutrition Gold Standard Whey 2.27kg',
      name_ar: 'أوبتيموم نوتريشن واي بروتين',
      selling_price_ttc: 16800,
      purchase_cost: 13000,
      min_selling_price_ttc: 15000,
      current_stock: 35,
      min_stock_alert: 5,
      is_active: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'prod-002',
      sku: 'ON-CREATINE-300G',
      barcode: '748927028670',
      name_fr: 'Creatine Monohydrate 300g',
      name_ar: 'كرياتين مونوهيدرات',
      selling_price_ttc: 4500,
      purchase_cost: 3200,
      min_selling_price_ttc: 4000,
      current_stock: 20,
      min_stock_alert: 5,
      is_active: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'prod-003',
      sku: 'BCAA-280G',
      barcode: '748927028671',
      name_fr: 'BCAA Energy 280g',
      name_ar: 'بي سي إيه إيه إنرجي',
      selling_price_ttc: 5200,
      purchase_cost: 3800,
      min_selling_price_ttc: 4800,
      current_stock: 15,
      min_stock_alert: 5,
      is_active: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
  ];

  for (const p of prods) {
    await db.execute(
      `INSERT OR REPLACE INTO products (id, sku, barcode, name_fr, name_ar, selling_price_ttc, purchase_cost, min_selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.sku, p.barcode, p.name_fr, p.name_ar, p.selling_price_ttc, p.purchase_cost, p.min_selling_price_ttc, p.current_stock, p.min_stock_alert, p.is_active, p.created_at, p.updated_at]
    );
  }

  const batches = [
    { id: 'batch-001', product_id: 'prod-001', batch_number: 'LOT-2026-EARLY', expiration_date: '2027-01-15', current_stock: 10, purchase_cost: 13000, purchase_price: 13000, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'batch-002', product_id: 'prod-001', batch_number: 'LOT-2026-LATE', expiration_date: '2027-08-30', current_stock: 25, purchase_cost: 13500, purchase_price: 13500, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'batch-003', product_id: 'prod-002', batch_number: 'LOT-2026-CREA', expiration_date: '2027-12-31', current_stock: 20, purchase_cost: 3200, purchase_price: 3200, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'batch-004', product_id: 'prod-003', batch_number: 'LOT-2026-BCAA', expiration_date: '2027-10-31', current_stock: 15, purchase_cost: 3800, purchase_price: 3800, created_at: '2026-01-01T00:00:00.000Z' }
  ];

  for (const b of batches) {
    await db.execute(
      `INSERT OR REPLACE INTO product_batches (id, product_id, batch_number, expiration_date, current_stock, purchase_cost, purchase_price, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.id, b.product_id, b.batch_number, b.expiration_date, b.current_stock, b.purchase_cost, b.purchase_price, b.created_at]
    );
  }

  await db.execute(
    `INSERT OR REPLACE INTO customers (id, store_id, name, phone, email, loyalty_points, total_spent, current_debt, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ['cust-001', 'store-001', 'Mohamed Benali', '0550123456', 'mohamed@example.dz', 150, 45000, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
  );
}
