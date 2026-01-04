# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo containing multiple Next.js websites using npm workspaces.

## Structure

```
apps/
  scanner/     # Barcode scanner app (Next.js 16)
```

## Development Commands

From root:
- `npm run dev` - Start scanner app dev server
- `npm run build` - Build scanner app
- `npm run lint` - Lint scanner app

From specific app (e.g., `apps/scanner`):
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture

Each app in `apps/` is a standalone Next.js 16 project with:
- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Source**: `src/` directory structure
- **Import alias**: `@/*` maps to `src/*`

## Preferences

- **Always use Tailwind CSS** for styling. Do not use other CSS solutions or inline styles.
