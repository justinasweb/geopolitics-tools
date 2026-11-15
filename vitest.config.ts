import { getViteConfig } from 'astro/config';

// Astro's Vite config, so a test can render a component with the container API (tests/unit/components.test.ts).
export default getViteConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});
