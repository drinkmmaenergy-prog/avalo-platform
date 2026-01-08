# Web SEO Checklist — Avalo

**Version:** 1.0  
**Last Updated:** 2025-12-09  
**Purpose:** Define baseline SEO requirements and implementation guidelines for Avalo web application (Next.js/React).

---

## 1. SEO Fundamentals

### 1.1 Core Principles
- **Content Quality:** Authentic, valuable content that serves user needs
- **Technical SEO:** Fast, accessible, crawlable site structure
- **User Experience:** Mobile-friendly, secure (HTTPS), intuitive navigation
- **Authority:** Quality backlinks, social signals, brand mentions

### 1.2 Target Keywords
**Primary Keywords:**
- Dating app
- 18+ dating
- Social earnings
- Verified dating
- Video chat dating
- Creator economy dating

**Long-tail Keywords:**
- Dating app with earnings
- Safe verified dating platform
- 18+ social monetization
- Meet and earn tokens
- Dating app for creators

---

## 2. Page-Level SEO

### 2.1 Title Tags

**Format:** `Primary Keyword | Brand Name`

**Guidelines:**
- **Length:** 50-60 characters (optimal display)
- **Unique:** Every page must have unique title
- **Keyword placement:** Important keywords at the beginning
- **Brand consistency:** Include "Avalo" in every title

**Examples:**

**Homepage:**
```html
<title>Avalo — Dating App with Real Earnings | 18+ Verified Community</title>
```

**Features Page:**
```html
<title>Features — Video Chat, Meetings & Earnings | Avalo Dating</title>
```

**Safety Page:**
```html
<title>Safety & Verification — Secure 18+ Dating | Avalo</title>
```

**Pricing Page:**
```html
<title>Token Packages & Pricing | Avalo Dating & Earnings</title>
```

**About Page:**
```html
<title>About Avalo — Redefining Dating & Social Monetization</title>
```

### 2.2 Meta Descriptions

**Guidelines:**
- **Length:** 150-160 characters (optimal display)
- **Unique:** Every page must have unique description
- **Compelling:** Include call-to-action
- **Keyword-rich:** Natural inclusion of target keywords

**Examples:**

**Homepage:**
```html
<meta name="description" content="Join Avalo, the 18+ dating app where real connections lead to real earnings. Verified profiles, video chat, 1-on-1 meetings, and token-based rewards. Safe, transparent, authentic." />
```

**Features Page:**
```html
<meta name="description" content="Discover Avalo's features: smart matching, monetized chat, video calls, calendar bookings, group events, and creator earnings. Dating that respects your time." />
```

**Safety Page:**
```html
<meta name="description" content="Safety is our priority. Avalo features age verification, selfie checks, panic buttons, content moderation, and 24/7 support. 18+ verified dating community." />
```

### 2.3 Canonical URLs

**Purpose:** Prevent duplicate content issues

**Implementation:**
```html
<link rel="canonical" href="https://avalo.app/features" />
```

**Rules:**
- Every page must have canonical tag
- Point to the preferred version of the page
- Use absolute URLs (include https://)
- Avoid parameters unless necessary (e.g., ?ref=social)

---

## 3. Open Graph Tags (Social Sharing)

### 3.1 Required OG Tags

**Every page must include:**

```html
<meta property="og:type" content="website" />
<meta property="og:url" content="https://avalo.app/" />
<meta property="og:title" content="Avalo — Dating App with Real Earnings" />
<meta property="og:description" content="18+ dating platform where connections turn into earnings. Verified profiles, video chat, meetings, and token rewards." />
<meta property="og:image" content="https://avalo.app/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:site_name" content="Avalo" />
<meta property="og:locale" content="en_US" />
```

### 3.2 Twitter Card Tags

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@AvaloApp" />
<meta name="twitter:creator" content="@AvaloApp" />
<meta name="twitter:title" content="Avalo — Dating App with Real Earnings" />
<meta name="twitter:description" content="18+ dating platform where connections turn into earnings. Verified, safe, transparent." />
<meta name="twitter:image" content="https://avalo.app/twitter-image.jpg" />
```

### 3.3 OG Image Specifications

**Dimensions:** 1200x630 px (optimal for all platforms)  
**Format:** JPG or PNG  
**Max Size:** 8 MB (aim for <300 KB)

**Content Guidelines:**
- Include Avalo branding
- Use high-quality, safe-for-work imagery
- Add text overlay with key message
- Test on multiple platforms (Facebook, Twitter, LinkedIn)

---

## 4. Structured Data (Schema.org)

### 4.1 Organization Schema

**Placement:** Homepage

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Avalo",
  "url": "https://avalo.app",
  "logo": "https://avalo.app/logo.png",
  "description": "18+ dating app with earning opportunities. Verified profiles, video chat, meetings, and token-based economy.",
  "sameAs": [
    "https://twitter.com/AvaloApp",
    "https://instagram.com/avaloapp",
    "https://facebook.com/avaloapp"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "support@avalo.app",
    "contactType": "Customer Support",
    "availableLanguage": ["English", "Polish", "German"]
  }
}
```

### 4.2 WebApplication Schema

**Placement:** Homepage or Features page

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Avalo",
  "url": "https://avalo.app",
  "applicationCategory": "SocialNetworkingApplication",
  "operatingSystem": "Web, iOS, Android",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "PLN",
    "description": "Free to download with optional in-app token purchases"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "1200"
  }
}
```

### 4.3 FAQ Schema (if FAQ page exists)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Avalo?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Avalo is an 18+ dating and social platform where users can meet verified people and earn tokens through authentic interactions."
      }
    },
    {
      "@type": "Question",
      "name": "How do I earn on Avalo?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Creators earn tokens through paid chat, video calls, 1-on-1 meetings, and group events. Payouts are 0.20 PLN per token."
      }
    }
  ]
}
```

