import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface FetchPresetRow extends RowDataPacket {
  id: number;
  name: string;
  source: string;
  query: string; // DB의 JSON 타입은 문자열 또는 파싱 전 상태로 매핑
  created_at: Date;
  updated_at: Date;
}

export class FetchPresetsRepository {
  constructor(private readonly db: Db) {}

  async create(name: string, source: string, query: Record<string, unknown>): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO fetch_presets (name, source, query)
       VALUES (:name, :source, :query)`,
      {
        name,
        source,
        query: JSON.stringify(query)
      }
    );
    return result.insertId;
  }

  async update(id: number, name: string, query: Record<string, unknown>): Promise<void> {
    await this.db.execute(
      `UPDATE fetch_presets
       SET name = :name,
           query = :query,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = :id`,
      {
        id,
        name,
        query: JSON.stringify(query)
      }
    );
  }

  async findById(id: number): Promise<FetchPresetRow | null> {
    const [rows] = await this.db.execute<FetchPresetRow[]>(
      `SELECT * FROM fetch_presets WHERE id = :id LIMIT 1`,
      { id }
    );
    return rows[0] ?? null;
  }

  async findAllBySource(source: string): Promise<FetchPresetRow[]> {
    const [rows] = await this.db.execute<FetchPresetRow[]>(
      `SELECT * FROM fetch_presets
       WHERE source = :source
       ORDER BY name ASC`,
      { source }
    );
    return rows;
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(
      `DELETE FROM fetch_presets WHERE id = :id`,
      { id }
    );
  }
}
