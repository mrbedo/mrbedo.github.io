import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import siteText from './src/site-text.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-text-html',
      transformIndexHtml: (html) => html.replace('%SITE_TITLE%', siteText.site.title)
    },
    viteStaticCopy({
      targets: [
        {
          src: [
            'src/**/*.jpg',
            'src/**/*.JPG',
            'src/**/*.md',
            'src/about/eyes/*.png',
            'src/about/eyes/manifest.json'
          ],
          dest: '.'
        },
        { src: 'thumbs/**/*.jpg', dest: '.' },
        { src: ['artworks.json', 'robots.txt', 'CNAME', '.nojekyll'], dest: '.' }
      ]
    })
  ]
});