---

## 5. Robots.txt

**Location:** `/public/robots.txt`

```txt
# Avalo Robots.txt
User-agent: *

# Allow public marketing pages
Allow: /
Allow: /features
Allow: /safety
Allow: /pricing
Allow: /about
Allow: /faq
Allow: /legal/terms
Allow: /legal/privacy
Allow: /blog/

# Disallow app-internal pages
Disallow: /app/
Disallow: /feed/
Disallow: /chat/
Disallow: /profile/
Disallow: /discover/
Disallow: /wallet/
Disallow: /settings/
Disallow: /admin/

# Disallow API endpoints
Disallow: /api/

# Disallow authentication pages
Disallow: /login
Disallow: /signup
Disallow: /reset-password

# Disallow search result pages
Disallow: /search?*

# Sitemap
Sitemap: https://avalo.app/sitemap.xml
```

---

## 6. Sitemap.xml

**Location:** `/public/sitemap.xml`

### 6.1 Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  
  <!-- Homepage -->
  <url>
    <loc>https://avalo.app/</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="en" href="https://avalo.app/" />
    <xhtml:link rel="alternate" hreflang="pl" href="https://avalo.app/pl" />
  </url>
  
  <!-- Features -->
  <url>
    <loc>https://avalo.app/features</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Safety -->
  <url>
    <loc>https://avalo.app/safety</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Pricing -->
  <url>
    <loc>https://avalo.app/pricing</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- About -->
  <url>
    <loc>https://avalo.app/about</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <!-- FAQ -->
  <url>
    <loc>https://avalo.app/faq</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <!-- Legal -->
  <url>
    <loc>https://avalo.app/legal/terms</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <url>
    <loc>https://avalo.app/legal/privacy</loc>
    <lastmod>2025-12-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>

</urlset>
```

### 6.2 Dynamic Sitemap Generation (Next.js)

For blog or frequently updated content, generate sitemap dynamically:

**File:** `app/sitemap.ts` (Next.js 13+ App Router)

```typescript
import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://avalo.app';
  
  // Static routes
  const routes = [
    '',
    '/features',
    '/safety',
    '/pricing',
    '/about',
    '/faq',
    '/legal/terms',
    '/legal/privacy',
  ].map(route => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: route === '' ? 1.0 : 0.7,
  }));

  // TODO: Add dynamic blog posts when blog is implemented
  // const posts = await getBlogPosts();
  // const blogRoutes = posts.map(post => ({
  //   url: `${baseUrl}/blog/${post.slug}`,
  //   lastModified: new Date(post.updatedAt),
  //   changeFrequency: 'weekly' as const,
  //   priority: 0.6,
  // }));

  return [...routes];
}
```

---

## 7. Localization & Hreflang

### 7.1 Hreflang Implementation

**Purpose:** Tell search engines about language/regional variations

**Example:**
```html
<link rel="alternate" hreflang="en" href="https://avalo.app/" />
<link rel="alternate" hreflang="pl" href="https://avalo.app/pl" />
<link rel="alternate" hreflang="de" href="https://avalo.app/de" />
<link rel="alternate" hreflang="x-default" href="https://avalo.app/" />
```

### 7.2 URL Structure for Localization

**Option 1: Subdirectories (Recommended)**
- English (default): `https://avalo.app/`
- Polish: `https://avalo.app/pl/`
- German: `https://avalo.app/de/`

