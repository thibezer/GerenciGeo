import {
  Button, ButtonDefinition,
  Badge, BadgeDefinition,
  Avatar, AvatarDefinition,
  Divider, DividerDefinition,
  Tablist, TablistDefinition,
  Tab, TabDefinition,
  Dropdown, DropdownDefinition,
  DropdownOption, DropdownOptionDefinition,
  Menu, MenuDefinition,
  MenuItem, MenuItemDefinition,
  MenuList, MenuListDefinition,
  MenuButton, MenuButtonDefinition,
  Tooltip, TooltipDefinition
} from '@fluentui/web-components';

let isRegistered = false;

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
