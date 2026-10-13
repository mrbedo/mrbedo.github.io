import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
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
