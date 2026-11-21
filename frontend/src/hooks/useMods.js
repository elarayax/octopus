import { useState, useEffect, useCallback } from 'react';
import {
  LoadCustomCSS,
  LoadCustomLayout,
  LoadCustomVideoCSS,
  OpenModsFolder,
} from '../../wailsjs/go/main/App';

const DEFAULT_VIDEO = { mode: 'grid', shape: 'rounded', mirror: true, showNames: true };

const DEFAULT_LAYOUT = {
  themeName: 'Default',
  sidebarPosition: 'left',
  panels: { voice: true, connection: true, nodeInfo: true },
  video: DEFAULT_VIDEO,
};

// Un <style> por mod (tema y videollamada), identificado por id
function applyCSS(id, cssText) {
  let tag = document.getElementById(id);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent = cssText;
}

export function useMods() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  const reload = useCallback(async () => {
    try {
      const [css, videoCss, modLayout] = await Promise.all([
        LoadCustomCSS(),
        LoadCustomVideoCSS(),
        LoadCustomLayout(),
      ]);
      if (css !== undefined) applyCSS('mod-theme-style', css);
      if (videoCss !== undefined) applyCSS('mod-video-style', videoCss);
      if (modLayout && modLayout.panels) {
        setLayout({
          ...DEFAULT_LAYOUT,
          ...modLayout,
          // lo que el mod no defina de video se queda con el valor por defecto
          video: { ...DEFAULT_VIDEO, ...(modLayout.video || {}) },
        });
      }
    } catch (err) {
      console.error('Error cargando mod:', err);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const openFolder = useCallback(() => OpenModsFolder(), []);

  return { layout, reload, openFolder };
}