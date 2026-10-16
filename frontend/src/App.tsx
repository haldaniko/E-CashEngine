import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Clock, Eye, FilePlus, Menu, RefreshCw, Save, Search, Trash2, Wand2, X } from 'lucide-react';
import { assetUrl, getPost, getPosts, request, subscribe } from './api';
import { trackPageView } from './analytics';
import type { AdminSettings, Article, Post } from './domain';

const covers = ['/covers/cover1.png', '/covers/cover2.png', '/covers/cover3.png', '/covers/cover4.png'];
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));
const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

type DraftPost = {
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  status: 'draft' | 'published';
  tags: string;
  coverImage: string;
};

type MediaAsset = {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  builtIn?: boolean;
};

const emptyDraft: DraftPost = { title: '', slug: '', excerpt: '', contentHtml: '<h2>Introduction</h2><p></p>', status: 'published', tags: '', coverImage: '' };

function pickCover(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return covers[hash % covers.length];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

function toArticle(post: Post, index = 0): Article {
  const tag = post.source === 'bot' ? 'Online Income' : post.tags[0] || (post.source === 'ai' ? 'AI Side Hustles' : 'Online Income');
  return {
    ...post,
    cover: post.coverImage ? assetUrl(post.coverImage) : pickCover(post.slug || post.title),
    category: tag.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    readingTime: Math.max(5, Math.ceil(post.contentHtml.replace(/<[^>]+>/g, '').split(/\s+/).length / 180)),
    views: 2400 + index * 420,
  };
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('app:navigate'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function SocialIcon({ name }: { name: "x" | "threads" | "telegram" | "linkedin" }) {
  if (name === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.244 2H21.5l-7.11 8.126L22.75 22h-6.54l-5.12-6.693L5.23 22H1.97l7.605-8.692L1.55 2h6.705l4.627 6.118L18.244 2Zm-1.143 17.91h1.804L7.27 3.98H5.334L17.1 19.91Z" />
      </svg>
    );
  }
  if (name === "threads") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12.08 2C7.02 2 4 5.36 4 10.93v2.14C4 18.64 7.02 22 12.08 22c4.38 0 7.13-2.28 7.13-5.86 0-2.58-1.48-4.2-4.2-4.82-.16-2.32-1.53-3.77-3.88-3.77-1.5 0-2.76.52-3.73 1.55l1.22 1.42c.67-.7 1.46-1.05 2.37-1.05 1.1 0 1.78.62 1.94 1.74h-1.44c-2.72 0-4.41 1.3-4.41 3.38 0 2 1.55 3.3 3.94 3.3 2.35 0 3.82-1.2 4.14-3.45 1.26.45 1.9 1.24 1.9 2.37 0 2.02-1.88 3.29-4.88 3.29-3.82 0-5.99-2.48-5.99-6.9v-2.24c0-4.42 2.17-6.9 5.99-6.9 2.98 0 4.84 1.38 5.28 3.9h2.1C19.03 4.43 16.32 2 12.08 2Zm-1 13.96c-1.13 0-1.82-.52-1.82-1.36 0-.92.83-1.46 2.27-1.46h1.48c-.17 1.84-.83 2.82-1.93 2.82Z" />
      </svg>
    );
  }
  if (name === "telegram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.74 4.67 18.5 19.95c-.24 1.08-.88 1.34-1.78.84l-4.92-3.63-2.37 2.28c-.26.26-.48.48-.98.48l.35-5.02 9.13-8.25c.4-.35-.09-.55-.62-.2L6.03 13.56 1.17 12.04c-1.05-.33-1.07-1.05.22-1.55L20.4 3.16c.88-.33 1.65.2 1.34 1.51Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5ZM.33 8h4.33v14H.33V8Zm7 0h4.15v1.92h.06c.58-1.1 2-2.25 4.1-2.25 4.38 0 5.19 2.88 5.19 6.63V22H16.5v-6.82c0-1.63-.03-3.72-2.27-3.72-2.27 0-2.62 1.77-2.62 3.6V22H7.33V8Z" />
    </svg>
  );
}

