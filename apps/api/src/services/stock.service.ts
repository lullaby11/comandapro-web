import { prisma } from '../prisma/client';
import { Prisma } from '@prisma/client';

export interface StockItem {
  productId: string;
  quantity: number;
}

export interface StockValidationResult {
  valid: boolean;
  errors: Array<{ productId: string; productName: string; available: number; requested: number }>;
}

/**
 * Valida que todos los productos tengan stock suficiente.
 * No modifica el stock.
 */
export async function validateStock(
  businessId: string,
  items: StockItem[]
): Promise<StockValidationResult> {
  const productIds = items.map((i) => i.productId);

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId, active: true },
    select: { id: true, name: true, stock: true },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));
  const errors: StockValidationResult['errors'] = [];

  for (const item of items) {
    const product = productMap.get(item.productId);

    if (!product) {
      errors.push({
        productId: item.productId,
        productName: 'Producto no encontrado',
        available: 0,
        requested: item.quantity,
      });
      continue;
    }

    if (product.stock < item.quantity) {
      errors.push({
        productId: item.productId,
        productName: product.name,
        available: product.stock,
        requested: item.quantity,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Descuenta stock de forma atómica dentro de una transacción Prisma.
 * Debe llamarse SOLO después de validateStock() con éxito.
 * Lanza error si el stock es insuficiente (race condition protection).
 */
export async function deductStock(
  tx: Prisma.TransactionClient,
  businessId: string,
  items: StockItem[]
): Promise<void> {
  for (const item of items) {
    const result = await tx.$executeRaw`
      UPDATE products
      SET stock = stock - ${item.quantity}, "updatedAt" = NOW()
      WHERE id = ${item.productId}
        AND "businessId" = ${businessId}
        AND stock >= ${item.quantity}
    `;

    if (result === 0) {
      // Si no se actualizó ninguna fila, el stock era insuficiente (race condition)
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { name: true },
      });
      throw new Error(
        `Stock insuficiente para: ${product?.name ?? item.productId}`
      );
    }
  }
}

/**
 * Restaura stock al cancelar un pedido.
 */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  items: StockItem[]
): Promise<void> {
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }
}
