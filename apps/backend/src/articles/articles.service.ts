import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ArticlesRepository,
  type ArticleRow,
  type ArticleStatusCountRow,
  type MysqlPool
} from "@newsdata/db";
import type { ArticleSource, ArticleStatus } from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";

export interface ListArticlesRequest {
  status?: ArticleStatus;
  source?: ArticleSource;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TranslateBodyResult {
  articleId: number;
  translatedBody: string;
  bodyTranslatedAt: Date;
}

@Injectable()
export class ArticlesService {
  constructor(@Inject(MYSQL_POOL) private readonly pool: MysqlPool) {}

  list(input: ListArticlesRequest): Promise<ArticleRow[]> {
    return new ArticlesRepository(this.pool).list(input);
  }

  count(input: ListArticlesRequest): Promise<number> {
    return new ArticlesRepository(this.pool).count(input);
  }

  countByStatus(): Promise<ArticleStatusCountRow[]> {
    return new ArticlesRepository(this.pool).countByStatus();
  }

  findById(id: number): Promise<ArticleRow | null> {
    return new ArticlesRepository(this.pool).findById(id);
  }

  async translateBody(id: number): Promise<TranslateBodyResult> {
    const repository = new ArticlesRepository(this.pool);
    const article = await repository.findById(id);
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    const sourceBody = article.original_body || article.body;
    if (!sourceBody) {
      throw new BadRequestException("번역할 원문 본문이 없습니다.");
    }

    const translatedBody = await this.translateToKorean(sourceBody);
    const translatedAt = new Date();
    await repository.updateBodyTranslation(id, translatedBody, translatedAt);

    return {
      articleId: id,
      translatedBody,
      bodyTranslatedAt: translatedAt
    };
  }

  private async translateToKorean(text: string): Promise<string> {
    const deeplApiKey = process.env.DEEPL_API_KEY;
    if (!deeplApiKey) {
      throw new BadRequestException("DEEPL_API_KEY가 설정되어 있지 않습니다.");
    }

    const isPro = !deeplApiKey.endsWith(":fx");
    const apiUrl = isPro
      ? "https://api.deepl.com/v2/translate"
      : "https://api-free.deepl.com/v2/translate";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${deeplApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: [text],
        target_lang: "KO"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`본문 번역 실패: ${errorText}`);
    }

    const data = (await response.json()) as {
      translations?: Array<{ text?: string }>;
    };
    const translated = data.translations?.[0]?.text;
    if (!translated) {
      throw new BadRequestException("본문 번역 응답에 번역문이 없습니다.");
    }

    return translated;
  }
}