**Option 2: Subdomains**
- English: `https://en.avalo.app/`
- Polish: `https://pl.avalo.app/`
- German: `https://de.avalo.app/`

### 7.3 Localized Metadata

Each language version must have:
- Translated title tags
- Translated meta descriptions
- Translated OG tags
- Proper hreflang tags pointing to all versions

---

## 8. Technical SEO

### 8.1 Page Speed

**Target Metrics (Core Web Vitals):**
- **LCP (Largest Contentful Paint):** <2.5s
- **FID (First Input Delay):** <100ms
- **CLS (Cumulative Layout Shift):** <0.1

**Optimization Strategies:**
- Image optimization (WebP, lazy loading)
- Code splitting and lazy loading
- CDN for static assets
- Server-side rendering (SSR) for public pages
- Minimize JavaScript bundle size
- Use Next.js Image component

### 8.2 Mobile Responsiveness

**Requirements:**
- Responsive design for all screen sizes
- Touch-friendly buttons (min 48x48px)
- Readable font sizes (min 16px body text)
- No horizontal scrolling
- Fast mobile load times (<3s)

**Test Tools:**
- Google Mobile-Friendly Test
- Chrome DevTools Device Mode
- Real device testing (iOS Safari, Android Chrome)

### 8.3 HTTPS & Security

**Required:**
- [ ] All pages served over HTTPS
- [ ] Valid SSL certificate
- [ ] HTTPS redirects for HTTP requests
- [ ] Secure headers (CSP, HSTS, X-Frame-Options)
- [ ] No mixed content warnings

### 8.4 URL Structure

**Best Practices:**
- Use hyphens, not underscores: `/features` not `/features_page`
- Lowercase URLs: `/about` not `/About`
- Descriptive, keyword-rich: `/safety-verification` not `/page2`
- Avoid parameters when possible: `/blog/seo-tips` not `/blog?id=123`
- Keep URLs short and readable

---

## 9. Next.js Implementation

### 9.1 Metadata API (Next.js 13+ App Router)

**File:** `app/layout.tsx` (Root layout)

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://avalo.app'),
  title: {
    default: 'Avalo — Dating App with Real Earnings',
    template: '%s | Avalo'
  },
  description: '18+ dating platform where connections turn into earnings. Verified profiles, video chat, meetings, and token rewards.',
  keywords: ['dating app', '18+ dating', 'social earnings', 'verified dating', 'video chat', 'creator economy'],
  authors: [{ name: 'Avalo Team' }],
  creator: 'Avalo',
  publisher: 'Avalo',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://avalo.app',
    siteName: 'Avalo',
    title: 'Avalo — Dating App with Real Earnings',
    description: '18+ dating platform where connections turn into earnings.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Avalo Dating App',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@AvaloApp',
    creator: '@AvaloApp',
    title: 'Avalo — Dating App with Real Earnings',
    description: '18+ dating platform where connections turn into earnings.',
    images: ['/twitter-image.jpg'],
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};
```

### 9.2 Page-Specific Metadata

**File:** `app/features/page.tsx`

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features — Video Chat, Meetings & Earnings',
  description: 'Discover Avalo's features: smart matching, monetized chat, video calls, calendar bookings, group events, and creator earnings.',
  openGraph: {
    title: 'Avalo Features — Everything You Need',
    description: 'Smart matching, monetized chat, video calls, and more.',
    url: 'https://avalo.app/features',
    images: ['/og-features.jpg'],
  },
};

export default function FeaturesPage() {
  return (
    <div>
      {/* Page content */}
    </div>
  );
}
```

### 9.3 Dynamic Metadata (for blog posts, etc.)

```typescript
import type { Metadata } from 'next';

type Props = {
  params: { slug: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Fetch post data
  const post = await getPost(params.slug);
  
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author],
      images: [post.coverImage],
    },
  };
}
```

---

## 10. Internal Linking Strategy

### 10.1 Navigation Structure
- Clear, logical hierarchy
- Homepage → Main sections → Subsections
- Maximum 3 clicks to any page

### 10.2 Footer Links
Include in every page footer:
- Features
- Safety
- Pricing
- About
- FAQ
- Blog (if exists)
- Terms of Service
- Privacy Policy
- Contact/Support

### 10.3 Contextual Links
- Link related content naturally
- Use descriptive anchor text: "learn about safety features" not "click here"
- Link to deeper pages from homepage

