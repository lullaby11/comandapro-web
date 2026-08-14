-- Rol de reparto. Se añade al enum existente; los valores nuevos de un enum no se pueden
-- usar en la misma transacción en la que se crean, pero aquí no se usa: solo se declara.
ALTER TYPE "Role" ADD VALUE 'DELIVERY';

-- Repartidor asignado al pedido. Nullable: los pedidos existentes quedan sin asignar, y
-- los de recogida no se asignan nunca.
ALTER TABLE "orders" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- ON DELETE SET NULL: si se borra la cuenta de un repartidor, el pedido conserva su
-- histórico y simplemente queda sin asignar. Borrar un usuario no debe borrar pedidos.
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La pantalla del repartidor pregunta «mis pedidos activos de este local» en cada refresco
CREATE INDEX "orders_businessId_assignedToId_status_idx"
  ON "orders"("businessId", "assignedToId", "status");
