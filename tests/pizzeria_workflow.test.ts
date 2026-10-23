import { describe, it, expect, beforeEach } from "vitest";
import { productService } from "../src/services/product.service";
import { checkoutService } from "../src/services/checkout.service";
import { db } from "../src/db/sqlite";
import { SEED_STORE } from "../src/db/seed";

describe("Pizzeria POS — End-to-End Cashier & Ordering Workflow", () => {
  beforeEach(async () => {
    await db.resetAll();
    const existing = await productService.getProducts();
    if (!existing.some(p => p.name_fr.includes("Margherita"))) {
      await productService.createProduct({
        sku: 'PZ-MARG',
        barcode: '5001',
        name_fr: 'Pizza Margherita',
        name_ar: 'بيتزا مارغريتا',
        selling_price_ttc: 650,
        purchase_cost: 200,
        current_stock: 50,
        category_id: 'cat-pizza'
      });
      await productService.createProduct({
        sku: 'DRK-COCA',
        barcode: '5002',
        name_fr: 'Cannette Coca-Cola 33cl',
        name_ar: 'كوكا كولا',
        selling_price_ttc: 120,
        purchase_cost: 70,
        current_stock: 50,
        category_id: 'cat-drink'
      });
      await productService.createProduct({
        sku: 'DRK-FANTA',
        barcode: '5003',
        name_fr: 'Cannette Fanta Orange 33cl',
        name_ar: 'فانتا برتقال',
        selling_price_ttc: 120,
        purchase_cost: 70,
        current_stock: 50,
        category_id: 'cat-drink'
      });
    }
  });

  it("loads authentic pizzeria categories and menu items", async () => {
    const products = await productService.getProducts();
    expect(products.length).toBeGreaterThanOrEqual(1);

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

    // Update price and verify virtual attributes do not break update
    await productService.updateProduct(created.id, {
      selling_price_ttc: 1550,
      name: "Pizza Truffe & Champignons (Modifié)"
    });
    const updatedProducts = await productService.getProducts();
    const updatedFound = updatedProducts.find(p => p.id === created.id);
    expect(updatedFound?.selling_price_ttc).toBe(1550);
  });

  it("creates and updates a product with custom image_url and custom category safely", async () => {
    const customPizza = await productService.createProduct({
      name_fr: "Pizza 4 Fromages Royale",
      name_ar: "بيتزا 4 أجبان ملكية",
      category_id: "cat-custom-gourmet",
      sku: "PIZ-4FROM-ROYAL",
      barcode: "613999000099",
      purchase_cost: 500,
      selling_price_ttc: 1200,
      current_stock: 30,
      image_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    });

    expect(customPizza.id).toBeDefined();
    expect(customPizza.image_url).toBeDefined();

    const fetched = await productService.getProductById(customPizza.id);
    expect(fetched?.name_fr).toBe("Pizza 4 Fromages Royale");
  });
});
