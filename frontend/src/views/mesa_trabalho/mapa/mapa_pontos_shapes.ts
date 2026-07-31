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
    case 'x':
    case 'cross':
      return `
        <div id="${id}" class="relative flex items-center justify-center ${extraClasses}" style="${containerStyle}">
          <svg width="${size + 2}" height="${size + 2}" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
            <path d="M 2,2 L 8,8 M 8,2 L 2,8" stroke="#000000" stroke-width="2.5" stroke-linecap="round" />
            <path d="M 2,2 L 8,8 M 8,2 L 2,8" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
          </svg>
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
