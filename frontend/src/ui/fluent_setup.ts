import {
  Button, ButtonDefinition,
  Badge, BadgeDefinition,
  Avatar, AvatarDefinition,
  Divider, DividerDefinition,
  Tablist, TablistDefinition,
  Tab, TabDefinition,
  Dropdown, DropdownDefinition,
  DropdownOption, DropdownOptionDefinition,
  Listbox, ListboxDefinition,
  Menu, MenuDefinition,
  MenuItem, MenuItemDefinition,
  MenuList, MenuListDefinition,
  MenuButton, MenuButtonDefinition,
  Tooltip, TooltipDefinition
} from '@fluentui/web-components';

let isRegistered = false;

// Polyfill defensivo para a API de Popover HTML5 e suporte a componentes Web (Fluent UI / FAST)
if (typeof window !== 'undefined' && typeof HTMLElement !== 'undefined') {
  if (!HTMLElement.prototype.showPopover) {
    (HTMLElement.prototype as any).showPopover = function() {
      try {
        this.style.display = 'block';
        this.classList.add('is-open');
      } catch {}
    };
  }
  if (!HTMLElement.prototype.hidePopover) {
    (HTMLElement.prototype as any).hidePopover = function() {
      try {
        this.style.display = 'none';
        this.classList.remove('is-open');
      } catch {}
    };
  }
  if (!HTMLElement.prototype.togglePopover) {
    (HTMLElement.prototype as any).togglePopover = function(force?: boolean) {
      const isOpen = force !== undefined ? force : !this.classList.contains('is-open');
      if (isOpen) {
        if (typeof (this as any).showPopover === 'function') (this as any).showPopover();
      } else {
        if (typeof (this as any).hidePopover === 'function') (this as any).hidePopover();
      }
    };
  }
}

export function registerFluentComponents() {
  if (isRegistered) return;
  
  const components = [
    [Button, ButtonDefinition],
    [Badge, BadgeDefinition],
    [Avatar, AvatarDefinition],
    [Divider, DividerDefinition],
    [Tablist, TablistDefinition],
    [Tab, TabDefinition],
    [Dropdown, DropdownDefinition],
    [DropdownOption, DropdownOptionDefinition],
    [Listbox, ListboxDefinition],
    [Menu, MenuDefinition],
    [MenuItem, MenuItemDefinition],
    [MenuList, MenuListDefinition],
    [MenuButton, MenuButtonDefinition],
    [Tooltip, TooltipDefinition]
  ] as const;

  for (const [component, definition] of components) {
    try {
      (component as any).define(definition);
    } catch {
      // Elemento pode já ter sido registrado nativamente
    }
  }

  isRegistered = true;
}
