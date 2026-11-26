import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

try {
  if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local', override: true });
  }
} catch {
  // ignore
}
dotenv.config({ override: true });

export async function handleRenderRequest(body: any) {
  const {
    imageBase64,
    propertyType,
    environment,
    lighting,
    hasPeople,
    hasProps,
    stagingIntensity = 2,
    bimManifest,
  } = body || {};

  if (!imageBase64) {
    throw new Error('Image base64 data is required');
  }

  let apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  try {
    if (fs.existsSync('.env.local')) {
      const parsed = dotenv.parse(fs.readFileSync('.env.local'));
      if (parsed.GEMINI_API_KEY && parsed.GEMINI_API_KEY.trim()) {
        apiKey = parsed.GEMINI_API_KEY.trim();
      } else if (parsed.VITE_GEMINI_API_KEY && parsed.VITE_GEMINI_API_KEY.trim()) {
        apiKey = parsed.VITE_GEMINI_API_KEY.trim();
      }
    }
  } catch {
    // fallback to process.env
  }

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY no está configurada en el servidor de Vercel. Por favor, asegúrate de haber añadido GEMINI_API_KEY en Vercel Dashboard -> Project Settings -> Environment Variables y desplegado nuevamente.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const hasIsland = Boolean(bimManifest?.hasIsland);
  const hasCountertop = bimManifest?.countertop?.enabled !== false;
  const archElements = Array.isArray(bimManifest?.architecturalElements) ? bimManifest.architecturalElements : [];
  const hasModeledWindows = archElements.some((el: any) => el?.type === 'window');
  const isBlindWallsEnv =
    !environment ||
    String(environment).toLowerCase().includes('muros ciegos') ||
    String(environment).toLowerCase().includes('sin ventanas');

  // Especificación detallada pieza por pieza del proyecto BIM
  const inventorySection = bimManifest?.rawTextPromptSpec
    ? `
OFFICIAL PIECE-BY-PIECE BIM INVENTORY (GROUND TRUTH — MUST MATCH INPUT IMAGE 1:1):
${bimManifest.rawTextPromptSpec}
`.trim()
    : `
EXACT MATERIAL & FINISH SPECIFICATIONS (MATCH INPUT IMAGE 1:1):
- Cabinet Fronts: ${bimManifest?.cabinetFronts || 'Seguir exactamente los colores y texturas de la imagen de entrada'}${hasIsland && bimManifest?.islandFronts ? `\n- Island Fronts: ${bimManifest.islandFronts}` : ''}
- Fronts Finish & Tone: ${bimManifest?.woodToneDetails || 'Conservar exactamente el tono, color y veta de la imagen de entrada'}
- Modules Architecture & Layout: ${bimManifest?.moduleArchitecture || 'Disposición exacta según captura 3D'}
- Base Support & Zócalo: ${bimManifest?.socleDirective || bimManifest?.socle?.directive || 'Seguir exactamente la imagen de entrada'}
- Countertop: ${bimManifest?.countertop?.description || 'Seguir exactamente la cubierta de la imagen de entrada'}
- Hardware / Handles: ${bimManifest?.hardwareSummary || bimManifest?.hardware || 'Seguir exactamente los tiradores o sistema sin tirador de la imagen de entrada'}
- Flooring: ${bimManifest?.finishSummary?.floorDescription || bimManifest?.flooring || 'Seguir exactamente el piso de la imagen de entrada'}
- Walls Finish: ${bimManifest?.finishSummary?.wallColor || bimManifest?.wallFinish || 'Seguir exactamente el acabado de muros de la imagen de entrada'}
`.trim();

  const totalCount = bimManifest?.totalModulesCount
    ? `${bimManifest.totalModulesCount} exact modeled items`
    : 'the exact count visible in the input 3D capture';

  // Directivas estrictas extraídas del manifiesto real
  const strictDirectivesList = Array.isArray(bimManifest?.strictNegativeDirectives) && bimManifest.strictNegativeDirectives.length > 0
    ? bimManifest.strictNegativeDirectives.map((d: string) => `   - ${d}`).join('\n')
    : '';

  // Gestión estricta de ventanas y vista exterior (nunca abrir ventanas en muros ciegos)
  const environmentSection =
    isBlindWallsEnv || !hasModeledWindows
      ? `- SOLID WALLS PRESERVATION: Keep all room walls completely solid and continuous exactly as shown in the 3D input capture (${hasModeledWindows ? 'no exterior view requested' : '0 windows modeled in project'}). Do NOT cut, carve, or invent new windows or glass openings in any wall.`
      : `- EXTERIOR VIEW THROUGH EXISTING WINDOWS ONLY: Render a realistic "${environment}" exterior vista strictly visible ONLY through the window openings that ALREADY EXIST in the 3D input capture. Keep every window frame's exact position, width, height, and elevation unchanged, and keep all other wall areas solid.`;

  // Gestión estricta de staging / decoración (sin modificar muebles, cubiertas ni decorativos modelados)
  const intensityNum = Number(stagingIntensity) || 2;
  const stagingPropsSection = !hasProps
    ? `- ZERO ADDED PROPS (STRICT PURE PROJECT RENDER):
     * Do NOT add any new utensils, coffee makers, cutting boards, dishes, bottles, books, towels, plants, bowls, or decorative items anywhere.
     * Keep every countertop, shelf, niche, and floor surface 100% pure and identical to the 3D capture, preserving ONLY the appliances and decorative items already modeled in the input scene.`
    : intensityNum === 1
    ? `- MINIMALIST STAGING (LEVEL 1 — STRICTLY NON-DESTRUCTIVE):
     * Keep countertops 90% bare. Place at most 1 or 2 small, understated tabletop accents resting strictly on top of empty horizontal countertop space (never blocking sinks, cooktops, faucets, handles, or cabinet seams).
     * Every cabinet, drawer, door, countertop edge, backsplash, appliance, and modeled decorative item stays 100% unchanged in geometry, size, and position.`
    : intensityNum === 3
    ? `- LIVED-IN EDITORIAL STAGING (LEVEL 3 — STRICTLY NON-DESTRUCTIVE):
     * Place tasteful tabletop culinary accents (e.g., wooden cutting board, ceramic herb pot, espresso machine, linen towel) resting strictly on top of existing horizontal countertop surfaces${hasIsland ? ' and island top' : ''}, never obstructing sinks, cooktops, faucets, or handles.
     * Every cabinet, drawer, door, countertop thickness/overhang/waterfall, backsplash, appliance, and modeled decorative item stays 100% unchanged in geometry, size, and position.`
    : `- BALANCED EDITORIAL STAGING (LEVEL 2 — STRICTLY NON-DESTRUCTIVE):
     * Place a few restrained tabletop accents (e.g., sleek espresso machine or kettle, small wooden cutting board, small ceramic herb pot) resting strictly on top of existing horizontal countertop surfaces${hasIsland ? ' and island top' : ''}, never obstructing sinks, cooktops, faucets, or handles.
     * Every cabinet, drawer, door, countertop thickness/overhang/waterfall, backsplash, appliance, and modeled decorative item stays 100% unchanged in geometry, size, and position.`;

  // Detalle real de herrajes y acabados sin valores hardcodeados
  const realFrontsTone =
    bimManifest?.finishSummary?.woodToneDetails ||
    bimManifest?.woodToneDetails ||
    'Preserve the exact colors, tones, and finishes visible on every cabinet front in the input 3D capture.';
  const realHardware =
    bimManifest?.hardwareSummary ||
    bimManifest?.hardware ||
    'Preserve the exact handle shape, placement, and finish (or handleless Gola/push fronts) visible in the input 3D capture.';
  const realFloor =
    bimManifest?.finishSummary?.floorDescription ||
    bimManifest?.flooring ||
    'Preserve the exact floor material, tile grid/planks, and color visible in the input 3D capture.';
  const realWalls =
    bimManifest?.finishSummary?.wallColor ||
    bimManifest?.wallFinish ||
    'Preserve the exact wall paint/finish color visible in the input 3D capture.';
  const realCountertop =
    bimManifest?.countertop?.description ||
    'Preserve the exact countertop material, thickness, overhang, backsplash, and edge profile visible in the input 3D capture.';
  const realBacksplashMode = bimManifest?.countertop?.backsplashMode || 'none';
  const realBacksplashHeightCm = Number(bimManifest?.countertop?.backsplashHeightCm ?? 0);
  const realBacksplashDirective = bimManifest?.countertop?.backsplashDirective || '';
  const backsplashLockRule = !hasCountertop
    ? ''
    : realBacksplashMode === 'standard_5cm' || (realBacksplashHeightCm > 0 && realBacksplashHeightCm < 20 && realBacksplashMode !== 'full_height' && realBacksplashMode !== 'mixed')
    ? `   - BACKSPLASH HEIGHT LOCK (${realBacksplashHeightCm || 5} cm / ${(realBacksplashHeightCm || 5) * 10} mm LOW UPSTAND ONLY — CRITICAL):
     * The stone backsplash is strictly a SHORT ${realBacksplashHeightCm || 5} cm horizontal curb strip sitting along the rear edge of the countertop.
     * Above that ${realBacksplashHeightCm || 5} cm strip, the ENTIRE vertical wall band up to the underside of the wall cabinets (~50 cm tall) MUST remain plain matte painted wall (${realWalls}).
     * ABSOLUTELY FORBIDDEN: Do NOT extend the stone/quartz/sintered slab upward to meet the bottom of the upper cabinets, and do NOT misinterpret the dark diagonal shadow cast under the upper cabinets in the 3D capture as a full-height stone backsplash.`
    : realBacksplashMode === 'none' || realBacksplashHeightCm === 0
    ? `   - BACKSPLASH HEIGHT LOCK (0 cm — NO STONE BACKSPLASH):
     * There is NO stone upstand and NO full-height stone slab on the wall. The plain painted wall (${realWalls}) meets the horizontal countertop surface directly.`
    : realBacksplashMode === 'full_height'
    ? `   - BACKSPLASH HEIGHT LOCK (55 cm FULL-HEIGHT SLAB):
     * Keep the vertical stone backsplash panel at its exact 55 cm height covering the wall band between the countertop and the underside of the upper cabinets, matching the exact horizontal boundaries in the 3D capture.`
    : `   - BACKSPLASH HEIGHT LOCK (PER-RUN EXACT SPEC):
     * ${realBacksplashDirective}`;
  const realSocle =
    bimManifest?.socle?.directive ||
    bimManifest?.socleDirective ||
    'Preserve the exact base support (closed kickplate or legs) visible in the input 3D capture.';
  const realIslandBack = bimManifest?.islandBack?.enabled ? `\n   - Island Back/Sides: ${bimManifest.islandBack.description}` : '';

  const structuredPrompt = `
You are a precision architectural photorealistic relighting & PBR material rendering engine.
TASK: Convert the attached 3D CAD/BIM viewport screenshot into a photorealistic architectural photograph by ONLY upgrading lighting, global illumination, soft shadows, reflections, and physical surface realism — while keeping 100% PIXEL-LOCKED GEOMETRIC, DIMENSIONAL, AND STRUCTURAL FIDELITY to the input 3D image and the piece-by-piece BIM inventory below.

PRIMARY RULE — INPUT IMAGE IS GEOMETRIC GROUND TRUTH:
- Treat the input 3D image as an immutable architectural CAD projection.
- Every silhouette, cabinet outline, width, height, depth, gap, door split, drawer seam, open shelf, appliance, sink, faucet, cooktop, countertop edge/thickness/overhang/waterfall, backsplash height, kickplate/legs, handle position, decorative object, wall corner, door, window, and pillar must remain in its EXACT pixel coordinates and proportions.
- Never add, remove, resize, relocate, reshape, or restyle the geometry of ANY piece of furniture, countertop, appliance, architectural element, or decorative element.

${inventorySection}

PIECE-BY-PIECE VERIFICATION CHECKLIST (STRICT 1:1 COMPLIANCE):
1. EXACT MODULE COUNT & BOUNDARIES:
   - Render ONLY the ${totalCount} present in the input 3D image and listed in the BIM inventory.
   - Keep all empty wall regions and open floor areas completely empty and clean exactly as framed in the input image.
${strictDirectivesList ? `${strictDirectivesList}\n` : ''}
2. EXACT FRONTS, DOORS, DRAWERS & OPENINGS:
   - Closed solid doors in the 3D capture remain closed, solid, and opaque with the exact seam lines shown.
   - Drawer banks preserve the exact count and horizontal division heights visible in the 3D capture.
   - Open niches, shelves, wine racks, and built-in appliance cutouts appear ONLY where modeled in the 3D capture.

3. COUNTERTOPS, BACKSPLASH, SINKS, COOKTOPS & WATERFALLS:
   - ${realCountertop}${realIslandBack}
${backsplashLockRule ? `${backsplashLockRule}\n` : ''}   ${hasCountertop ? '- Preserve exact countertop edge thickness, overhang length, exact backsplash height above, and side terminations shown in the 3D capture.' : '- Keep the cabinets without any added stone countertop, matching the input 3D capture.'}

4. FLOOR PLAN & OPEN SPACE PRESERVATION:
   - ${bimManifest?.islandDirectives?.description || (hasIsland ? 'Keep the modeled island in its exact footprint and position.' : 'Keep the central and foreground floor completely open and bare exactly as shown in the input 3D capture.')}

5. BASE SUPPORT / ZÓCALO:
   - ${realSocle}

6. MATERIALS, COLORS & HARDWARE (EXACT PROJECT MATCH — NO COLOR DRIFT):
   - Cabinet Fronts & Tones: ${realFrontsTone}
   - Hardware / Opening System: ${realHardware}
   - Floor: ${realFloor}
   - Walls: ${realWalls}
   ${bimManifest?.finishSummary?.spaceDecorationSummary ? `- Configured Room Finishes/Decor: ${bimManifest.finishSummary.spaceDecorationSummary}` : ''}
   - Match the exact hue, brightness, contrast, and material family of every surface in the input 3D capture (do not swap wood for solid color, solid color for wood, light for dark, dark for light, or change handle finish/model).

7. ARCHITECTURAL ENVIRONMENT & WINDOWS:
   ${environmentSection}

8. STAGING & HUMAN PRESENCE:
   ${hasPeople ? '- HUMAN STAGING: 1 realistic person standing naturally in the open floor space without blocking or modifying any furniture.' : '- NO PEOPLE: Keep the scene completely free of people, figures, or silhouettes.'}
   ${stagingPropsSection}

9. CAMERA & PERSPECTIVE LOCK:
   - Keep the exact camera angle, focal length, framing, crop, and vertical line alignment of the input 3D image. Do not zoom, pan, tilt, or recompose the shot.

10. PHOTOREALISTIC LIGHTING & PBR SHADING UPGRADE ONLY:
   - Replace flat WebGL shading with physically accurate architectural photography lighting: natural contact ambient occlusion in cabinet joints and floor edges, realistic micro-bevel highlights (1mm soft edge specular), physically accurate matte/satin/stone reflections matching each specified material, and realistic stainless steel/glass shading ONLY on modeled appliances/sinks/faucets.
   - Do NOT invent under-cabinet LED strips, recessed spotlights, pendant lamps, or fixtures that are not modeled in the 3D input image.
   - Lighting mood: ${lighting || 'Mañana Luminosa (Luz Natural Sol)'}.
   - Architectural context: ${propertyType || 'Casa Residencial'}.
`.trim();

  let mimeType = 'image/png';
  const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
  if (mimeMatch) {
    mimeType = mimeMatch[1];
  }
  const cleanImageBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

  let response;
  let modelUsed = 'gemini-nano-banana-2.1';
  try {
    response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanImageBase64,
              mimeType,
            },
          },
          {
            text: structuredPrompt,
          },
        ],
      },
      config: {
        temperature: 0.2,
      },
    });
  } catch (nanoError: any) {
    console.warn('Fallback a gemini-3.1-flash-lite-image por:', nanoError?.message);
    modelUsed = 'gemini-3.1-flash-lite-image';
    response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanImageBase64,
              mimeType,
            },
          },
          {
            text: structuredPrompt,
          },
        ],
      },
      config: {
        temperature: 0.2,
      },
    });
  }

  let generatedImageUrl = '';
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      generatedImageUrl = `data:${mime};base64,${part.inlineData.data}`;
      break;
    }
  }

  if (!generatedImageUrl) {
    const responseText = response.text;
    throw new Error(responseText || 'No image content returned from NanoBanana model');
  }

  return { imageUrl: generatedImageUrl, modelUsed };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await handleRenderRequest(req.body);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in NanoBanana API:', error);
    const errStr = String(error?.message || error || '');
    let userMsg = 'Error al generar el render fotográfico.';

    if (errStr.includes('429') || errStr.includes('Quota exceeded') || errStr.includes('RESOURCE_EXHAUSTED')) {
      userMsg =
        'Límite de cuota alcanzado (Error 429) en la API Key gratuita para el modelo NanoBanana. Activa una clave de API con facturación en la configuración de la plataforma para continuar generando renders sin restricciones.';
    } else if (error?.message) {
      userMsg = error.message;
    }

    return res.status(500).json({ error: userMsg });
  }
}
