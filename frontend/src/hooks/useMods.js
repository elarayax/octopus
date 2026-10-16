import { useState, useEffect, useCallback } from 'react';
import { LoadCustomCSS, LoadCustomLayout, OpenModsFolder } from '../../wailsjs/go/main/App';

const DEFAULT_LAYOUT = {
  themeName: 'Default',
  sidebarPosition: 'left',
  panels: { voice: true, connection: true, nodeInfo: true },
};

const STYLE_TAG_ID = 'mod-theme-style';

function applyCSS(cssText) {
  let tag = document.getElementById(STYLE_TAG_ID);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = cssText;
}

export function useMods() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  const reload = useCallback(async () => {
    try {
      const [css, modLayout] = await Promise.all([LoadCustomCSS(), LoadCustomLayout()]);
      if (css !== undefined) applyCSS(css);
      if (modLayout && modLayout.panels) {
        setLayout({ ...DEFAULT_LAYOUT, ...modLayout });
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
