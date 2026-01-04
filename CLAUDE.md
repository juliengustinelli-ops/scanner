# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 16 application with TypeScript, Tailwind CSS v4, and ESLint.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture

- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Source**: `src/` directory structure
- **Import alias**: `@/*` maps to `src/*`

## Preferences

- **Always use Tailwind CSS** for styling. Do not use other CSS solutions or inline styles.
