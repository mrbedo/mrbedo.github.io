import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactGalleryApp } from './src/ReactGalleryApp.tsx';
import { GalleryAppViewModel } from './src/view-models/gallery-app-view-model.ts';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Required page element is missing: root');
}

const viewModel = new GalleryAppViewModel();
createRoot(rootElement).render(createElement(ReactGalleryApp, { viewModel }));
