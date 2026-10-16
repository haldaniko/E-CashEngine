export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  status: 'draft' | 'published';
  author: string;
  tags: string[];
  coverImage: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  source: 'admin' | 'ai' | 'legacy' | 'bot';
  categorySlug: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminSettings = {
  masterPrompt: string;
  generationTime: string;
  generationFrequency: 'daily' | 'weekly';
  generationMode: 'daily' | 'weekly';
  generationCount: number;
  generationTimes: string[];
  generationWeekdays: number[];
  autoGenerationEnabled: boolean;
};

export type Article = Post & {
  cover: string;
  category: string;
  readingTime: number;
  views: number;
};
