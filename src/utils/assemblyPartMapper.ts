import { Part } from './manufacturing';

/**
 * Mapea una pieza individual del despiece (BOM) a una clave semántica determinística
 * compartida con el renderizado 3D (Cabinet.tsx / Board.tsx) para el visor QR de armado.
 *
 * No altera ninguna medida ni cálculo de kitchenManufacturing.ts.
 */
export function resolveAssemblyPartKey(part: Part, copyIndex: number): string {
  const raw = (part.name || '').trim();
  const n = raw.toLowerCase();
  const copyIdx0 = Math.max(0, copyIndex - 1);
  const sideLabel = copyIndex === 1 ? 'left' : 'right';

  // Extraer número entre paréntesis al final, ej: "Lateral Cajón B-1 (2)" -> 2
  const parenNumMatch = raw.match(/\((\d+)\)\s*$/);
  const parenIdx0 = parenNumMatch ? Math.max(0, parseInt(parenNumMatch[1], 10) - 1) : 0;

  // 1. Tapas laterales vistas (antes que "lateral" genérico)
  if (n.startsWith('tapa lateral izq')) return 'cover_left';
  if (n.startsWith('tapa lateral der')) return 'cover_right';

  // 2. Cajones interiores de torre (tall_inner_drawers)
  if (n.includes('cajón interior') || n.includes('cajon interior')) {
    const m = raw.match(/interior\s+(\d+)/i);
    const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
    if (n.startsWith('frente')) return `inner_drawer_${idx}_front`;
    if (n.startsWith('lateral')) return `inner_drawer_${idx}_side_${sideLabel}`;
    if (n.startsWith('trasera')) return `inner_drawer_${idx}_back`;
    if (n.startsWith('fondo')) return `inner_drawer_${idx}_bottom`;
  }

  // 3. Cajones en U bajo lavaplatos (sink_u_drawer)
  if (n.includes('cajón en u') || n.includes('cajon en u') || n.includes('calado u')) {
    if (n.startsWith('frente')) return 'u_drawer_front';
    if (n.startsWith('costados exteriores')) return `u_drawer_outer_side_${sideLabel}`;
    if (n.startsWith('contrafrente')) return 'u_drawer_inner_front';
    if (n.startsWith('traseras alas')) return `u_drawer_back_${sideLabel}`;
    if (n.startsWith('costados interiores')) return `u_drawer_inner_side_${sideLabel}`;
    if (n.startsWith('fondo alas')) return `u_drawer_bottom_wing_${sideLabel}`;
    if (n.startsWith('fondo banda frontal')) return 'u_drawer_bottom_front';
  }
  if (n.includes('cajón inferior') || n.includes('cajon inferior')) {
    if (n.startsWith('frente')) return 'drawer_0_front';
    if (n.startsWith('lateral')) return `drawer_0_side_${sideLabel}`;
    if (n.startsWith('contrafrente')) return 'drawer_0_inner_front';
    if (n.startsWith('trasera')) return 'drawer_0_back';
    if (n.startsWith('fondo')) return 'drawer_0_bottom';
  }

  // 4. Cajones de Clóset
  if (n.includes('cajón clóset') || n.includes('cajon closet')) {
    if (n.startsWith('lateral')) return `closet_drawer_${parenIdx0}_side_${sideLabel}`;
    if (n.startsWith('contrafrente')) return `closet_drawer_${parenIdx0}_inner_front`;
    if (n.startsWith('trasera')) return `closet_drawer_${parenIdx0}_back`;
    if (n.startsWith('fondo')) return `closet_drawer_${parenIdx0}_bottom`;
  }
  if (n.startsWith('frente interior cajón') || n.startsWith('frente exterior cajón')) {
    const m = raw.match(/caj[oó]n\s+(\d+)/i);
    const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
    return `closet_drawer_${idx}_front`;
  }
  if (n.startsWith('lateral int. cajonera')) return `closet_inner_lat_${sideLabel}`;
  if (n.startsWith('pilastra frontal')) return `closet_pilaster_${sideLabel}`;
  if (n.startsWith('zócalo frontal clóset') || n.startsWith('zocalo frontal closet')) return 'closet_socle_front';
  if (n.startsWith('zócalo posterior clóset') || n.startsWith('zocalo posterior closet')) return 'closet_socle_back';

  // 5. Cajones estándar, verdulero, caceroleros y encimera
  if (n.startsWith('frente fijo superior encimera')) return 'drawer_2_front';
  if (n.startsWith('frente cajón ollero inferior')) return 'drawer_0_front';
  if (n.startsWith('frente cajón medio')) return 'drawer_1_front';
  if (n.startsWith('frente cajón superior')) {
    const m = raw.match(/superior\s+(\d+)/i);
    const idx = m ? Math.max(1, parseInt(m[1], 10)) : 1;
    return `drawer_${idx}_front`;
  }
  if (n.startsWith('frente cajón verdulero')) {
    if (n.includes('inferior')) return 'drawer_0_front';
    if (n.includes('medio')) return 'drawer_1_front';
    return 'drawer_2_front';
  }
  if (n.startsWith('frente cacerolero inferior')) {
    const m = raw.match(/inferior\s+(\d+)/i);
    const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
    return `drawer_${idx}_front`;
  }
  if (n.startsWith('frente cajón') || n.startsWith('frente cajon')) {
    const m = raw.match(/caj[oó]n\s+(\d+)/i);
    const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
    return `drawer_${idx}_front`;
  }
  if (n.startsWith('lateral cajón') || n.startsWith('lateral cajon') || n.startsWith('lateral cacerolero')) {
    return `drawer_${parenIdx0}_side_${sideLabel}`;
  }
  if (n.startsWith('contrafrente cajón') || n.startsWith('contrafrente cajon') || n.startsWith('contrafrente cacerolero')) {
    return `drawer_${parenIdx0}_inner_front`;
  }
  if (n.startsWith('trasera cajón') || n.startsWith('trasera cajon') || n.startsWith('trasera cacerolero')) {
    return `drawer_${parenIdx0}_back`;
  }
  if (n.startsWith('fondo cajón') || n.startsWith('fondo cajon') || n.startsWith('fondo cacerolero')) {
    return `drawer_${parenIdx0}_bottom`;
  }

  // 6. Especiero extraíble
  if (n.includes('especiero')) {
    if (n.startsWith('frente exterior')) return 'spice_front';
    if (n.startsWith('piso base')) return 'spice_bottom';
    if (n.startsWith('trasera')) return 'spice_back';
    if (n.startsWith('barandillas laterales inferiores')) return `spice_guard_low_${copyIdx0}`;
    if (n.startsWith('amarres frontales')) return `spice_tie_${copyIdx0}`;
    if (n.startsWith('repisa intermedia')) return 'spice_mid_shelf';
    if (n.startsWith('barandillas laterales intermedias')) return `spice_guard_mid_${copyIdx0}`;
  }

  // 7. Laterales del casco
  if (n.startsWith('lateral ')) return `lateral_${sideLabel}`;

  // 8. Piso, Techo, Barras de armado y Traseras
  if (n.startsWith('piso soporte campana') || n.startsWith('piso ')) return 'bottom';
  if (n.startsWith('techo nicho')) return 'divider_niche_top';
  if (n.startsWith('techo ') || n.startsWith('barra frontal superior') || n.startsWith('tapa melamina completa')) {
    return 'top';
  }
  if (n.startsWith('barra refuerzo trasera superior')) return 'back_rail_0';
  if (n.startsWith('barra refuerzo trasera inferior')) return 'back_rail_1';
  if (n.startsWith('barra refuerzo trasera')) return `back_rail_${copyIdx0}`;
  if (n.startsWith('fondo trasera inferior')) return 'back_lower';
  if (n.startsWith('fondo trasera superior')) return 'back_upper';
  if (n.startsWith('fondo falso botellero')) return 'wine_back';
  if (n.startsWith('fondo trasera')) return 'back';

  // 9. Botellero
  if (n.startsWith('divisor vertical botellero')) return `wine_vert_${copyIdx0}`;
  if (n.startsWith('repisa horizontal botellero')) return `wine_horiz_${copyIdx0}`;

  // 10. Divisores estructurales
  if (n.startsWith('divisor fijo línea base') || n.startsWith('divisor fijo linea base')) return 'divider_base';
  if (n.startsWith('base soporte horno')) return 'divider_oven_base';
  if (n.startsWith('divisor horno')) return 'divider_oven_mid';
  if (n.startsWith('base soporte nicho') || n.startsWith('divisor base nicho')) return 'divider_niche_base';
  if (n.startsWith('divisor fijo sobre nicho')) return 'divider_niche_top';
  if (n.startsWith('divisor horizontal fijo')) return 'divider_mid';
  if (n.startsWith('tapa divisoria cajonera')) return 'divider_drawer_top';

  // 11. Esquinero ciego / L
  if (n.startsWith('repisa en l - tramo principal')) return 'shelf_l_main';
  if (n.startsWith('repisa en l - retorno')) return 'shelf_l_return';
  if (n.startsWith('panel ciego') || n.startsWith('tapa esquinero frontal')) return 'blind_panel';
  if (n.startsWith('regleta')) return 'corner_filler';
  if (n.startsWith('poste amarre ciego')) return 'corner_post';

  // 12. Puertas
  if (n.startsWith('puerta bi-fold hoja 1')) return 'door_bifold_1';
  if (n.startsWith('puerta bi-fold hoja 2')) return 'door_bifold_2';
  if (n.startsWith('puerta elevable inferior')) return 'door_lift_lower';
  if (n.startsWith('puerta elevable superior')) return 'door_lift_upper';
  if (n.startsWith('puerta elevable') || n.startsWith('puerta superior elevable')) return 'door_lift_0';
  if (n.startsWith('puerta inferior')) return 'door_lower';
  if (n.startsWith('puerta superior')) return 'door_upper';
  if (n.startsWith('puerta')) return `door_${copyIdx0}`;

  // 13. Repisas
  if (n.startsWith('repisa inferior')) return `shelf_lower_${copyIdx0}`;
  if (n.startsWith('repisa superior') || n.startsWith('repisa interior superior') || n.startsWith('repisas interiores superiores')) {
    return `shelf_upper_${copyIdx0}`;
  }
  if (n.startsWith('repisa') || n.startsWith('repisas')) return `shelf_${copyIdx0}`;

  // Fallback seguro: destaca el módulo completo
  return '__cabinet__';
}

/**
 * Compara una clave de tablero 3D contra la clave objetivo escaneada en el QR.
 */
export function isAssemblyPartMatch(boardKey: string | undefined, targetKey: string | null): boolean {
  if (!targetKey) return false;
  if (targetKey === '__cabinet__') return true;
  if (!boardKey) return false;
  if (boardKey === targetKey) return true;

  // Compatibilidad flexible: si una variante usa `shelf_0` pero el BOM clasificó `shelf_lower_0` o `shelf_upper_0`
  if (
    (targetKey.startsWith('shelf_lower_') || targetKey.startsWith('shelf_upper_')) &&
    boardKey === `shelf_${targetKey.split('_').pop()}`
  ) {
    return true;
  }

  return false;
}