function ShareBar({ title, url }: { title: string; url: string }) {
  const absoluteUrl = typeof window !== "undefined" ? new URL(url, window.location.origin).href : url;
  const shareText = `${title} ${absoluteUrl}`;
  const encodedUrl = encodeURIComponent(absoluteUrl);
  const encodedTitle = encodeURIComponent(title);
  const encodedShareText = encodeURIComponent(shareText);
  const targets = [
    { label: "X", icon: "x" as const, href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
    { label: "Threads", icon: "threads" as const, href: `https://www.threads.net/intent/post?text=${encodedShareText}` },
    { label: "Telegram", icon: "telegram" as const, href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}` },
    { label: "LinkedIn", icon: "linkedin" as const, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
  ];

  return (
    <aside className="share-bar" aria-label="Share this post">
      <span className="share-label">Share this post</span>
      <div className="share-actions">
        {targets.map((target) => (
          <a key={target.label} className="share-link" href={target.href} target="_blank" rel="noreferrer" aria-label={`Share on ${target.label}`}>
            <SocialIcon name={target.icon} />
            <span>{target.label}</span>
          </a>
        ))}
      </div>
    </aside>
  );
}


function Header() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '/', label: 'Home' },
    { href: '/articles', label: 'Articles' },
  ];

  return (
    <header className="site-header">
      <div className="header-frame">
        <button className="brand-button" onClick={() => navigate('/')} aria-label="e-CashEngine home">
          <span className="logo-mark">
            <img src="/logo.png" alt="" />
          </span>
          <span className="brand-copy">
            <strong>e-CashEngine</strong>
            <small>Online income intelligence</small>
          </span>
        </button>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {links.map((link) => (
            <button key={link.href} onClick={() => navigate(link.href)}>{link.label}</button>
          ))}
        </nav>

        <div className="header-signal" aria-label="Editorial signal">
          <span />
          <strong>2026 Playbooks</strong>
        </div>

        <button className="icon-button mobile-only" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>

        {open && (
          <div className="mobile-menu">
            {links.map((link) => (
              <button key={link.href} onClick={() => { setOpen(false); navigate(link.href); }}>{link.label}</button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function ArticleCover({ article }: { article: Article }) {
  return (
    <div className="article-cover">
      <img src={article.cover} alt="" />
      <div>
        <span>{article.category}</span>
        <strong>{article.title}</strong>
      </div>
    </div>
  );
}

function Hero({ article }: { article: Article }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Daily income guide</p>
        <h1>{article.title}</h1>
        <p>{article.excerpt}</p>
        <button className="primary-action" onClick={() => navigate(`/articles/${article.slug}`)}>
          Read the income plan <ArrowRight size={20} />
        </button>
        <div className="hero-stats">
          <span><strong>{article.readingTime}</strong> min read</span>
          <span><strong>{article.views.toLocaleString()}</strong> readers</span>
        </div>
      </div>
      <div className="hero-card">
        <ArticleCover article={article} />
        <div className="hero-card-body">
          <span>{article.category}</span>
          <h2>{article.title}</h2>
          <p>{article.excerpt}</p>
          <small><BookOpen size={16} /> Written by Irina Vovk for ethical online earners</small>
        </div>
      </div>
    </section>
  );
}

function ArticleGrid({ articles }: { articles: Article[] }) {
  return (
    <div className="article-grid">
      {articles.map((article) => (
        <article
          className="article-card"
          key={article.id}
          role="link"
          tabIndex={0}
          onClick={() => navigate(`/articles/${article.slug}`)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              navigate(`/articles/${article.slug}`);
            }
          }}
        >
          <ArticleCover article={article} />
          <div className="article-card-body">
            <span className="category-pill">{article.category}</span>
            <h3>{article.title}</h3>
            <p>{article.excerpt}</p>
            <footer>
              <span><Clock size={14} /> {article.readingTime} min</span>
              <span><Eye size={14} /> {article.views.toLocaleString()}</span>
            </footer>
          </div>
        </article>
      ))}
    </div>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await subscribe(email);
      setEmail('');
      setMessage('You are subscribed. Fresh income guides are on the way.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not subscribe right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="newsletter-panel" onSubmit={submit}>
      <div>
        <p className="eyebrow">Newsletter</p>
        <h2>Get practical online income guides</h2>
      </div>
      <label>
        <span>Email</span>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" required />
      </label>
      <button disabled={busy}>{busy ? 'Subscribing...' : 'Subscribe'}</button>
      {message && <p className="form-message">{message}</p>}
    </form>
  );
}

function HomePage({ articles }: { articles: Article[] }) {
  const featured = articles[0];
  return (
    <main className="page-shell">
      {featured && <Hero article={featured} />}
      <section className="section-head">
        <p className="eyebrow">Latest strategies</p>
        <h2>Build useful, ethical online income streams</h2>
        <p>No overnight-rich promises. Just focused guides for affiliate content, AI services, freelancing, ecommerce, and digital products.</p>
      </section>
      <ArticleGrid articles={articles.slice(0, 6)} />
      <Newsletter />
    </main>
  );
}

function ArticlesPage({ articles, initialQuery = '' }: { articles: Article[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return articles;
    return articles.filter((article) => [article.title, article.excerpt, article.category, ...article.tags].join(' ').toLowerCase().includes(q));
  }, [articles, query]);

  return (
    <main className="page-shell">
      <section className="section-head">
        <p className="eyebrow">All articles</p>
        <h1>Online income library</h1>
        <p>Browse practical playbooks for building skills, assets, and reader trust online.</p>
      </section>
      <label className="wide-search">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search affiliate, AI, freelancing..." />
      </label>
      <ArticleGrid articles={filtered} />
    </main>
  );
}

function ArticlePage({ article }: { article?: Article }) {
  if (!article) {
    return (
      <main className="page-shell">
        <section className="section-head"><h1>Article not found</h1><p>The guide you requested is not available.</p></section>
      </main>
    );
  }
  return (
    <main className="article-page">
      <p className="eyebrow">{article.category}</p>
      <h1>{article.title}</h1>
      <p className="article-lead">{article.excerpt}</p>
      <ArticleCover article={article} />
      <ShareBar title={article.title} url={`/articles/${article.slug}`} />
      <div className="article-content" dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
      <button className="secondary-action" onClick={() => navigate('/articles')}>Back to all articles</button>
    </main>
  );
}

function AdminPanel() {
  const [email, setEmail] = useState('admin@ecashengine.local');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [coverImages, setCoverImages] = useState<MediaAsset[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingSlug, setEditingSlug] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [generatingCount, setGeneratingCount] = useState<1 | 3 | null>(null);

  async function load(nextToken = token) {
    const [loadedPosts, loadedSettings, loadedMedia] = await Promise.all([
      request<Post[]>('/api/admin/posts', {}, nextToken),
      request<AdminSettings>('/api/admin/settings', {}, nextToken),
      request<MediaAsset[]>('/api/admin/media/covers', {}, nextToken),
    ]);
    setPosts(loadedPosts);
    setSettings(loadedSettings);
    setCoverImages(loadedMedia);
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await request<{ accessToken: string; csrfToken: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(data.accessToken);
      setCsrfToken(data.csrfToken);
      await load(data.accessToken);
      setMessage('Signed in.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  async function savePost(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...draft,
        tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        coverImage: draft.coverImage || undefined,
      };
      await request<Post>(editingSlug ? `/api/admin/posts/${editingSlug}` : '/api/admin/posts', {
        method: editingSlug ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      }, token);
      setDraft(emptyDraft);
      setEditingSlug('');
      await load();
      setMessage('Article saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save article.');
    } finally {
      setBusy(false);
    }
  }

  async function removePost(slug: string) {
    await request(`/api/admin/posts/${slug}`, { method: 'DELETE' }, token);
    await load();
  }

  async function generateNow(count: 1 | 3) {
    setBusy(true);
    setGeneratingCount(count);
    setMessage(`Generating ${count} article${count === 1 ? '' : 's'} with OpenRouter. This can take 20-90 seconds...`);
    try {
      let nextToken = token;
      if (csrfToken) {
        try {
          const refreshed = await request<{ accessToken: string }>('/api/auth/refresh', { method: 'POST' }, undefined, csrfToken);
          nextToken = refreshed.accessToken;
          setToken(refreshed.accessToken);
        } catch {
          nextToken = token;
        }
      }
      const generated = await request<Post[]>('/api/ai/generate-article', { method: 'POST', body: JSON.stringify({ count }) }, nextToken);
      await load();
      setMessage(`${generated.length || 0} generated article${generated.length === 1 ? '' : 's'} saved.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Generation failed.';
      if (text.toLowerCase().includes('session') || text.toLowerCase().includes('admin session')) {
        setToken('');
        setMessage('Session expired. Please sign in again.');
      } else {
        setMessage(text);
      }
    } finally {
      setBusy(false);
      setGeneratingCount(null);
    }
  }

  async function refreshSession() {
    const data = await request<{ accessToken: string }>('/api/auth/refresh', { method: 'POST' }, undefined, csrfToken);
    setToken(data.accessToken);
    await load(data.accessToken);
  }

  async function saveSettings() {
    if (!settings) return;
    await request<AdminSettings>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }, token);
    setMessage('Settings saved.');
  }

  function updateGenerationCount(count: number) {
    if (!settings) return;
    const safeCount = Math.min(12, Math.max(1, count || 1));
    const currentTimes = settings.generationTimes?.length ? settings.generationTimes : [settings.generationTime || '08:00'];
    const nextTimes = Array.from({ length: safeCount }, (_, index) => currentTimes[index] || currentTimes[currentTimes.length - 1] || '08:00');
    setSettings({
      ...settings,
      generationCount: safeCount,
      generationTimes: nextTimes,
      generationTime: nextTimes[0],
    });
  }

  function updateGenerationTime(index: number, value: string) {
    if (!settings) return;
    const nextTimes = [...(settings.generationTimes?.length ? settings.generationTimes : [settings.generationTime || '08:00'])];
    nextTimes[index] = value;
    setSettings({
      ...settings,
      generationTimes: nextTimes,
      generationTime: nextTimes[0],
      generationCount: nextTimes.length,
    });
  }

  function updateGenerationTimePart(index: number, part: 'hour' | 'minute', value: string) {
    if (!settings) return;
    const currentTime = (settings.generationTimes?.length ? settings.generationTimes : [settings.generationTime || '08:00'])[index] || '08:00';
    const [currentHour = '08', currentMinute = '00'] = currentTime.split(':');
    updateGenerationTime(index, part === 'hour' ? `${value}:${currentMinute}` : `${currentHour}:${value}`);
  }

  async function uploadCoverImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      const asset = await request<MediaAsset>('/api/admin/media/covers', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, dataUrl: await readFileAsDataUrl(file) }),
      }, token);
      setCoverImages((current) => [asset, ...current]);
      setDraft((current) => ({ ...current, coverImage: asset.url }));
      setMessage('Cover image uploaded.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCoverImage(asset: MediaAsset) {
    if (asset.builtIn) return;
    setBusy(true);
    try {
      await request(`/api/admin/media/covers/${encodeURIComponent(asset.name)}`, { method: 'DELETE' }, token);
      setCoverImages((current) => current.filter((item) => item.name !== asset.name));
      if (draft.coverImage === asset.url) setDraft((current) => ({ ...current, coverImage: '' }));
      setMessage('Cover image deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  function toggleWeekday(day: number) {
    if (!settings) return;
    const current = settings.generationWeekdays || [];
    const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day];
    setSettings({ ...settings, generationWeekdays: next.length ? next.sort() : [1] });
  }

  if (!token) {
    return (
      <main className="admin-page">
        <form className="admin-login" onSubmit={signIn}>
          <h1>Admin sign in</h1>
          <label><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button disabled={busy}>Sign in</button>
          {message && <p className="form-message">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-toolbar">
        <h1>Publishing admin</h1>
        <button onClick={refreshSession}><RefreshCw size={16} /> Refresh</button>
        <button onClick={() => generateNow(1)} disabled={busy}><Wand2 size={16} /> {generatingCount === 1 ? 'Generating 1...' : 'Generate 1 now'}</button>
        <button onClick={() => generateNow(3)} disabled={busy}><Wand2 size={16} /> {generatingCount === 3 ? 'Generating 3...' : 'Generate 3 now'}</button>
      </header>
      {message && <p className="form-message">{message}</p>}
      <section className="admin-grid">
        <form className="editor-panel" onSubmit={savePost}>
          <h2>{editingSlug ? 'Edit article' : 'Create article'}</h2>
          <label><span>Title</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
          <label><span>Slug</span><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></label>
          <label><span>Excerpt</span><textarea value={draft.excerpt} onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })} required /></label>
          <label><span>HTML content</span><textarea rows={10} value={draft.contentHtml} onChange={(event) => setDraft({ ...draft, contentHtml: event.target.value })} required /></label>
          <label><span>Tags</span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="affiliate marketing, AI side hustles" /></label>
          <label><span>Cover image URL</span><input value={draft.coverImage} onChange={(event) => setDraft({ ...draft, coverImage: event.target.value })} placeholder="/covers/cover1.png or /uploads/covers/..." /></label>
          <section className="media-panel">
            <div className="media-panel-head">
              <h3>Cover images</h3>
              <label className="upload-button">
                Upload image
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadCoverImage} disabled={busy} />
              </label>
            </div>
            <div className="media-grid">
              {coverImages.map((asset) => (
                <article key={asset.name} className="media-card">
                  <img src={assetUrl(asset.url)} alt="" />
                  <div>
                    <strong>{asset.name}</strong>
                    <small>{asset.builtIn ? 'Included' : `${Math.round(asset.size / 1024)} KB`}</small>
                  </div>
                  <button type="button" onClick={() => setDraft({ ...draft, coverImage: asset.url })}>Use</button>
                  {asset.builtIn ? <span>Built-in</span> : <button type="button" onClick={() => deleteCoverImage(asset)} disabled={busy}>Delete</button>}
                </article>
              ))}
            </div>
          </section>
          <button disabled={busy}><Save size={16} /> Save article</button>
        </form>
        <section className="admin-list">
          <h2>Articles</h2>
          {posts.map((post) => (
            <article key={post.id}>
              <div><strong>{post.title}</strong><small>{post.slug}</small></div>
              <button onClick={() => {
                setEditingSlug(post.slug);
                setDraft({ title: post.title, slug: post.slug, excerpt: post.excerpt, contentHtml: post.contentHtml, status: post.status, tags: post.tags.join(', '), coverImage: post.coverImage || '' });
              }}><FilePlus size={16} /> Edit</button>
              <button onClick={() => removePost(post.slug)}><Trash2 size={16} /> Delete</button>
            </article>
          ))}
        </section>
      </section>
      {settings && (
        <section className="settings-panel">
          <h2>AI generation settings</h2>
          <label><span>Master prompt</span><textarea rows={7} value={settings.masterPrompt} onChange={(event) => setSettings({ ...settings, masterPrompt: event.target.value })} /></label>
          <div className="settings-row">
            <label>
              <span>Schedule mode</span>
              <select value={settings.generationMode || settings.generationFrequency} onChange={(event) => setSettings({ ...settings, generationMode: event.target.value as 'daily' | 'weekly', generationFrequency: event.target.value as 'daily' | 'weekly' })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label>
              <span>How many times</span>
              <input type="number" min={1} max={12} value={settings.generationCount || 1} onChange={(event) => updateGenerationCount(Number(event.target.value))} />
            </label>
          </div>
          <div>
            <span className="field-title">Generation times</span>
            <div className="time-grid">
              {(settings.generationTimes?.length ? settings.generationTimes : [settings.generationTime || '08:00']).slice(0, settings.generationCount || 1).map((time, index) => (
                <label key={`${index}-${time}`}>
                  <span>Run {index + 1}</span>
                  <div className="time-select-row">
                    <select value={(time.split(':')[0] || '08').padStart(2, '0')} onChange={(event) => updateGenerationTimePart(index, 'hour', event.target.value)}>
                      {hourOptions.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                    </select>
                    <select value={(time.split(':')[1] || '00').padStart(2, '0')} onChange={(event) => updateGenerationTimePart(index, 'minute', event.target.value)}>
                      {minuteOptions.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
                    </select>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {(settings.generationMode || settings.generationFrequency) === 'weekly' && (
            <div>
              <span className="field-title">Weekdays</span>
              <div className="weekday-grid">
                {weekdays.map((day) => (
                  <label key={day.value} className="weekday-option">
                    <input type="checkbox" checked={(settings.generationWeekdays || [1]).includes(day.value)} onChange={() => toggleWeekday(day.value)} />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="checkbox"><input type="checkbox" checked={settings.autoGenerationEnabled} onChange={(event) => setSettings({ ...settings, autoGenerationEnabled: event.target.checked })} /> Auto generation enabled</label>
          <button onClick={saveSettings}><Save size={16} /> Save settings</button>
        </section>
      )}
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => `${window.location.pathname}${window.location.search}`);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const syncRoute = () => setRoute(`${window.location.pathname}${window.location.search}`);
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('app:navigate', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('app:navigate', syncRoute);
    };
  }, []);

  useEffect(() => {
    getPosts().then(setPosts).catch((err) => setError(err instanceof Error ? err.message : 'Could not load articles.'));
  }, []);

  useEffect(() => {
    trackPageView(window.location.pathname);
  }, [route]);

  const articles = posts.map(toArticle);
  const [path] = route.split('?');
  const searchParams = new URLSearchParams(route.includes('?') ? route.slice(route.indexOf('?')) : '');
  const initialSearch = searchParams.get('search') || '';
  const slug = path.startsWith('/articles/') ? decodeURIComponent(path.replace('/articles/', '')) : '';
  const article = slug ? articles.find((item) => item.slug === slug) : undefined;

  useEffect(() => {
    if (!slug || article || posts.length === 0) return;
    getPost(slug).then((post) => setPosts((current) => current.some((item) => item.slug === post.slug) ? current : [post, ...current])).catch(() => undefined);
  }, [slug, article, posts.length]);

  return (
    <>
      <Header />
      {error && <div className="load-error">{error}</div>}
      {path === '/admin' ? <AdminPanel /> : path === '/articles' ? <ArticlesPage articles={articles} initialQuery={initialSearch} /> : slug ? <ArticlePage article={article} /> : <HomePage articles={articles} />}
    </>
  );
}
