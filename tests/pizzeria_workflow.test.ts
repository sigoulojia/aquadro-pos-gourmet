import { describe, it, expect, beforeEach } from "vitest";
import { productService } from "../src/services/product.service";
import { checkoutService } from "../src/services/checkout.service";
import { db } from "../src/db/sqlite";
import { SEED_STORE } from "../src/db/seed";

describe("Pizzeria POS — End-to-End Cashier & Ordering Workflow", () => {
  beforeEach(async () => {
    await db.resetAll();
  });

  it("loads authentic pizzeria categories and menu items", async () => {
    const products = await productService.getProducts();
    expect(products.length).toBeGreaterThanOrEqual(10);

    const pizzaItem = products.find(p => p.name_fr.includes("Margherita"));
    expect(pizzaItem).toBeDefined();
    expect(pizzaItem?.selling_price_ttc).toBe(650);

    const drinkItem = products.find(p => p.name_fr.includes("Coca-Cola"));
    expect(drinkItem).toBeDefined();
    expect(drinkItem?.selling_price_ttc).toBe(120);
  });

  it("calculates accurate order totals, handles quantity modifications, and change calculation", async () => {
    const products = await productService.getProducts();
    const margherita = products.find(p => p.name_fr.includes("Margherita"))!;
    const coca = products.find(p => p.name_fr.includes("Coca-Cola"))!;
    const fanta = products.find(p => p.name_fr.includes("Fanta"))!;

    // Cart simulation: 2 Margherita (650 x 2 = 1300) + 2 Coca (120 x 2 = 240) + 1 Fanta (120) = 1660 DZD
    const cart = [
      { productId: margherita.id, name: margherita.name_fr, unitPrice: margherita.selling_price_ttc, quantity: 2, discountAmount: 0 },
      { productId: coca.id, name: coca.name_fr, unitPrice: coca.selling_price_ttc, quantity: 2, discountAmount: 0 },
      { productId: fanta.id, name: fanta.name_fr, unitPrice: fanta.selling_price_ttc, quantity: 1, discountAmount: 0 }
    ];

    const expectedTotal = 650 * 2 + 120 * 2 + 120;
    const computedTotal = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    expect(computedTotal).toBe(1660);
    expect(computedTotal).toBe(expectedTotal);

    // Cash tendered: 2000 DZD -> Change given: 340 DZD
    const cashTendered = 2000;
    const changeGiven = cashTendered - computedTotal;
    expect(changeGiven).toBe(340);

    // Atomic Checkout execution
    const sale = await checkoutService.processCheckout({
      cashierId: "usr-cashier-01",
      cashierName: "Caissier Pizzeria",
      items: cart,
      payments: [
        {
          method: "CASH",
          amount: computedTotal,
          tenderedAmount: cashTendered,
          changeGiven: changeGiven
        }
      ],
      notes: "Sur Place - Table 4"
    });

    expect(sale).toBeDefined();
    expect(sale.receipt_number).toBeDefined();
    expect(sale.total_ttc).toBe(1660);
    expect(sale.status).toBe("COMPLETED");

    // Verify persistence in SQLite
    const savedSales = await db.select<any>("SELECT * FROM sales WHERE id = ?", [sale.id]);
    expect(savedSales.length).toBe(1);
    expect(savedSales[0].total_ttc).toBe(1660);
  });

  it("allows owner to add new pizza to the menu and update its price", async () => {
    // Add new custom pizza
    const newPizzaInput = {
      name_fr: "Pizza Truffe & Champignons Sauvages",
      name_ar: "بيتزا بالكمأة والفطر البري",
      category_id: "cat-pizza",
      variant: "Crème de truffe blanche, fior di latte, pleurotes sautées",
      sku: "PIZ-TRUFFE",
      barcode: "613999000001",
      purchase_cost: 600,
      selling_price_ttc: 1400,
      current_stock: 50,
      min_stock_alert: 5,
      unit_of_measure: "UNIT" as const
    };

    const created = await productService.createProduct(newPizzaInput);
    expect(created.id).toBeDefined();

    // Verify it appears in active menu
    const productsAfter = await productService.getProducts();
    const found = productsAfter.find(p => p.id === created.id);
    expect(found).toBeDefined();
    expect(found?.selling_price_ttc).toBe(1400);

    // Update price
    await productService.updateProduct(created.id, { selling_price_ttc: 1550 });
    const updatedProducts = await productService.getProducts();
    const updatedFound = updatedProducts.find(p => p.id === created.id);
    expect(updatedFound?.selling_price_ttc).toBe(1550);
  });
});
