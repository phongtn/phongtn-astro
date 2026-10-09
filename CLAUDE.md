# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: `pnpm` (substitute `npm`/`yarn` if needed).

- `pnpm dev` — local dev server on `localhost:3000` (host: true, so it binds on LAN too).
- `pnpm build` — production build to `./dist/`. Runs `postbuild` automatically, which executes `pagefind --site dist` to generate the static search index. Search will not work unless build + postbuild have run.
- `pnpm preview` — serve the built `./dist/` locally.
- `pnpm check` — `astro check` (type-check `.astro` + TS; uses `@astrojs/check`).
- `pnpm lint` — `biome lint .`.
- `pnpm format` — runs Biome formatter + Prettier (Prettier handles `.astro` and non-`.md(x)` files; Biome owns JS/TS plus import organization). `format:imports` runs Biome's import organizer separately.

There is no test suite.

## Architecture

This is an Astro v5 personal blog built on the Astro Theme Cactus lineage (theme name "Astro Citrus"). It's a static SSG site — no server runtime.

### Content model (`src/content.config.ts`)

Three Astro content collections, all loaded from `src/content/` via the `glob` loader for `**/*.{md,mdx}`:

- **`post`** — full blog posts. Schema enforces `title` (≤60 chars), `description`, `publishDate`, optional `coverImage`, `ogImage`, `tags` (deduped + lowercased via transform), `draft` (default false), plus `seriesId` + `orderInSeries` for series grouping.
- **`note`** — short-form notes. Schema requires `title` + `publishDate` (ISO 8601 with offsets), `description` optional.
- **`series`** — series metadata (id, title, description, `featured`). Posts join a series via `seriesId`.

`src/data/post.ts` is the single source for post queries: `getAllPosts()` filters drafts in PROD only, plus tag/year grouping helpers. Reuse these — do not call `getCollection("post")` ad hoc, or draft filtering will diverge.

### Routing (`src/pages/`)

Standard Astro file-routing. Notable:

- `og-image/[slug].png.ts` — generates per-post OG images at build time using **Satori** + `@resvg/resvg-js`. Posts can override by setting `ogImage` in frontmatter; the route skips generation in that case. Tailwind classes inside the JSX-ish markup are what Satori renders, so style edits happen there, not in CSS.
- `rss.xml.ts` — RSS feed via `@astrojs/rss`.
- `tags/`, `series/`, `posts/`, `notes/` — dynamic listing/detail routes driven by the collections.

### Markdown pipeline (`astro.config.ts` + `src/plugins/`)

`markdown.syntaxHighlight` is **off** — `rehype-pretty-code` handles highlighting using Shiki with rose-pine (dark) / rose-pine-dawn (light) themes. Restart the dev server after changing themes. Shiki transformers `transformerNotationDiff` and `transformerMetaHighlight` are enabled.

Custom remark plugins:

- `remark-admonitions.ts` — converts `:::note`-style directives (via `remark-directive`) into styled callouts.
- `remark-reading-time.ts` — adds `readingTime` to each post's `data.astro.frontmatter`. Read it from the rendered entry, not the schema.

External links are auto-rewritten with `rel="nofollow noreferrer" target="_blank"` (`rehype-external-links`); images inside `<p>` get unwrapped (`rehype-unwrap-images`).

### Styling

Tailwind v3 with `applyBaseStyles: false` — base styles live in `src/styles/global.css` (light/dark via CSS variables, toggled by `ThemeProvider.astro` / `ThemeToggle.astro`). The body uses `font-mono` by default; switch by editing `global.css`. `tailwind.config.ts` defines the design tokens and the typography plugin config for prose.

### Search (Pagefind)

Pagefind only indexes elements tagged `data-pagefind-body` — currently `BlogPost.astro` (post layout) and `note/Note.astro`. Tag filtering uses `data-pagefind-filter="tag"` on tag links in `blog/Masthead.astro`. Re-run `pnpm build` (which triggers postbuild) after content changes to refresh the index; `pnpm dev` will not populate search.

### Env / integrations

Webmentions are wired via `astro:env` (`WEBMENTION_API_KEY` server-secret, `WEBMENTION_URL` / `WEBMENTION_PINGBACK` client-public, all optional). `src/utils/webmentions.ts` consumes them. Image domain `webmention.io` is allowlisted in `astro.config.ts`.

A custom Vite plugin `rawFonts` (bottom of `astro.config.ts`) imports `.ttf` / `.woff` as raw buffers — required by Satori for OG image generation.

### Path alias

`@/*` → `src/*` (configured in `tsconfig.json`). Use `import … from "@/..."` rather than long relative paths.

### Site config split

- `astro.config.ts` — build pipeline, integrations, `site` URL (deployment domain — **must** match the live origin).
- `src/site.config.ts` — runtime metadata used by components (`siteConfig` for SEO/locale/date format; `menuLinks` for header/footer nav).

## Conventions

- Biome formatter uses **tabs** (width 2), 100-char line width, semicolons, trailing commas. `.astro` files are ignored by Biome and formatted by Prettier (`prettier-plugin-astro` + `prettier-plugin-tailwindcss`).
- Draft posts (`draft: true`) are excluded from prod builds, RSS, OG image generation, and tag pages via `getAllPosts()`.
- The repo's `site` field in `astro.config.ts` still points at the upstream theme's domain (`astrocitrus.artemkutsan.pp.ua`) — update before deploying under a different domain.