---

## 11. Content Guidelines

### 11.1 Content Quality
- **Original:** No duplicate content from other sites
- **Valuable:** Solve user problems, answer questions
- **Comprehensive:** Cover topics thoroughly
- **Updated:** Keep content fresh and accurate
- **Engaging:** Use headings, lists, images

### 11.2 Heading Structure
```html
<h1>One H1 per page (main topic)</h1>
  <h2>Major section</h2>
    <h3>Subsection</h3>
    <h3>Subsection</h3>
  <h2>Major section</h2>
    <h3>Subsection</h3>
```

### 11.3 Image Optimization
- Use Next.js `<Image>` component
- Provide alt text for all images
- Use descriptive filenames: `avalo-video-chat.jpg` not `img123.jpg`
- Optimize file sizes (<100KB per image when possible)
- Use modern formats (WebP, AVIF)
- Lazy load images below the fold

---

## 12. Analytics & Monitoring

### 12.1 Google Search Console
- [ ] Verify domain ownership
- [ ] Submit sitemap
- [ ] Monitor coverage (indexed pages)
- [ ] Check for crawl errors
- [ ] Review performance (queries, clicks, impressions)
- [ ] Set up email alerts for critical issues

### 12.2 Google Analytics (GA4)
- [ ] Install tracking code
- [ ] Set up conversion goals
- [ ] Track key events (signups, purchases)
- [ ] Monitor traffic sources
- [ ] Analyze user behavior

### 12.3 Performance Monitoring
- [ ] Core Web Vitals tracking
- [ ] PageSpeed Insights regular checks
- [ ] Lighthouse audits (aim for 90+ scores)
- [ ] Real user monitoring (RUM)

---

## 13. Pre-Launch SEO Checklist

### 13.1 On-Page SEO
- [ ] Unique title tags on all public pages
- [ ] Unique meta descriptions on all public pages
- [ ] Canonical tags on all pages
- [ ] Open Graph tags on all pages
- [ ] Twitter Card tags on all pages
- [ ] Structured data (Organization, WebApplication)
- [ ] Proper heading hierarchy (H1, H2, H3)
- [ ] Descriptive alt text on all images
- [ ] Internal linking structure
- [ ] Hreflang tags for multi-language

### 13.2 Technical SEO
- [ ] Robots.txt configured
- [ ] Sitemap.xml generated and submitted
- [ ] HTTPS enabled with valid certificate
- [ ] 301 redirects for HTTP → HTTPS
- [ ] 404 page customized
- [ ] Page speed optimized (Core Web Vitals)
- [ ] Mobile responsive
- [ ] No broken links
- [ ] No duplicate content

### 13.3 Tools Setup
- [ ] Google Search Console verified
- [ ] Google Analytics installed
- [ ] Bing Webmaster Tools (optional)
- [ ] Schema markup validated (schema.org validator)

---

## 14. Post-Launch Monitoring

### 14.1 Weekly Tasks
- Review Search Console for new errors
- Check for new backlinks
- Monitor keyword rankings
- Analyze top landing pages
- Review user behavior in GA

### 14.2 Monthly Tasks
- Update sitemap if content added
- Content audit and refresh old pages
- Competitive SEO analysis
- Technical SEO audit (Lighthouse)
- Link building outreach

### 14.3 Quarterly Tasks
- Comprehensive SEO audit
- Update keyword strategy
- Review and optimize underperforming pages
- Schema markup review and updates

---

## 15. Common Issues & Solutions

### 15.1 Pages Not Indexed
**Symptoms:** Pages not appearing in Google search results

**Solutions:**
- Check robots.txt isn't blocking
- Verify page is in sitemap
- Submit URL in Search Console
- Ensure page is linked from other pages
- Check for noindex tag (remove if present)

### 15.2 Slow Page Speed
**Symptoms:** Low scores in PageSpeed Insights

**Solutions:**
- Optimize images (compress, use WebP)
- Enable compression (gzip/brotli)
- Minimize JavaScript
- Use CDN
- Implement code splitting
- Reduce server response time

### 15.3 Duplicate Content
**Symptoms:** Same content on multiple URLs

**Solutions:**
- Use canonical tags
- 301 redirect duplicates to primary version
- Avoid query parameters for same content
- Use consistent URL structure

---

## End of SEO Checklist

This checklist provides baseline SEO implementation for Avalo's web presence. SEO is an ongoing process that requires regular monitoring, updates, and optimization based on performance data and search engine algorithm changes.