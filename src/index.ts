import { Hono } from 'hono';

type Bindings = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

// All API calls are now made directly from the browser.
// This worker just serves static assets via Cloudflare Assets.

export default app;
