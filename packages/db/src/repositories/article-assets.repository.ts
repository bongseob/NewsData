import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface ArticleAssetRow extends RowDataPacket {
  id: number;
  article_id: number;
  asset_type: string;
  source_url: string | null;
  local_path: string;
  content_type: string | null;
  byte_size: number | null;
  created_at: Date;
}

export interface CreateArticleAssetInput {
  articleId: number;
  assetType: string;
  sourceUrl?: string | null;
  localPath: string;
  contentType?: string | null;
  byteSize?: number | null;
}

export class ArticleAssetsRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateArticleAssetInput): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO article_assets (
        article_id,
        asset_type,
        source_url,
        local_path,
        content_type,
        byte_size
      ) VALUES (
        :articleId,
        :assetType,
        :sourceUrl,
        :localPath,
        :contentType,
        :byteSize
      )`,
      {
        articleId: input.articleId,
        assetType: input.assetType,
        sourceUrl: input.sourceUrl ?? null,
        localPath: input.localPath,
        contentType: input.contentType ?? null,
        byteSize: input.byteSize ?? null
      }
    );
    return result.insertId;
  }
}
