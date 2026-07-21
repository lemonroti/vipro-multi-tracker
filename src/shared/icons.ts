import {
  createIcons,
  Ellipsis,
  History,
  House,
  LayoutGrid,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X
} from 'lucide';

const APP_ICONS = {
  Ellipsis,
  History,
  House,
  LayoutGrid,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X
};

export function renderIcons(root: Document | DocumentFragment | Element = document): void {
  createIcons({
    icons: APP_ICONS,
    root,
    attrs: {
      'aria-hidden': 'true',
      focusable: 'false'
    }
  });
}
