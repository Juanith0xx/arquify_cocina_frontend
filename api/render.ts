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
  const { imageBase64, prompt, propertyType, environment, lighting, hasPeople, hasProps, stagingIntensity = 2, renderStyle, bimManifest } = body || {};

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
  } catch (e) {
    // fallback to process.env
  }

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor de Vercel. Por favor, asegúrate de haber añadido GEMINI_API_KEY en Vercel Dashboard -> Project Settings -> Environment Variables y desplegado nuevamente.');
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

  // Especificación detallada del proyecto BIM
  const inventorySection = bimManifest?.rawTextPromptSpec
    ? `
MANDATORY ARCHITECTURAL BIM SPECIFICATION & STRICT BILL OF QUANTITIES:
${bimManifest.rawTextPromptSpec}
`
    : `
EXACT MATERIAL & FINISH SPECIFICATIONS:
- Cabinet Fronts: ${bimManifest?.cabinetFronts || 'Melamina madera natural'}${hasIsland && bimManifest?.islandFronts ? `\n- Island Fronts: ${bimManifest.islandFronts}` : ''}
- Wood Tone & Grain Finish: ${bimManifest?.woodToneDetails || 'Roble nórdico claro rubio / light blonde oak, veta sutil limpia'}
- Modules Architecture & Layout: ${bimManifest?.moduleArchitecture || 'Disposición exacta según captura 3D'}
- Base Support & Zócalo: ${bimManifest?.socleDirective || bimManifest?.socle?.directive || bimManifest?.socle || 'Seguir exactamente la imagen de entrada'}
- Countertop: ${bimManifest?.countertop?.description || bimManifest?.countertop || 'Piedra sintetizada Qstone gris'}
- Hardware / Handles: ${bimManifest?.hardwareSummary || bimManifest?.hardware || 'Tiradores en acabado Negro Mate'}
- Flooring: ${bimManifest?.finishSummary?.floorDescription || bimManifest?.flooring || 'Baldosas cerámicas blancas en cuadrícula cuadrada regular con fragüe gris'}
- Walls Finish: ${bimManifest?.finishSummary?.wallColor || bimManifest?.wallFinish || 'Pintura lisa mate color muro actual'}
`;

  const totalCount = bimManifest?.totalModulesCount ? `${bimManifest.totalModulesCount} modules` : 'the exact count shown in the input 3D model';

  const intensityNum = Number(stagingIntensity) || 2;
  const stagingPropsSection = !hasProps
    ? '- NO PROPS: Keep countertops and surfaces completely clean, pristine, polished, and free of clutter or staging objects.'
    : intensityNum === 1
    ? `- TASTEFUL DECORATION & MINIMALIST STAGING (LEVEL 1 - SUBTLE & REFINED):
     * Keep countertops 85% bare, clean, and uncluttered so the visual focus remains 100% on the pristine cabinetry and countertop stone.
     * Rest only 1 or 2 high-end designer accent items naturally on the countertop: e.g. a minimalist ceramic vase with a single botanical sprig, or a sleek designer espresso machine.
     * STRICT IMMUTABILITY OF FURNITURE: All decorative objects must ONLY sit on top of existing horizontal surfaces (countertops). Under NO circumstance should any cabinet, drawer, door, appliance, handle, island, peninsula, or wall module be added, removed, resized, or altered. The cabinetry architecture remains 100% identical to the 3D capture.`
    : intensityNum === 3
    ? `- TASTEFUL DECORATION & RICH LIVED-IN STAGING (LEVEL 3 - ABUNDANT & VIBRANT):
     * Create an authentic, warm, inhabited high-end kitchen atmosphere with generous culinary and lifestyle staging resting ONLY ON THE EXISTING COUNTERTOP SURFACES${hasIsland ? ' AND ISLAND' : ''}.
     * Include: artisan wooden cutting board with sliced bread and fresh citrus, a premium espresso machine or kettle, clear glass canisters with dry grains or pasta, small ceramic pots with living herbs (basil/rosemary), a decorative fruit bowl, olive oil bottles, pepper grinder, stacked cookbooks, and a neatly folded linen towel.
     * The kitchen feels actively loved and used, yet strictly preserves all cabinetry geometry, lines, and finishes.
     * STRICT IMMUTABILITY OF FURNITURE: All decorative objects must ONLY sit on top of existing horizontal surfaces (countertops). Under NO circumstance should any cabinet, drawer, door, appliance, handle, island, peninsula, or wall module be added, removed, resized, or altered. The cabinetry architecture remains 100% identical to the 3D capture.`
    : `- TASTEFUL DECORATION & LIVING PROPS (LEVEL 2 - BALANCED EDITORIAL INTERIOR):
     * Place rich, realistic, architectural lifestyle elements resting naturally ONLY ON THE EXISTING COUNTERTOP SURFACES${hasIsland ? ' AND ISLAND' : ''}.
     * Include: a sleek designer coffee machine or stainless/matte kettle, an artisan wood cutting board with fresh citrus/bread, small ceramic pots with fresh green herbs (basil/rosemary) or a delicate minimalist vase with natural greenery, elegant salt/pepper mills, and a neatly folded linen kitchen towel.
     * Countertops maintain a clean, organized, editorial balance.
     * STRICT IMMUTABILITY OF FURNITURE: All decorative objects must ONLY sit on top of existing horizontal surfaces (countertops). Under NO circumstance should any cabinet, drawer, door, appliance, handle, island, peninsula, or wall module be added, removed, resized, or altered. The cabinetry architecture remains 100% identical to the 3D capture.`;

  const structuredPrompt = `
You are a professional architectural rendering engine. Perform a strict photorealistic restyling of this exact 3D CAD/BIM viewport capture.

${inventorySection}

CRITICAL ABSOLUTE LAYOUT FIDELITY & ZERO-HALLUCINATION ENFORCEMENT:
1. STRICT INVENTORY CONFINEMENT (ZERO INVENTED OR REMOVED MODULES):
   - The scene contains ONLY AND STRICTLY ${totalCount} as detailed in the official BIM inventory above.
   - You MUST NOT generate, add, duplicate, or infer any extra cabinet, shelf, hanging unit, kitchen island, cart, or appliance.
   - Any wall or floor space not occupied in the 3D capture must remain completely empty and clean.

2. DOOR & DRAWER INTEGRITY (PROHIBITED MODIFICATIONS):
   - All modules cataloged with doors MUST remain closed with solid, smooth, opaque melamine fronts. UNDER NO CIRCUMSTANCES should closed doors be converted into open display shelves, glass cabinets, or niches.
   - All modules cataloged with drawers MUST reproduce the exact horizontal split lines and count of drawers listed.

3. ${bimManifest?.islandDirectives?.description || (hasIsland 
    ? 'ISLAND FIDELITY:\n   - Replicate the exact island geometry and bounds from the 3D capture.' 
    : 'STRICT OPEN FLOOR PRESERVATION - ABSOLUTELY NO ISLAND, PENINSULA OR BREAKFAST BAR:\n   - This kitchen has NO island, NO peninsula, and NO breakfast bar.\n   - The center and foreground floor is 100% EMPTY, bare, open floor tile space.\n   - ABSOLUTELY FORBIDDEN: DO NOT invent, generate, add, or suggest any kitchen island, peninsula, dining counter, bar, table, or floating module in the open floor. The tiled floor MUST remain completely bare and open.')}

4. BUILT-IN & FREESTANDING APPLIANCES FIDELITY:
   - Freestanding appliances (stove/cooker, refrigerator) and built-in appliances (sink, cooktop, ovens) must remain in their exact specified positions and dimensions with professional stainless steel/black finishes.
   - Do not distort, remove, invent, or relocate any appliances.

5. STRICT COUNTERTOP SPECIFICATION:
   ${bimManifest?.countertop?.description ? `- ${bimManifest.countertop.description}` : '- Follow the exact countertop in the input capture.'}
   ${bimManifest?.countertop?.hasWaterfallLeft ? '- Left waterfall: extends down to the floor in stone.' : ''}
   ${bimManifest?.countertop?.hasWaterfallRight ? '- Right waterfall: extends down to the floor in stone.' : ''}
   ${bimManifest?.countertop && !bimManifest.countertop.hasWaterfallLeft && !bimManifest.countertop.hasWaterfallRight ? '- Straight end finish on both sides (no waterfall drops to the floor).' : ''}

6. BASE SUPPORT & ZÓCALO FIDELITY:
   ${bimManifest?.socle?.directive || bimManifest?.socleDirective ? `- STRICT BASE DIRECTIVE: ${bimManifest?.socle?.directive || bimManifest?.socleDirective}` : '- Follow the exact base support in the input capture.'}

7. STRICT MATERIAL & WOOD TONE FIDELITY:
   - Wood Tone: ${bimManifest?.finishSummary?.woodToneDetails || bimManifest?.woodToneDetails || 'Roble nórdico claro rubio / light blonde oak, veta sutil limpia'}.
   - Hardware: ${bimManifest?.hardwareSummary || bimManifest?.hardware || 'Tiradores en acabado Negro Mate'}.
   - Floor: ${bimManifest?.finishSummary?.floorDescription || bimManifest?.flooring || 'Baldosas cerámicas'}.
   - Walls: ${bimManifest?.finishSummary?.wallColor || bimManifest?.wallFinish || 'Pintura lisa'}.

8. ARCHITECTURAL STAGING & PROPS (DECORATION):
   - Maintain pristine architectural staging and high-end interior editorial realism.
   ${hasPeople ? '- HUMAN STAGING: 1 realistic person standing naturally inside the open room floor space, without obstructing or modifying any cabinetry design.' : '- NO HUMANS: STRICTLY NO PEOPLE, no figures, no silhouettes anywhere in the scene.'}
   ${stagingPropsSection}

9. CAMERA POSE & PERSPECTIVE IMMUTABILITY:
   - DO NOT change the camera angle, elevation, pitch, yaw, or framing.
   - Maintain the exact camera perspective from the input capture.
   - ARCHITECTURAL 2-POINT PERSPECTIVE: Keep all vertical cabinetry lines, tall units, door seams, and wall corners strictly plumb, parallel, and vertical (architectural tilt-shift lens look, zero converging vertical distortion).

10. PHOTOREALISTIC RESTYLING TASK:
   - Replace the flat/shaded 3D viewport look with high-end architectural editorial rendering: physically accurate daylight, subtle contact ambient occlusion, realistic reflections on stone countertops, smooth Scandinavian wood grain, and crisp black hardware.
   - PHYSICAL MATERIALITY & REALISTIC FINISHES:
     * Subtle micro-bevels (1mm soft chamfer) on cabinet edges to catch natural specular light, avoiding computer-generated sharp artificial edges.
     * Accurate diffuse and specular reflections on countertops (natural stone/quartz reflection without excessive glare).
     * Soft, silky matte anti-fingerprint texture on solid melamine fronts with clean tactile grain on wood fronts.
     * Hardware: Crisp matte powder-coated black finish on handles.
   - STRICT LIGHTING FIDELITY (NO INVENTED LIGHT FIXTURES):
     * ABSOLUTELY DO NOT add, invent, or draw any under-cabinet LED light strips, spotlights, or hidden light bars unless they are physically modeled in the 3D input geometry. The cabinetry must reflect strictly what is manufactured and sold.
     * Ambient Lighting: ${lighting || 'Luz natural de sol de mañana, suave y brillante'}.
     * Property context: ${propertyType || 'Casa Residencial moderna'}.
  `.trim();

  let mimeType = 'image/jpeg';
  const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  if (mimeMatch) {
    mimeType = mimeMatch[1];
  }
  const cleanImageBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  let response;
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
    });
  } catch (nanoError: any) {
    console.warn('Fallback a gemini-3.1-flash-lite-image por:', nanoError?.message);
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

  return { imageUrl: generatedImageUrl };
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
      userMsg = 'Límite de cuota alcanzado (Error 429) en la API Key gratuita para el modelo NanoBanana. Activa una clave de API con facturación en la configuración de la plataforma para continuar generando renders sin restricciones.';
    } else if (error?.message) {
      userMsg = error.message;
    }

    return res.status(500).json({ error: userMsg });
  }
}
