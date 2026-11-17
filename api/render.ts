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
  const { imageBase64, prompt, propertyType, environment, lighting, hasPeople, hasProps, renderStyle, bimManifest } = body || {};

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
   ${hasProps ? `- TASTEFUL DECORATION & LIVING PROPS:
     * Place rich, realistic, architectural lifestyle elements resting naturally ONLY ON THE EXISTING COUNTERTOP SURFACES${hasIsland ? ' AND ISLAND' : ''}.
     * Include: a sleek designer coffee machine or stainless/matte kettle, an artisan wood cutting board with fresh citrus/bread, small ceramic pots with fresh green herbs (basil/rosemary) or a delicate minimalist vase with natural greenery, elegant salt/pepper mills, and a neatly folded linen kitchen towel.
     * STRICT IMMUTABILITY OF FURNITURE: All decorative objects must ONLY sit on top of existing horizontal surfaces (countertops). Under NO circumstance should any cabinet, drawer, door, appliance, handle, island, peninsula, or wall module be added, removed, resized, or altered. The cabinetry architecture remains 100% identical to the 3D capture.` : '- NO PROPS: Keep countertops and surfaces completely clean, pristine, polished, and free of clutter or staging objects.'}

9. CAMERA POSE & PERSPECTIVE IMMUTABILITY:
   - DO NOT change the camera angle, elevation, pitch, yaw, or framing.
   - Maintain the exact camera perspective from the input capture.

10. PHOTOREALISTIC RESTYLING TASK:
   - Replace the flat/shaded 3D viewport look with high-end architectural rendering: physically accurate daylight, subtle contact ambient occlusion, realistic reflections on stone countertops, smooth light Scandinavian wood grain, and crisp black hardware.
   - Ambient Lighting: ${lighting || 'Luz natural de sol de mañana, suave y brillante'}.
   - Property context: ${propertyType || 'Casa Residencial moderna'}.
  `.trim();

  const cleanImageBase64 = imageBase64.replace(/^data:image\/(png|jpeg|webp);base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: cleanImageBase64,
            mimeType: 'image/png',
          },
        },
        {
          text: structuredPrompt,
        },
      ],
    },
  });

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
