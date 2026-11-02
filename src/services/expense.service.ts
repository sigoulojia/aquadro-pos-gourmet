// Aquadro POS Algérie V2 — Service de Gestion des Dépenses & Charges du Magasin
// Saisie des charges (Sonelgaz, Gaz, Loyer, Emballages, Transport) et impact direct sur la caisse

import { db } from '../db/sqlite';
import { Expense, ExpenseCategory } from '../types/database';
import { caisseService } from './caisse.service';

export interface CreateExpensePayload {
  category: ExpenseCategory;
  amount: number;
  paymentMethod: 'CASH' | 'BANK';
  description: string;
  date: string; // YYYY-MM-DD
  userId: string;
  userName?: string;
  sessionId?: string;
}

export interface UpdateExpensePayload {
  category: ExpenseCategory;
  amount: number;
  paymentMethod: 'CASH' | 'BANK';
  description: string;
  date: string; // YYYY-MM-DD
}

export class ExpenseService {
  private static instance: ExpenseService;

  private constructor() {}

  public static getInstance(): ExpenseService {
    if (!ExpenseService.instance) {
      ExpenseService.instance = new ExpenseService();
    }
    return ExpenseService.instance;
  }

  public async getExpenses(limit: number = 1000): Promise<Expense[]> {
    return await db.select<Expense>(
      `SELECT * FROM expenses ORDER BY date DESC, created_at DESC LIMIT ${limit}`
    );
  }

  public async getExpenseById(id: string): Promise<Expense | null> {
    const list = await db.select<Expense>('SELECT * FROM expenses WHERE id = ?', [id]);
    return list.length > 0 ? list[0] : null;
  }

  public async createExpense(payload: CreateExpensePayload): Promise<Expense> {
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      throw new Error('Le montant de la dépense doit être supérieur à zéro.');
    }
    if (!payload.description || !payload.description.trim()) {
      throw new Error('La description du motif de la charge est obligatoire.');
    }

    const expense: Expense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      category: payload.category,
      amount: payload.amount,
      payment_method: payload.paymentMethod,
      description: payload.description.trim(),
      date: payload.date,
      user_id: payload.userId,
      user_name: payload.userName,
      created_at: new Date().toISOString()
    };

    await db.execute(
      `INSERT INTO expenses (
        id, category, amount, payment_method, description, date, user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expense.id, expense.category, expense.amount, expense.payment_method,
        expense.description, expense.date, expense.user_id, expense.created_at
      ]
    );

    // Si payé en espèces, déduire immédiatement du fond de la session de caisse active
    if (payload.paymentMethod === 'CASH') {
      const activeSession = payload.sessionId
        ? await caisseService.getSessionById(payload.sessionId)
        : await caisseService.getActiveSession();

      if (activeSession && activeSession.status === 'OPEN') {
        await caisseService.recordExpenseToSession(activeSession.id, payload.amount);
      }
    }

    return expense;
  }

  public async updateExpense(id: string, payload: UpdateExpensePayload): Promise<Expense> {
    const existing = await this.getExpenseById(id);
    if (!existing) {
      throw new Error(`Dépense introuvable (ID: ${id})`);
    }

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      throw new Error('Le montant de la dépense doit être supérieur à zéro.');
    }
    if (!payload.description || !payload.description.trim()) {
      throw new Error('La description du motif de la charge est obligatoire.');
    }

    // Calcul de l'ajustement du tiroir caisse
    let cashDifference = 0;
    if (existing.payment_method === 'CASH' && payload.paymentMethod === 'CASH') {
      cashDifference = payload.amount - existing.amount;
    } else if (existing.payment_method === 'CASH' && payload.paymentMethod === 'BANK') {
      cashDifference = -existing.amount;
    } else if (existing.payment_method === 'BANK' && payload.paymentMethod === 'CASH') {
      cashDifference = payload.amount;
    }

    await db.execute(
      `UPDATE expenses 
       SET category = ?, amount = ?, payment_method = ?, description = ?, date = ? 
       WHERE id = ?`,
      [
        payload.category,
        payload.amount,
        payload.paymentMethod,
        payload.description.trim(),
        payload.date,
        id
      ]
    );

    if (cashDifference !== 0) {
      await caisseService.adjustExpenseInSession(cashDifference);
    }

    return {
      ...existing,
      category: payload.category,
      amount: payload.amount,
      payment_method: payload.paymentMethod,
      description: payload.description.trim(),
      date: payload.date
    };
  }

  public async deleteExpense(id: string): Promise<void> {
    const existing = await this.getExpenseById(id);
    if (!existing) {
      throw new Error(`Dépense introuvable (ID: ${id})`);
    }

    await db.execute('DELETE FROM expenses WHERE id = ?', [id]);

    if (existing.payment_method === 'CASH') {
      await caisseService.adjustExpenseInSession(-existing.amount);
    }
  }
}

export const expenseService = ExpenseService.getInstance();
