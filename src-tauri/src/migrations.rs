use sqlx::{Acquire, SqlitePool};

pub async fn apply_gate_1c_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Check if the constraint already exists
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='products' AND sql LIKE '%CHECK(current_stock >= 0.0)%';"
    ).fetch_optional(pool).await?;

    if row.is_some() {
        return Ok(()); // Already applied
    }

    // Ensure image_url exists on legacy databases before rebuilding
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN image_url TEXT;").execute(pool).await;

    // Acquire a dedicated connection so PRAGMA foreign_keys = OFF applies outside the transaction
    let mut conn = pool.acquire().await?;
    sqlx::query("PRAGMA foreign_keys = OFF;").execute(&mut *conn).await?;

    let mig_result: Result<(), sqlx::Error> = async {
        let mut tx = conn.begin().await?;

        // Enable legacy alter table to avoid foreign key rewrite issues during drop/rename
        sqlx::query("PRAGMA legacy_alter_table = ON;").execute(&mut *tx).await?;

        // PRODUCTS
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS new_products (
                id TEXT PRIMARY KEY,
                store_id TEXT REFERENCES stores(id),
                category_id TEXT REFERENCES categories(id),
                brand_id TEXT REFERENCES brands(id),
                sku TEXT UNIQUE NOT NULL,
                barcode TEXT UNIQUE NOT NULL,
                additional_barcodes TEXT,
                name_fr TEXT NOT NULL,
                name_ar TEXT NOT NULL,
                variant TEXT,
                size_weight TEXT,
                unit_of_measure TEXT DEFAULT 'UNIT',
                box_conversion_ratio REAL DEFAULT 1.0,
                purchase_cost INTEGER NOT NULL DEFAULT 0,
                selling_price_ttc INTEGER NOT NULL DEFAULT 0,
                min_selling_price_ttc INTEGER NOT NULL DEFAULT 0,
                tva_rate REAL DEFAULT 0.0,
                current_stock REAL NOT NULL DEFAULT 0.0 CHECK(current_stock >= 0.0),
                min_stock_alert REAL NOT NULL DEFAULT 5.0,
                image_url TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        "#).execute(&mut *tx).await?;

        sqlx::query(r#"
            INSERT INTO new_products (
                id, store_id, category_id, brand_id, sku, barcode, additional_barcodes,
                name_fr, name_ar, variant, size_weight, unit_of_measure, box_conversion_ratio,
                purchase_cost, selling_price_ttc, min_selling_price_ttc, tva_rate,
                current_stock, min_stock_alert, image_url, is_active, created_at, updated_at
            )
            SELECT
                id, store_id, category_id, brand_id, sku, barcode, additional_barcodes,
                name_fr, name_ar, variant, size_weight,
                COALESCE(unit_of_measure, 'UNIT'),
                COALESCE(box_conversion_ratio, 1.0),
                COALESCE(purchase_cost, 0),
                COALESCE(selling_price_ttc, 0),
                COALESCE(min_selling_price_ttc, 0),
                COALESCE(tva_rate, 0.0),
                MAX(0.0, COALESCE(current_stock, 0.0)),
                COALESCE(min_stock_alert, 5.0),
                image_url,
                COALESCE(is_active, 1),
                created_at,
                updated_at
            FROM products;
        "#).execute(&mut *tx).await?;

        sqlx::query("DROP TABLE products;").execute(&mut *tx).await?;
        sqlx::query("ALTER TABLE new_products RENAME TO products;").execute(&mut *tx).await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_prod_barcode ON products(barcode);").execute(&mut *tx).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_prod_sku ON products(sku);").execute(&mut *tx).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_prod_cat ON products(category_id);").execute(&mut *tx).await?;

        // PRODUCT_BATCHES
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS new_product_batches (
                id TEXT PRIMARY KEY,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                batch_number TEXT NOT NULL,
                expiration_date TEXT NOT NULL,
                current_stock REAL NOT NULL DEFAULT 0.0 CHECK(current_stock >= 0.0),
                purchase_cost INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
        "#).execute(&mut *tx).await?;

        sqlx::query(r#"
            INSERT INTO new_product_batches (
                id, product_id, batch_number, expiration_date, current_stock, purchase_cost, created_at
            )
            SELECT
                id, product_id, batch_number, expiration_date,
                MAX(0.0, COALESCE(current_stock, 0.0)),
                COALESCE(purchase_cost, 0),
                created_at
            FROM product_batches;
        "#).execute(&mut *tx).await?;

        sqlx::query("DROP TABLE product_batches;").execute(&mut *tx).await?;
        sqlx::query("ALTER TABLE new_product_batches RENAME TO product_batches;").execute(&mut *tx).await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_batch_fefo ON product_batches(product_id, expiration_date ASC);").execute(&mut *tx).await?;

        sqlx::query("PRAGMA legacy_alter_table = OFF;").execute(&mut *tx).await?;

        tx.commit().await?;
        Ok(())
    }.await;

    let _ = sqlx::query("PRAGMA legacy_alter_table = OFF;").execute(&mut *conn).await;
    let _ = sqlx::query("PRAGMA foreign_keys = ON;").execute(&mut *conn).await;

    mig_result
}

