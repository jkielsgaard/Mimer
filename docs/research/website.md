# Research: a website for Mimer on GitHub

Status: report only. Goal: a good-looking page that presents Mimer and lets people read more, for people who do not browse GitHub.

## What is possible

- The repository is **public**, so **GitHub Pages** hosts a static site for free, at `https://<user>.github.io/Mimer/` or at the owner's own domain.
- Two ways: **deploy from a folder** (plain HTML, CSS and images, no build, simplest) or **deploy with a GitHub Actions workflow** that builds a site first. Astro's official action is the usual way for a built site ([Astro on GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)). A custom domain is one extra file (`CNAME`) and a DNS setting at the domain's provider.
- Nothing in the site needs a server, a database or the owner's laptop.

## What the site should contain

1. **Front**: what Mimer is in one sentence ("Plain Markdown notes with a local AI"), a screenshot, a Download button (links to the latest GitHub release and the Microsoft Store).
2. **Why it is different**: your notes stay plain files, nothing is lost (Git history), the AI only proposes, the AI runs on your computer.
3. **Features** with screenshots (the repository already has 13 in `docs/screenshots/`): tasks and epics, meetings, the start page, the editor, the AI commands.
4. **Get started**: install, first vault, choosing an AI (the START-GUIDE as pages).
5. **Help**: the in-app guide as web pages (the same Markdown files, `src/features/help/topics/`), a changelog, and links to report a bug or suggest a feature.
6. **Privacy**: no telemetry, what is sent where (nothing unless a cloud AI is chosen).
7. **Licence** (AGPL-3.0) and a link to the source.

## Options

1. **Plain HTML in a `site/` folder, deployed by a small workflow (recommended).** No framework, easy to read and to change with Claude, fast. Pages written by hand with one shared stylesheet that uses Mimer's own colours (from the design system), so the site looks like the app. Help pages are generated from the existing Markdown by a small script.
2. **Astro (or similar) static site generator.** Better if the site grows (many pages, search, translations); one more tool to maintain.
3. **GitHub's built-in Jekyll theme from `docs/`.** Quickest but looks like every other GitHub Pages site.

## How it is kept up to date

- The workflow runs on every release tag and on changes to `site/` or the help topics; the changelog page is built from `CHANGELOG.md`; the version number and download links come from the latest release.
- Screenshots: the repository already holds them; new ones are taken headless from Mimer (never of the whole desktop).

## Care

- No local paths, user names or environment details in the pages or the screenshots.
- No tracking scripts or cookie banners (matches Mimer's privacy stance). If statistics are wanted, a cookie-less service can be added later.
- Language: English first (like the app). A Danish version can follow.

## Recommendation

Option 1: a `site/` folder of plain pages in Mimer's look, a "Download" front, the features with the existing screenshots, a help section built from the in-app guide, and a changelog, deployed by a GitHub Actions workflow on every release. First step is a one-page design (front page) for the owner to approve, then the pages.

## Questions for the owner

- A custom domain, or `github.io` for now?
- English only at first?
- Should the site link to the Microsoft Store listing and to GitHub releases?
