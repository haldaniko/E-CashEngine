export type Role = 'admin';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

export interface PostInput {
  title: string;
  slug?: string;
  excerpt: string;
  contentHtml: string;
  status?: 'draft' | 'published';
  author?: string;
  tags?: string[];
  coverImage?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface Post extends Required<Omit<PostInput, 'slug' | 'status' | 'author' | 'tags' | 'coverImage' | 'seoTitle' | 'seoDescription'>> {
  id: string;
  slug: string;
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
}

export interface AdminSettings {
  masterPrompt: string;
  generationTime: string;
  generationFrequency: 'daily' | 'weekly';
  generationMode: 'daily' | 'weekly';
  generationCount: number;
  generationTimes: string[];
  generationWeekdays: number[];
  autoGenerationEnabled: boolean;
}

export interface AuthedRequestUser {
  id: string;
  email: string;
  role: Role;
}
