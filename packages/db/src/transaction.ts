import type { MysqlPool, MysqlConnection } from "./pool.js";

export async function withTransaction<T>(
  pool: MysqlPool,
  callback: (connection: MysqlConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
