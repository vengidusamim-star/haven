export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  isMobile?: boolean;
  deviceScaleFactor?: number;
}

export interface InteractiveElement {
  tag: string;
  text: string;
  id: string;
  className: string;
  selector: string;
  href?: string;
  type?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DomTreeNode {
  tag: string;
  id?: string;
  className?: string;
  childCount: number;
  depth: number;
  textSnippet: string;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  statusText?: string;
  size?: number;
  duration?: number;
  startTime: number;
  endTime?: number;
  contentType?: string;
}

export interface ConsoleLog {
  id: string;
  type: string;
  text: string;
  location?: string;
  timestamp: number;
}

export interface PageMeta {
  description: string;
  ogTitle: string;
  ogImage: string;
  canonical: string;
  favicon: string;
}

export interface PageStats {
  totalElements: number;
  linksCount: number;
  imagesCount: number;
  scriptsCount: number;
  formsCount: number;
  bodyHeight: number;
  bodyWidth: number;
}

export interface PlaywrightNavigationResult {
  success: boolean;
  url: string;
  title: string;
  status: number;
  statusText: string;
  durationMs: number;
  screenshot: string;
  viewport: {
    width: number;
    height: number;
    fullPage: boolean;
  };
  meta: PageMeta;
  stats: PageStats;
  interactiveElements: InteractiveElement[];
  domTree: DomTreeNode[];
  cookiesCount: number;
  networkRequests: NetworkRequest[];
  consoleLogs: ConsoleLog[];
  scrollY?: number;
  maxScrollY?: number;
  docHeight?: number;
  message?: string;
}

export const DEVICE_PRESETS: ViewportConfig[] = [
  { name: 'Desktop (1440 × 900)', width: 1440, height: 900 },
  { name: 'Full HD (1920 × 1080)', width: 1920, height: 1080 },
  { name: 'MacBook Air (1280 × 800)', width: 1280, height: 800 },
  { name: 'iPad Pro (1024 × 1366)', width: 1024, height: 1366, isMobile: true },
  { name: 'iPhone 15 Pro (393 × 852)', width: 393, height: 852, isMobile: true },
  { name: 'Pixel 7 (412 × 915)', width: 412, height: 915, isMobile: true },
];

export const SAMPLE_URL_PRESETS = [
  {
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
    category: 'Tech & Community',
    description: 'Clean HTML text layout with voting links and comments',
  },
  {
    name: 'Quotes to Scrape',
    url: 'https://quotes.toscrape.com',
    category: 'Scraping Playground',
    description: 'Classic automation test bench with pagination and tags',
  },
  {
    name: 'Books to Scrape',
    url: 'https://books.toscrape.com',
    category: 'E-Commerce Test Site',
    description: 'Full sandbox catalog with ratings, prices, and categories',
  },
  {
    name: 'Wikipedia Main Page',
    url: 'https://en.wikipedia.org/wiki/Main_Page',
    category: 'Knowledge Base',
    description: 'Rich DOM hierarchy with media and structured portals',
  },
  {
    name: 'Example Domain (IANA)',
    url: 'https://example.com',
    category: 'Minimalist Standard',
    description: 'RFC 2606 reference domain with simple markup',
  },
  {
    name: 'HTTPBin Status Bench',
    url: 'https://httpbin.org',
    category: 'HTTP & API Testing',
    description: 'Testing tool for HTTP methods, headers, and redirects',
  },
];
