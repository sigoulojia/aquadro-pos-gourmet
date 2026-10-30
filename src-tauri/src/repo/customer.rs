use sqlx::SqliteConnection;

pub struct CustomerRepo;

impl CustomerRepo {
    pub async fn add_debt(conn: &mut SqliteConnection, customer_id: &str, amount: i64) -> Result<(), String> {
        sqlx::query("UPDATE customers SET current_debt = current_debt + ? WHERE id = ?")
            .bind(amount)
            .bind(customer_id)
            .execute(&mut *conn).await.map_err(|e| e.to_string())?;
            
        Ok(())
    }

    pub async fn update_after_sale(
        conn: &mut SqliteConnection,
        customer_id: &str,
        total_ttc: i64,
        credit_amount: i64,
    ) -> Result<(), String> {
        let points_earned = (total_ttc / 100).max(0);
        sqlx::query(
            "UPDATE customers SET 
             loyalty_points = COALESCE(loyalty_points, 0) + ?,
             total_spent = COALESCE(total_spent, 0) + ?,
             current_debt = COALESCE(current_debt, 0) + ?
             WHERE id = ?"
        )
        .bind(points_earned)
        .bind(total_ttc)
        .bind(credit_amount)
        .bind(customer_id)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

        Ok(())
    }
}
