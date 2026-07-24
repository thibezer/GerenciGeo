/**
 * Helper para renderizar elementos HTML/SVG de marcadores no Leaflet Canvas/DOM.
 */
export function getPointShapeHtml(
  shapeStyle: string,
  size: number,
  bgClass: string,
  extraClasses: string = '',
  id: string = ''
): string {
  const containerStyle = `width: ${size + 4}px; height: ${size + 4}px;`;
  const innerSize = size;

  switch (shapeStyle) {
    case 'square':
      return `<div id="${id}" class="${bgClass} ${extraClasses} rounded-sm shadow-md" style="width:${innerSize}px; height:${innerSize}px;"></div>`;
    case 'circle-dot':
      return `
        <div id="${id}" class="relative flex items-center justify-center ${extraClasses}" style="${containerStyle}">
          <div class="${bgClass} rounded-full shadow-md" style="width:${innerSize}px; height:${innerSize}px;"></div>
          <div class="absolute bg-white rounded-full" style="width:${Math.max(3, Math.floor(innerSize / 3))}px; height:${Math.max(3, Math.floor(innerSize / 3))}px;"></div>
        </div>
      `;
    case 'cross':
      return `
        <div id="${id}" class="relative flex items-center justify-center ${extraClasses}" style="${containerStyle}">
          <div class="${bgClass} rounded-full" style="width:${Math.max(4, innerSize - 2)}px; height:${Math.max(4, innerSize - 2)}px; opacity:0.8;"></div>
          <div class="absolute bg-white" style="width:2px; height:${innerSize + 4}px;"></div>
          <div class="absolute bg-white" style="width:${innerSize + 4}px; height:2px;"></div>
        </div>
      `;
    case 'triangle':
      return `
        <div id="${id}" class="${extraClasses}" style="width:0; height:0; border-left:${innerSize / 2}px solid transparent; border-right:${innerSize / 2}px solid transparent; border-bottom:${innerSize}px solid currentColor;"></div>
      `;
    case 'circle':
    default:
      return `<div id="${id}" class="${bgClass} ${extraClasses} rounded-full shadow-md" style="width:${innerSize}px; height:${innerSize}px;"></div>`;
  }
}
