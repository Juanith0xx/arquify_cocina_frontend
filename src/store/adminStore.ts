import { create } from 'zustand';
import { getSupabase } from '../lib/supabase';
import { useSupabaseAuthStore } from './supabaseAuthStore';
import { useKitchenStore } from './kitchenStore';
import { useStore as useClosetStore } from '../store';
import {
  fetchCloudTextures,
  saveCloudTexture,
  deleteCloudTexture,
} from '../utils/texturesApiService';

export type ProjectType = 'closet' | 'kitchen' | 'special' | 'hpl-bathroom' | 'office' | 'chair';
export type ProjectStatus = 'designed' | 'quoted' | 'sold' | 'in_production';

export interface ProjectAiRender {
  id: string;
  url: string;
  createdAt: string;
  propertyType?: string;
  environment?: string;
  lighting?: string;
  hasPeople?: boolean;
  hasProps?: boolean;
}

export interface ProjectItem {
  id: string;
  name: string;
  client: string;
  date: string;
  type: ProjectType;
  description: string;
  totalCostEstimateClp: number;
  data: any;
  status?: ProjectStatus;
  soldDate?: string;
  finalSalePriceClp?: number;
  orderNumber?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  userRubro?: string;
  userCity?: string;
  thumbnail?: string;
  aiRenders?: ProjectAiRender[];
}

export type SupplyCategory = 
  | 'melamina' 
  | 'herrajes' 
  | 'cubiertas_qstone' 
  | 'madera' 
  | 'fijaciones_sellantes'
  | 'pisos'
  | 'muros'
  | 'cortinas'
  | 'ventanas'
  | 'puertas'
  | 'focos'
  | 'rodones_burletes'
  | 'marqueteria';

export type SupplyUnitFormat = 'caja' | 'galon' | 'tinaja' | 'rollo' | 'metro_lineal' | 'unidad';

export interface SupplyItem {
  id: string;
  category: SupplyCategory;
  name: string;
  code: string;
  spec: string;
  unit: string;
  priceClp: number;
  supplier: string;
  stockRef?: number;
  providerId?: string;
  notes?: string;
  // Campos de Remodelación/Decoración
  unitFormat?: SupplyUnitFormat;
  coveragePerUnitM2?: number; // ej: 2.15 m2 por caja, 12 m2 por galón, 5.3 m2 por rollo
  commissionPercentage?: number; // % comisión/margen Arquify (ej: 20%)
  providerNetPriceClp?: number; // Precio neto del proveedor
  imageUrl?: string; // Foto del insumo cargada por el proveedor
  // Campos de Ofertas Promocionales
  isOfferActive?: boolean;
  offerDiscountPercent?: number; // ej: 30 (% de descuento)
  offerPriceClp?: number; // Precio promocional calculado o personalizado
  offerStockLimit?: number; // Stock máximo asignado a la oferta
  offerExpirationDate?: string; // Fecha de término YYYY-MM-DD
}

export type TextureApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ManufacturingRateConfig {
  manufacturingPricePerM2: number; // Tarifa base de manufactura CLP/m² neto procesado (corte + canteado + mecanizado CNC)
  preAssemblyPricePerCabinet: number; // Tarifa opcional de pre-armado por mueble/módulo
  enablePreAssembly: boolean; // Si el pre-armado en fábrica está activo por defecto
  minifixMachiningPrice: number; // Tarifa opcional de perforación minifix por mueble
  defaultDesignerMarginPercent: number; // Margen comercial sugerido al diseñador/arquitecto (ej: 35%)
}

export const DEFAULT_MANUFACTURING_RATES: ManufacturingRateConfig = {
  manufacturingPricePerM2: 14500, // $14.500 CLP por m² de panel neto (sin mermas)
  preAssemblyPricePerCabinet: 8500, // $8.500 CLP por módulo armado
  enablePreAssembly: false,
  minifixMachiningPrice: 2500,
  defaultDesignerMarginPercent: 35, // 35% de margen comercial sobre costo B2B
};

export interface CustomTextureItem {
  id: string;
  name: string;
  code: string;
  brand: string;
  category: 'maderas' | 'solidos' | 'hpl_autor' | 'piedras_marmoles';
  finish: string;
  sheetFormat: string;
  priceM2Clp: number;
  priceSheetClp: number;
  url: string;
  previewUrl: string;
  active: boolean;
  createdAt: string;
  // Flujo de Proveedores y VB Superadmin
  providerId?: string;
  providerName?: string;
  approvalStatus?: TextureApprovalStatus;
  commissionPercentage?: number;
  providerNetPriceClp?: number;
  rejectionReason?: string;
  // Espesor técnico y medidas métricas de plancha
  thicknessMm?: number;
  sheetWidthM?: number;
  sheetHeightM?: number;
  // Stock disponible en inventario (planchas / unidades)
  stock?: number;
  // Campos de Ofertas Promocionales
  isOfferActive?: boolean;
  offerDiscountPercent?: number;
  offerPriceClp?: number;
  offerStockLimit?: number;
  offerExpirationDate?: string;
}

export function isSupplyOfferValid(item: {
  isOfferActive?: boolean;
  offerExpirationDate?: string;
  offerStockLimit?: number;
  stockRef?: number;
  stock?: number;
}): boolean {
  if (!item.isOfferActive) return false;

  // Verificar fecha límite de oferta
  if (item.offerExpirationDate && item.offerExpirationDate.trim()) {
    const today = new Date().toISOString().split('T')[0];
    if (item.offerExpirationDate < today) return false;
  }

  // Verificar stock asignado a la oferta
  if (item.offerStockLimit !== undefined && item.offerStockLimit !== null) {
    if (item.offerStockLimit <= 0) return false;
  }

  // Verificar stock general en bodega
  const generalStock = item.stockRef ?? item.stock ?? 999;
  if (generalStock <= 0) return false;

  return true;
}

export function getEffectiveSupplyPrice(item: {
  priceClp: number;
  isOfferActive?: boolean;
  offerDiscountPercent?: number;
  offerPriceClp?: number;
  offerStockLimit?: number;
  offerExpirationDate?: string;
  stockRef?: number;
  stock?: number;
}): number {
  if (isSupplyOfferValid(item)) {
    if (item.offerPriceClp && item.offerPriceClp > 0) {
      return item.offerPriceClp;
    }
    if (item.offerDiscountPercent && item.offerDiscountPercent > 0) {
      return Math.round(item.priceClp * (1 - item.offerDiscountPercent / 100));
    }
  }
  return item.priceClp;
}

export interface ProviderItem {
  id: string;
  name: string;
  rut?: string;
  email: string;
  phone?: string;
  address?: string;
  commissionPercentage: number; // % comisión de Arquify por defecto (ej. 15%)
  active: boolean;
  createdAt: string;
}

export interface AnonymousProjectUsage {
  id: string;
  code: string;
  type: ProjectType;
  date: string;
  productsUsedCount: number;
  matchedProducts: { code: string; name: string; count: number }[];
}

export interface ProviderStats {
  providerName: string;
  totalProjects: number;
  totalProductsUsed: number;
  productsBreakdown: {
    code: string;
    name: string;
    count: number;
    estimatedAreaM2: number;
  }[];
  anonymousProjects: AnonymousProjectUsage[];
}

export interface AdminSessionUser {
  id?: string;
  email: string;
  full_name: string;
  role: 'superadmin' | 'tenant_admin' | 'designer' | 'operator' | 'free_user';
  tenant_id?: string;
  tenant_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  commune?: string;
  country?: string;
  rubro?: 'Diseñador' | 'Arquitecto' | 'Mueblista' | 'Inmobiliaria / Constructora' | 'Particular' | string;
  avatar_url?: string;
}

export interface RegisteredFreeUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  commune: string;
  country: string;
  rubro: 'Diseñador' | 'Arquitecto' | 'Mueblista' | 'Inmobiliaria / Constructora' | 'Particular' | string;
  password?: string;
  createdAt: string;
}

export interface UserAccessLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  phone?: string;
  userPhone?: string;
  rubro?: string;
  userRubro?: string;
  city?: string;
  userCity?: string;
  commune?: string;
  userCommune?: string;
  timestamp: string;
  module: string;
}

export interface NanoBananaUsageLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  timestamp: string;
  propertyType?: string;
  environment: string;
  lighting: string;
  hasPeople: boolean;
  hasProps: boolean;
  creditsUsed: number;
}

export interface AdminState {
  // Autenticación
  isAuthenticated: boolean;
  adminEmail: string | null;
  currentUser: AdminSessionUser | null;
  login: (user: string, pass: string) => { success: boolean; error?: string };
  logout: () => void;
  updateCurrentUserProfile: (updates: Partial<AdminSessionUser>) => void;

  // Usuarios Registrados y Registro de Accesos (Auditoría Superadmin)
  registeredUsers: RegisteredFreeUser[];
  accessLogs: UserAccessLog[];
  registerFreeUser: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    commune: string;
    country: string;
    rubro: 'Diseñador' | 'Arquitecto' | 'Mueblista' | 'Inmobiliaria / Constructora' | 'Particular' | string;
    password?: string;
  }) => { success: boolean; user?: AdminSessionUser; error?: string };
  logAccess: (moduleOrData?: string | Partial<UserAccessLog>) => void;
  markProjectAsPurchased: (projectId: string, orderNumber?: string, finalPrice?: number) => void;

  // NanoBanana Renders AI (Créditos y Auditoría)
  nanoBananaCreditsMap: Record<string, number>;
  nanoBananaUsageLogs: NanoBananaUsageLog[];
  getUserNanoBananaCredits: (userEmailOrId?: string, role?: string) => number;
  deductNanoBananaCredit: (logData: {
    userId?: string;
    userEmail?: string;
    userName?: string;
    propertyType?: string;
    environment: string;
    lighting: string;
    hasPeople: boolean;
    hasProps: boolean;
  }) => { success: boolean; creditsRemaining: number; error?: string };
  setUserNanoBananaCredits: (userEmailOrId: string, credits: number) => void;

  // Modo Claro / Oscuro del Backoffice
  themeMode: 'dark' | 'light';
  setThemeMode: (mode: 'dark' | 'light') => void;
  toggleThemeMode: () => void;

  // Visualización en Vivo de Precios / Modo Cliente
  livePriceDisplayMode: 'none' | 'cost' | 'sale';
  setLivePriceDisplayMode: (mode: 'none' | 'cost' | 'sale') => void;
  liveSaleMarginPercent: number; // Margen unificado 0% a 500%
  setLiveSaleMarginPercent: (margin: number) => void;
  liveSaleMarginFurniturePercent: number; // Margen muebles 0% a 500%
  setLiveSaleMarginFurniturePercent: (margin: number) => void;
  liveSaleMarginCountertopPercent: number; // Margen cubiertas 0% a 500%
  setLiveSaleMarginCountertopPercent: (margin: number) => void;
  differentiateMargins: boolean; // Si los márgenes de cubiertas y muebles están diferenciados
  setDifferentiateMargins: (enabled: boolean) => void;

  // Proveedores
  providers: ProviderItem[];
  addProvider: (provider: Omit<ProviderItem, 'id' | 'createdAt'>) => string;
  updateProvider: (id: string, updates: Partial<ProviderItem>) => void;
  deleteProvider: (id: string) => void;

  // Proyectos
  projects: ProjectItem[];
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  saveProject: (project: Omit<ProjectItem, 'id' | 'date'>) => string;
  updateProject: (id: string, updates: Partial<ProjectItem>) => void;
  renameProject: (id: string, newName: string, newClient?: string) => void;
  duplicateProject: (id: string) => string;
  deleteProject: (id: string) => void;
  clearAllProjects: () => void;
  syncCloudProjects: () => Promise<void>;
  addProjectAiRender: (projectId: string, render: Omit<ProjectAiRender, 'id' | 'createdAt'>) => void;
  deleteProjectAiRender: (projectId: string, renderId: string) => void;

  // Estadísticas Anónimas para Proveedores
  getProviderStats: (providerIdOrName: string) => ProviderStats;

  // Precios de Insumos
  supplies: SupplyItem[];
  updateSupplyPrice: (id: string, newPrice: number) => void;
  updateSupply: (id: string, updates: Partial<SupplyItem>) => void;
  addSupply: (supply: Omit<SupplyItem, 'id'>) => string;
  deleteSupply: (id: string) => void;
  resetSuppliesToDefault: () => void;

  // Texturas y Decorativos
  textures: CustomTextureItem[];
  addTexture: (
    texture: Omit<CustomTextureItem, 'id' | 'createdAt'>,
    options?: { skipCloudSync?: boolean }
  ) => string;
  updateTexture: (
    id: string,
    updates: Partial<CustomTextureItem>,
    options?: { skipCloudSync?: boolean }
  ) => void;
  toggleTextureActive: (id: string) => void;
  approveTexture: (id: string) => void;
  rejectTexture: (id: string, reason?: string) => void;
  deleteTexture: (id: string) => void;
  resetTexturesToDefault: () => void;
  syncCloudTextures: () => Promise<void>;
  saveTextureToCloud: (
    id: string,
    isNew?: boolean
  ) => Promise<{ ok: boolean; texture?: CustomTextureItem; error?: string }>;

  // Tarifas de Manufactura B2B
  manufacturingRates: ManufacturingRateConfig;
  updateManufacturingRates: (updates: Partial<ManufacturingRateConfig>) => void;
  resetManufacturingRates: () => void;
}

export const DEFAULT_SUPPLIES: SupplyItem[] = [
  // Melamina y Tableros
  {
    id: 'mel-15-blanco',
    category: 'melamina',
    name: 'Melamina 15mm Blanco Estándar (1.83 x 2.50 m)',
    code: 'TAB-MEL-15-BLA',
    spec: 'Base aglomerado MDP 15 mm, 2 caras melamínicas',
    unit: 'Plancha (4.57 m²)',
    priceClp: 28900,
    supplier: 'Arauco / Masisa',
    stockRef: 120,
    notes: 'Tablero para interiores de módulo y fondos'
  },
  {
    id: 'mel-18-blanco',
    category: 'melamina',
    name: 'Melamina 18mm Blanco Premium (1.83 x 2.50 m)',
    code: 'TAB-MEL-18-BLA',
    spec: 'Aglomerado alta densidad 18 mm, acabado Soft',
    unit: 'Plancha (4.57 m²)',
    priceClp: 34500,
    supplier: 'Arauco / Masisa',
    stockRef: 85,
    notes: 'Estructura principal y laterales de gabinetes'
  },
  {
    id: 'mel-18-diseno',
    category: 'melamina',
    name: 'Melamina 18mm Roble / Madera Diseño (1.83 x 2.50 m)',
    code: 'TAB-MEL-18-ROB',
    spec: 'Diseño sincronizado con textura maderada',
    unit: 'Plancha (4.57 m²)',
    priceClp: 46900,
    supplier: 'Masisa Línea Innova',
    stockRef: 60,
    notes: 'Frentes, puertas y vistas expuestas'
  },
  {
    id: 'hpl-abet-305',
    category: 'melamina',
    name: 'Laminado Alta Presión HPL Abet Laminati (1.30 x 3.05 m)',
    code: 'LAM-HPL-ABET-09',
    spec: 'HPL espesor 0.9 mm de autor para aplacado',
    unit: 'Plancha (3.96 m²)',
    priceClp: 92000,
    supplier: 'Abet Laminati Italia',
    stockRef: 24,
    notes: 'Aplacado en MDF 18 mm con contrabalanceador'
  },

  // Herrajes y Canto
  {
    id: 'canto-pvc-05',
    category: 'herrajes',
    name: 'Tapacanto PVC 0.45 mm x 22 mm',
    code: 'CANTO-PVC-045',
    spec: 'PVC flexible con primer adhesivo hot-melt',
    unit: 'Metro lineal',
    priceClp: 180,
    supplier: 'Provelcar / Rehau',
    stockRef: 2500,
    notes: 'Cantos interiores no expuestos'
  },
  {
    id: 'canto-pvc-20',
    category: 'herrajes',
    name: 'Tapacanto PVC 2.00 mm x 22 mm Anti-Impacto',
    code: 'CANTO-PVC-200',
    spec: 'PVC rígido biselado para frentes y puertas',
    unit: 'Metro lineal',
    priceClp: 620,
    supplier: 'Provelcar / Rehau',
    stockRef: 1200,
    notes: 'Alta durabilidad para frentes de cajón y puertas'
  },
  {
    id: 'bisagra-cierre-suave',
    category: 'herrajes',
    name: 'Bisagra Cazoleta 35mm Cierre Suave Clip-On 110°',
    code: 'HER-BIS-CS-110',
    spec: 'Base 3D de regulación excéntrica y pistón hidráulico',
    unit: 'Par',
    priceClp: 3200,
    supplier: 'DTC / Blum / Häfele',
    stockRef: 300,
    notes: '2 a 4 por puerta según altura'
  },
  {
    id: 'corredera-telescopica-soft',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (500mm)',
    code: 'HER-CORR-TEL-500',
    spec: 'Capacidad de carga 35 kg con amortiguador dual',
    unit: 'Juego (Par)',
    priceClp: 8900,
    supplier: 'DTC / Provelcar',
    stockRef: 150,
    notes: 'Para cajones de cocina y clóset'
  },
  {
    id: 'patas-regulables-100',
    category: 'herrajes',
    name: 'Pata Plástica Regulable H=100-120mm + Clip Zócalo',
    code: 'HER-PATA-REG-100',
    spec: 'Polímero reforzado soporta 150 kg/pata',
    unit: 'Unid.',
    priceClp: 850,
    supplier: 'Häfele / Provelcar',
    stockRef: 400,
    notes: 'Nivelación precisa de gabinetes bajos'
  },
  {
    id: 'conector-minifix',
    category: 'herrajes',
    name: 'Kit Conector Minifix Perno + Caja Rasant 15mm',
    code: 'HER-MINIFIX-15',
    spec: 'Zamac niquelado para unión oculta desmontable',
    unit: 'Kit',
    priceClp: 290,
    supplier: 'Häfele',
    stockRef: 2000,
    notes: 'Ensamble de módulos desarmables'
  },
  {
    id: 'tarugos-madera-8x30',
    category: 'herrajes',
    name: 'Tarugos de Madera 8x30mm (Bolsa / Unidad)',
    code: 'INS-TARUGO-8X30',
    spec: 'Tarugos de haya estriados para ensamble y guías de alineación 8x30 mm',
    unit: 'Unid.',
    priceClp: 35,
    supplier: 'Provelcar / Häfele',
    stockRef: 5000,
    notes: 'Encastre estructural mecanizado y guías de centrado'
  },
  {
    id: 'tornillos-spax-50',
    category: 'herrajes',
    name: 'Tornillos Soberbio / Spax 4x50mm',
    code: 'INS-TOR-SPAX-4X50',
    spec: 'Tornillo mueblista cincado rosca madera cabeza plana PZ2',
    unit: 'Unid.',
    priceClp: 45,
    supplier: 'Spax / Catenaccio',
    stockRef: 8000,
    notes: 'Armado general de gabinetes y módulos'
  },
  {
    id: 'tornillos-spax-40',
    category: 'herrajes',
    name: 'Tornillos Spax 4x40mm (Cajas de Cajón)',
    code: 'INS-TOR-SPAX-4X40',
    spec: 'Tornillo de armado 4.0 x 40mm para cajonería y frentes',
    unit: 'Unid.',
    priceClp: 38,
    supplier: 'Spax / Catenaccio',
    stockRef: 6000,
    notes: 'Fijación de laterales y frentes/traseras de cajón'
  },
  {
    id: 'tornillos-frentescajon-30',
    category: 'herrajes',
    name: 'Tornillos Fijación Frente de Cajón 4x30mm',
    code: 'INS-TOR-FRENTE-4X30',
    spec: 'Tornillo de fijación frontal con golilla integrada',
    unit: 'Unid.',
    priceClp: 40,
    supplier: 'Provelcar',
    stockRef: 4000,
    notes: 'Fijación de frentes exteriores a cuerpo de cajón'
  },
  {
    id: 'tapas-adhesivas-embellecedoras',
    category: 'herrajes',
    name: 'Tapas Adhesivas Embellecedoras (Minifix / Tornillos Ø15mm)',
    code: 'INS-TAPAS-ADH-15',
    spec: 'Tapas melamínicas autoadhesivas Ø15mm tono coordinado',
    unit: 'Unid.',
    priceClp: 25,
    supplier: 'Provelcar / Rehau',
    stockRef: 10000,
    notes: 'Ocultamiento estético de cajas excéntricas y tornillos de armado'
  },
  {
    id: 'adhesivo-contacto-hpl',
    category: 'herrajes',
    name: 'Adhesivo de Contacto Alta Resistencia (Prensado HPL)',
    code: 'INS-ADH-HPL-GAL',
    spec: 'Pegado de alta resistencia HPL sobre sustrato MDF/MDP',
    unit: 'Litros / Galón',
    priceClp: 8900,
    supplier: 'Agorex / Henkel',
    stockRef: 50,
    notes: 'Aplicación a 2 caras para aplacado de laminados HPL'
  },
  {
    id: 'mdf-durolac-3mm',
    category: 'melamina',
    name: 'Plancha MDF / Durolac Traseras y Fondos 3mm (1.83 x 2.50 m)',
    code: 'TAB-MDF-3MM',
    spec: 'Tablero HDF / Durolac 3 mm blanco 1 cara',
    unit: 'Plancha (4.57 m²)',
    priceClp: 12500,
    supplier: 'Arauco / Masisa',
    stockRef: 150,
    notes: 'Fondos ranurados y traseras de módulos'
  },
  {
    id: 'mdf-sustrato-18mm',
    category: 'melamina',
    name: 'Plancha MDF Crudo / Sustrato Base p/ HPL (18mm) (1.83 x 2.50 m)',
    code: 'TAB-MDF-CRUDO-18',
    spec: 'MDF crudo alta densidad 18 mm sin recubrir para aplacado',
    unit: 'Plancha (4.57 m²)',
    priceClp: 29500,
    supplier: 'Arauco',
    stockRef: 80,
    notes: 'Alma base desnuda para prensado HPL'
  },
  {
    id: 'soportes-repisa-5mm',
    category: 'herrajes',
    name: 'Soportes de Repisa Niquelados Ø5mm (Pitones con Retén/Goma)',
    code: 'HER-SOPORTE-REPISA-5',
    spec: 'Pitón metálico niquelado Ø5mm con goma antiderrapante para repisas interiores',
    unit: 'Unid.',
    priceClp: 45,
    supplier: 'Häfele / Provelcar',
    stockRef: 4000,
    notes: 'Soporte y regulación de repisas móviles'
  },
  {
    id: 'tornillo-35x16',
    category: 'herrajes',
    name: 'Tornillos Fijación Bisagras / Correderas / Patas 3.5x16mm',
    code: 'INS-TOR-35X16',
    spec: 'Tornillo aglomerado cincado 3.5 x 16mm cabeza gota de sebo / plana',
    unit: 'Unid.',
    priceClp: 18,
    supplier: 'Provelcar / Catenaccio',
    stockRef: 15000,
    notes: 'Montaje de cazoletas, bases, guías y patas'
  },
  {
    id: 'tornillo-m4x22',
    category: 'herrajes',
    name: 'Tornillos M4 x 22mm para Tiradores',
    code: 'INS-TOR-M4X22',
    spec: 'Tornillo métrico M4x22mm para tiradores en tableros 15-18mm',
    unit: 'Unid.',
    priceClp: 35,
    supplier: 'Provelcar',
    stockRef: 5000,
    notes: 'Fijación posterior de manillas y tiradores'
  },
  {
    id: 'colgador-aereo-oculto',
    category: 'herrajes',
    name: 'Colgadores Regulables Ocultos p/ Mueble Aéreo (Juego Izq/Der)',
    code: 'HER-COLGADOR-AEREO',
    spec: 'Capacidad 130 kg por par con regulación 3D en profundidad y altura',
    unit: 'Juego',
    priceClp: 2400,
    supplier: 'Häfele / Camar',
    stockRef: 200,
    notes: 'Suspensión invisible para muebles altos'
  },
  {
    id: 'riel-suspension-aereo',
    category: 'herrajes',
    name: 'Riel de Suspensión Metálico p/ Muro (Tira de Anclaje)',
    code: 'HER-RIEL-SUSPENSION',
    spec: 'Perfil metálico perforado de acero galvanizado para anclaje mural',
    unit: 'Unid.',
    priceClp: 3500,
    supplier: 'Häfele / Provelcar',
    stockRef: 150,
    notes: 'Soporte continuo mural para colgadores aéreos'
  },
  {
    id: 'clip-zocalo-pata',
    category: 'herrajes',
    name: 'Pinzas / Clips de Fijación Zócalo a Pata',
    code: 'HER-CLIP-ZOCALO',
    spec: 'Clip de plástico con resorte para enganche a patas regulables Ø28-30mm',
    unit: 'Unid.',
    priceClp: 180,
    supplier: 'Provelcar / Häfele',
    stockRef: 1000,
    notes: 'Enganche a presión sobre patas niveladoras'
  },
  {
    id: 'zocalo-aluminio-3m',
    category: 'herrajes',
    name: 'Zócalo de PVC/Aluminio con Sello de Agua (Tira 3000mm / 3m)',
    code: 'HER-ZOCALO-ALU-3M',
    spec: 'Tira de zócalo 100mm en acabado Aluminio Satinado / Negro con labio flexible inferior',
    unit: 'Tira (3m)',
    priceClp: 12500,
    supplier: 'Rehau / Provelcar',
    stockRef: 60,
    notes: 'Protección hidrófuga perimetral de gabinetes inferiores'
  },
  {
    id: 'zocalo-perfil-union',
    category: 'herrajes',
    name: 'Perfil Unión Recta 180° para Zócalo (Empalme >3m)',
    code: 'HER-ZOC-UNION-180',
    spec: 'Conector de PVC/Aluminio para empalme lineal continuo de zócalos',
    unit: 'Unid.',
    priceClp: 450,
    supplier: 'Rehau / Provelcar',
    stockRef: 100,
    notes: 'Empalme técnico en tramos mayores a 3 metros'
  },
  {
    id: 'zocalo-conector-esquinero',
    category: 'herrajes',
    name: 'Conector Esquinero 90° para Zócalo',
    code: 'HER-ZOC-ESQ-90',
    spec: 'Esquinero de PVC/Aluminio para encuentro en esquina a 90°',
    unit: 'Unid.',
    priceClp: 450,
    supplier: 'Rehau / Provelcar',
    stockRef: 120,
    notes: 'Encuentros frontales y retornos en esquinas expuestas'
  },
  {
    id: 'zocalo-terminal-tapa',
    category: 'herrajes',
    name: 'Terminal / Tapa Final de Zócalo (Remate a Pared)',
    code: 'HER-ZOC-TERMINAL',
    spec: 'Tapa remate lateral de PVC/Aluminio para zócalos expuestos',
    unit: 'Unid.',
    priceClp: 450,
    supplier: 'Rehau / Provelcar',
    stockRef: 150,
    notes: 'Cierre lateral hermético hacia muro estructural'
  },

  // Cubiertas y Marmolería Qstone / SYSPROTEC (Cuarzos & Sinterizados Oficiales)
  {
    id: 'qs-pure-white-18',
    category: 'cubiertas_qstone',
    name: 'Qstone Cuarzo Pure White 18mm',
    code: 'QP_PW21320160',
    spec: 'Cuarzo blanco puro 18mm formato 3.20 x 1.60 m (5.12 m²). Venta c/IVA $339.818 /m²',
    unit: 'm²',
    priceClp: 339818,
    supplier: 'SYSPROTEC (Qstone)',
    stockRef: 40,
    notes: 'Margen Robfu 20% ($56.636 /m²)'
  },
  {
    id: 'qs-black-mamba-18',
    category: 'cubiertas_qstone',
    name: 'Qstone Cuarzo Black Mamba 18mm',
    code: 'QP_BM22320160',
    spec: 'Cuarzo 18mm formato 3.20 x 1.60 m (5.12 m²). Venta c/IVA $338.859 /m² (neto $237.296)',
    unit: 'm²',
    priceClp: 338859,
    supplier: 'SYSPROTEC (Qstone)',
    stockRef: 25,
    notes: 'Margen Robfu 20% ($56.476 /m²)'
  },
  {
    id: 'qs-calacatta-gold-20',
    category: 'cubiertas_qstone',
    name: 'Qstone Cuarzo Calacatta Gold 20mm',
    code: 'QP_CO31320160',
    spec: 'Cuarzo blanco veta dorada 20mm formato 3.20 x 1.60 m (5.12 m²). Venta c/IVA $612.315 /m²',
    unit: 'm²',
    priceClp: 612315,
    supplier: 'SYSPROTEC (Qstone)',
    stockRef: 15,
    notes: 'Margen Robfu 20% ($102.052 /m²)'
  },
  {
    id: 'qs-sand-20',
    category: 'cubiertas_qstone',
    name: 'Qstone Cuarzo Sand 20mm',
    code: 'QP_SA31320160',
    spec: 'Cuarzo tono arena 20mm formato 3.20 x 1.60 m (5.12 m²). Venta c/IVA $353.264 /m²',
    unit: 'm²',
    priceClp: 353264,
    supplier: 'SYSPROTEC (Qstone)',
    stockRef: 20,
    notes: 'Margen Robfu 20% ($58.877 /m²)'
  },
  {
    id: 'qs-sint-ana-white-12',
    category: 'cubiertas_qstone',
    name: 'Qstone Sinterizado Ana White 12mm',
    code: 'QP_AN51320160',
    spec: 'Piedra sinterizada blanco satinado 12mm formato 3.20 x 1.60 m (5.12 m²). Venta c/IVA $331.282 /m²',
    unit: 'm²',
    priceClp: 331282,
    supplier: 'SYSPROTEC (Qstone)',
    stockRef: 15,
    notes: 'Margen Robfu 20% ($55.214 /m²)'
  },
  {
    id: 'qs-sint-aurota-black-12',
    category: 'cubiertas_qstone',
    name: 'Qstone Sinterizado Aurota Black 12mm',
    code: 'QP_AB52320160',
    spec: 'Piedra sinterizada negro mate 12mm formato 3.20 x 1.60 m (5.12 m²). Venta c/IVA $331.282 /m²',
    unit: 'm²',
    priceClp: 331282,
    supplier: 'SYSPROTEC (Qstone)',
    stockRef: 15,
    notes: 'Margen Robfu 20% ($55.214 /m²)'
  },
  {
    id: 'qs-sint-lime-stone-grey-12',
    category: 'cubiertas_qstone',
    name: 'Qstone Sinterizado Lime Stone Grey 12mm',
    code: 'QP_LS52320160',
    spec: 'Piedra sinterizada caliza gris 12mm formato 3.20 x 1.60 m (5.12 m²). Venta c/IVA $331.282 /m²',
    unit: 'm²',
    priceClp: 331282,
    supplier: 'SYSPROTEC (Qstone)',
    stockRef: 15,
    notes: 'Margen Robfu 20% ($55.214 /m²)'
  },

  // --- INSUMOS DE DECORACIÓN Y REMODELACIÓN ---
  // Pisos (Cajas)
  {
    id: 'piso-porcelanato-60x60',
    category: 'pisos',
    name: 'Porcelanato Rectificado 60x60 cm Gris Cementicio',
    code: 'PISO-PORC-60',
    spec: 'Formato 60x60 cm, espesor 9 mm, caja contiene 1.44 m²',
    unit: 'Caja (1.44 m²)',
    unitFormat: 'caja',
    coveragePerUnitM2: 1.44,
    priceClp: 24990,
    providerNetPriceClp: 19992,
    commissionPercentage: 20,
    supplier: 'MK / Ambientes',
    stockRef: 150,
    notes: 'Tráfico alto ideal para cocinas y áreas comunes'
  },
  {
    id: 'piso-flotante-8mm',
    category: 'pisos',
    name: 'Piso Fotolaminado Flotante 8mm Roble Natural AC4',
    code: 'PISO-FLOT-8M',
    spec: 'Biselado 4V, caja contiene 2.13 m²',
    unit: 'Caja (2.13 m²)',
    unitFormat: 'caja',
    coveragePerUnitM2: 2.13,
    priceClp: 21990,
    providerNetPriceClp: 17592,
    commissionPercentage: 20,
    supplier: 'Krono / MK',
    stockRef: 200,
    notes: 'Resistente a humedad ligera'
  },

  // Muros (Pinturas, Papel Mural, Revestimientos)
  {
    id: 'muro-pintura-tinaja',
    category: 'muros',
    name: 'Pintura Esmalte al Agua Blanco Neutro / Lino (Tinaja 5 Galones)',
    code: 'PIN-TINAJA-5G',
    spec: 'Tinaja de 5 galones (~18.9 L). Rinde aprox. 80 m² a 2 manos',
    unit: 'Tinaja (80 m²)',
    unitFormat: 'tinaja',
    coveragePerUnitM2: 80,
    priceClp: 78900,
    providerNetPriceClp: 63120,
    commissionPercentage: 20,
    supplier: 'Sherwin Williams / Tricolor',
    stockRef: 40,
    notes: 'Lavable mate para muros interiores'
  },
  {
    id: 'muro-papel-mural-botanico',
    category: 'muros',
    name: 'Papel Mural Vinílico Texturizado Diseño Botánico',
    code: 'PAPEL-MUR-BOT',
    spec: 'Rollo de 0.53 x 10 m (Cubre 5.3 m² netos). Lavable e ignífugo',
    unit: 'Rollo (5.3 m²)',
    unitFormat: 'rollo',
    coveragePerUnitM2: 5.3,
    priceClp: 39900,
    providerNetPriceClp: 31920,
    commissionPercentage: 20,
    supplier: 'CasaMural / DecoStyle',
    stockRef: 60,
    notes: 'Apto para muro acentuado o ambiente completo'
  },
  {
    id: 'muro-papel-mural-geometrico',
    category: 'muros',
    name: 'Papel Mural Textura Lino / Geométrico Neutro',
    code: 'PAPEL-MUR-GEO',
    spec: 'Rollo de 0.53 x 10 m (Cubre 5.3 m²). Acabado mate de lujo',
    unit: 'Rollo (5.3 m²)',
    unitFormat: 'rollo',
    coveragePerUnitM2: 5.3,
    priceClp: 42900,
    providerNetPriceClp: 34320,
    commissionPercentage: 20,
    supplier: 'CasaMural / DecoStyle',
    stockRef: 45,
    notes: 'Fácil instalación con adhesivo celulósico'
  },

  // Cortinas
  {
    id: 'cortina-roller-duo',
    category: 'cortinas',
    name: 'Cortina Roller Duo Día y Noche a Medida',
    code: 'CORT-ROLLER-DUO',
    spec: 'Mecanismo de aluminio reforzado, tela poliéster blackout/screen',
    unit: 'Unidad',
    unitFormat: 'unidad',
    priceClp: 65000,
    providerNetPriceClp: 52000,
    commissionPercentage: 20,
    supplier: 'Hunter Douglas / Luxaflex',
    stockRef: 30,
    notes: 'Ajuste milimétrico a vanos'
  },

  // Ventanas
  {
    id: 'ventana-pvc-termopanel',
    category: 'ventanas',
    name: 'Ventana PVC Termopanel Doble Vidrio Laminated 120x120 cm',
    code: 'VENT-PVC-120',
    spec: 'Aislamiento térmico y acústico, perfilería europea blanca',
    unit: 'Unidad',
    unitFormat: 'unidad',
    priceClp: 185000,
    providerNetPriceClp: 148000,
    commissionPercentage: 20,
    supplier: 'Kömmerling / Deceuninck',
    stockRef: 15,
    notes: 'Hermética de corredera o abatible'
  },

  // Puertas
  {
    id: 'puerta-interior-madera',
    category: 'puertas',
    name: 'Puerta Interior Terciado HDF Enchapada Roble (80x200 cm) + Marco',
    code: 'PUERTA-ROBLE-80',
    spec: 'Hoja precolgada con marco de MDF hidrófugo y bisagras',
    unit: 'Unidad',
    unitFormat: 'unidad',
    priceClp: 129000,
    providerNetPriceClp: 103200,
    commissionPercentage: 20,
    supplier: 'Masonite / San Francisco',
    stockRef: 25,
    notes: 'No incluye cerradura'
  },

  // Focos
  {
    id: 'foco-led-embutido-9w',
    category: 'focos',
    name: 'Spot LED Embutir 9W Cálido/Neutro Regulable (Pack x 4)',
    code: 'FOCO-LED-9W',
    spec: 'Marco de aluminio blanco mate, 3000K/4000K, IP44',
    unit: 'Unidad (Pack 4 focos)',
    unitFormat: 'unidad',
    priceClp: 19900,
    providerNetPriceClp: 15920,
    commissionPercentage: 20,
    supplier: 'Philips / Eglo',
    stockRef: 100,
    notes: 'Luz empotrada de cielo para iluminación ambiente'
  },

  // Rodones / Burletes
  {
    id: 'rodon-pvc-blanco',
    category: 'rodones_burletes',
    name: 'Guardapolvo / Rodón PVC Flexible e Impermeable (Tira 2.4 m)',
    code: 'RODON-PVC-24M',
    spec: 'Tira de 2.4 metros lineales, alto 70 mm, lavable',
    unit: 'Metro lineal',
    unitFormat: 'metro_lineal',
    coveragePerUnitM2: 2.4,
    priceClp: 3500,
    providerNetPriceClp: 2800,
    commissionPercentage: 20,
    supplier: 'MK / Dural',
    stockRef: 300,
    notes: 'Terminación inferior contra piso'
  },

  // Marquetería
  {
    id: 'marqueteria-cielo-mdf',
    category: 'marqueteria',
    name: 'Moldura / Cornisa de Cielo MDF Peinada 50x50 mm (Tira 2.4 m)',
    code: 'MARQ-CIELO-50',
    spec: 'Tira de 2.4 m, lista para pintar',
    unit: 'Metro lineal',
    unitFormat: 'metro_lineal',
    coveragePerUnitM2: 2.4,
    priceClp: 4200,
    providerNetPriceClp: 3360,
    commissionPercentage: 20,
    supplier: 'Nomastyl / Molduras Chile',
    stockRef: 200,
    notes: 'Remate superior en encuentro pared-cielo'
  },
  {
    id: 'qs-canto-pulido',
    category: 'cubiertas_qstone',
    name: 'Mano de Obra: Pulido y Bisel Canto Recto Qstone',
    code: 'QS-CANTO-PUL',
    spec: 'Corte diamantado CNC + pulido de cantos visibles al agua (Kerf 3.5mm)',
    unit: 'Metro Lineal (m)',
    priceClp: 18500,
    supplier: 'Marmolería Especializada',
    stockRef: 999,
    notes: 'Biselado de aristas 2mm anti-desportille'
  },
  {
    id: 'qs-encastre-lavaplatos',
    category: 'cubiertas_qstone',
    name: 'Mano de Obra: Perforación y Encastre Lavaplatos Bajo Cubierta',
    code: 'QS-ENC-LAVA',
    spec: 'Ruteado CNC + pulido interior de perímetro para cubeta bajo cubierta',
    unit: 'Unid.',
    priceClp: 45000,
    supplier: 'Marmolería Especializada',
    stockRef: 999,
    notes: 'Incluye perforación grifería monomando'
  },
  {
    id: 'qs-encastre-encimera',
    category: 'cubiertas_qstone',
    name: 'Mano de Obra: Calado y Perforación para Encimera / Placa de Cocción',
    code: 'QS-ENC-ENCI',
    spec: 'Corte en ángulo recto con esquinas redondeadas R=10mm anti-fisura',
    unit: 'Unid.',
    priceClp: 38000,
    supplier: 'Marmolería Especializada',
    stockRef: 999,
    notes: 'Para encimeras a gas o inducción sobrepuesta'
  },

  // Madera Estructural
  {
    id: 'mad-ipv-2x3',
    category: 'madera',
    name: 'Madera Pino Radiata IPV 2x3" x 3.20m Grado C16 (CCA)',
    code: 'MAD-IPV-2X3-32',
    spec: 'Impregnada CCA según NCh 819 para soleras y pie derechos',
    unit: 'Tira 3.20 m',
    priceClp: 4850,
    supplier: 'CMPC / Arauco',
    stockRef: 350,
    notes: 'Soleras de anclaje panel 90mm'
  },
  {
    id: 'mad-ipv-2x4',
    category: 'madera',
    name: 'Madera Pino Radiata IPV 2x4" x 3.20m Grado C24 Cepillado',
    code: 'MAD-IPV-2X4-32',
    spec: 'Seco en cámara KD 12-15%, impregnado CCA',
    unit: 'Tira 3.20 m',
    priceClp: 7200,
    supplier: 'CMPC / Arauco',
    stockRef: 420,
    notes: 'Llaves de unión y soleras panel 114mm'
  },
  {
    id: 'mad-ipv-2x6',
    category: 'madera',
    name: 'Madera Pino Radiata Estructural 2x6" x 3.20m Grado C24',
    code: 'MAD-IPV-2X6-32',
    spec: 'Seco y calibrado para soleras panel 162mm',
    unit: 'Tira 3.20 m',
    priceClp: 11400,
    supplier: 'CMPC / Arauco',
    stockRef: 180,
    notes: 'Soleras y vanos panel 162mm'
  },
  {
    id: 'viga-lamelada-4x8',
    category: 'madera',
    name: 'Viga Laminada Glulam 4x8" x 6.00m (GL24h)',
    code: 'MAD-GLU-4X8-60',
    spec: 'Adhesivo fenólico exterior calidad vista',
    unit: 'Unid. (6.00 m)',
    priceClp: 74000,
    supplier: 'Hilam Arauco',
    stockRef: 25,
    notes: 'Cumbreras y vigas maestras a la vista'
  },

  // Fijaciones y Sellantes
  {
    id: 'fij-tornillo-torx-sip',
    category: 'fijaciones_sellantes',
    name: 'Tornillo Estructural Torx 6.0 x 130mm Tratamiento Ruspert',
    code: 'FIJ-TORX-6X130',
    spec: 'Resistencia a 1000 hrs niebla salina, punta broca tipo 17',
    unit: 'Caja (100 unid.)',
    priceClp: 28500,
    supplier: 'Rothoblaas / Simpson Strong-Tie',
    stockRef: 60,
    notes: 'Unión panel a solera y encuentro de esquinas'
  },
  {
    id: 'fij-tornillo-spax-mueble',
    category: 'fijaciones_sellantes',
    name: 'Tornillo Spax Mueblista 4.0 x 50mm Cabeza Plana PZ2',
    code: 'FIJ-SPAX-4X50',
    spec: 'Rosca parcial autorroscante con costillas de fresado',
    unit: 'Caja (500 unid.)',
    priceClp: 9800,
    supplier: 'SPAX / Mamut',
    stockRef: 110,
    notes: 'Armado de cascos melamina'
  },
  {
    id: 'sell-espuma-pu',
    category: 'fijaciones_sellantes',
    name: 'Espuma Poliuretano Expansiva Baja Expansión (750ml)',
    code: 'SEL-PU-GUN-750',
    spec: 'Conductividad térmica 0.034 W/mK para juntas herméticas SIP',
    unit: 'Tubo 750 ml',
    priceClp: 6900,
    supplier: 'Soudal / Sika Boom',
    stockRef: 210,
    notes: 'Sellado hermético entre paneles'
  },
  {
    id: 'sell-sikaflex-11fc',
    category: 'fijaciones_sellantes',
    name: 'Sellador Poliuretánico Elastomérico Sikaflex 11FC (300ml)',
    code: 'SEL-SIKA-11FC',
    spec: 'Alto módulo de elasticidad para sellado solera-radier',
    unit: 'Cartucho 300 ml',
    priceClp: 6400,
    supplier: 'Sika Chile',
    stockRef: 180,
    notes: 'Barrera de agua y vapor en solera basal'
  },

  // --- TIRADORES Y MANILLAS DE CATÁLOGO ---
  {
    id: 'tirador-forza',
    category: 'herrajes',
    name: 'Tirador Forza (Asa Recta Aluminio)',
    code: 'HER-TIR-FORZA',
    spec: 'Asa recta de aluminio con retorno 90° entrecentros 96-320mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tipo asa para frentes y puertas'
  },
  {
    id: 'tirador-ce',
    category: 'herrajes',
    name: 'Tirador CE (Perfil Pestaña sobre Canto)',
    code: 'HER-TIR-CE',
    spec: 'Perfil pestaña plana atornillado posterior sobre canto 100-400mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Montaje posterior en reverso de puerta/frente'
  },
  {
    id: 'tirador-madrid',
    category: 'herrajes',
    name: 'Tirador Madrid (Barra Tubular Inox)',
    code: 'HER-TIR-MADRID',
    spec: 'Barra cilíndrica de acero inoxidable Ø12mm con postes entrecentros 96-320mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador barra tubular clásico'
  },
  {
    id: 'tirador-balin',
    category: 'herrajes',
    name: 'Tirador Balín (Pomo Cilíndrico Aluminio)',
    code: 'HER-TIR-BALIN',
    spec: 'Pomo cilíndrico compacto de aluminio Ø22-28mm con muesca ergonómica',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Punto único de fijación'
  },
  {
    id: 'tirador-denver',
    category: 'herrajes',
    name: 'Tirador Denver (Asa Prismática Zinc Alloy)',
    code: 'HER-TIR-DENVER',
    spec: 'Asa prismática recta de aleación de zinc con patas macizas integradas',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador moderno para puertas y gavetas'
  },
  {
    id: 'tirador-berlin',
    category: 'herrajes',
    name: 'Perilla Berlín (Pomo Esférico Ø25mm)',
    code: 'HER-TIR-BERLIN',
    spec: 'Perilla esférica clásica de Ø25mm con peana cónica torneada',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Fijación punto único con tornillo M4'
  },
  {
    id: 'tirador-oslo',
    category: 'herrajes',
    name: 'Tirador Oslo (Perfil Empotrado)',
    code: 'HER-TIR-OSLO',
    spec: 'Perfil tirador empotrado con pestaña de agarre discreto',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Fijación posterior para frentes de 15/18mm'
  },

  // --- PERFILERÍA Y ACCESORIOS GOLA ---
  {
    id: 'gola-perfil-l-3m',
    category: 'herrajes',
    name: 'Perfil Gola Superior "L" Provelcar x175 (Tira 3m)',
    code: 'HER-GOLA-L-3M',
    spec: 'Perfil gola horizontal bajo cubierta en aluminio anodizado/negro tira 3000mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 60,
    notes: 'Bajo cubierta muebles base e islas'
  },
  {
    id: 'gola-perfil-c-3m',
    category: 'herrajes',
    name: 'Perfil Gola Intermedio "C" Provelcar x176 (Tira 3m)',
    code: 'HER-GOLA-C-3M',
    spec: 'Perfil gola horizontal intermedio paso de cajón tira 3000mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 60,
    notes: 'Paso intermedio entre gavetas'
  },
  {
    id: 'gola-escuadra-fijacion',
    category: 'herrajes',
    name: 'Escuadras de Fijación Trasera para Perfil Gola',
    code: 'HER-GOLA-ESC',
    spec: 'Escuadra metálica con regulación para fijación de perfil Gola al casco',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 200,
    notes: '2 por módulo para Gola L y 2 por cada tramo Gola C'
  },
  {
    id: 'gola-conector-esquinero-90',
    category: 'herrajes',
    name: 'Conector Esquinero Interior 90° para Gola',
    code: 'HER-GOLA-ESQ-90',
    spec: 'Accesorio de unión inglete 90° para perfiles Gola en esquinas',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 80,
    notes: 'Encuentros en L de muebles base'
  },

  // --- BISAGRAS ESPECIALES Y SISTEMAS ELEVABLES ---
  {
    id: 'bisagra-155-codo-cero',
    category: 'herrajes',
    name: 'Bisagras Especiales 155°/165° Codo Cero (Apertura Libre Gavetero)',
    code: 'HER-BIS-155-CC',
    spec: 'Bisagra codo cero 155° para extracción total de cajones interiores',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Häfele',
    stockRef: 50,
    notes: 'Torres despenseras y gaveteros interiores'
  },
  {
    id: 'bisagra-bifold-rincon',
    category: 'herrajes',
    name: 'Bisagras Rincón Bi-Fold Articuladas (Puerta Plegable Esquinero)',
    code: 'HER-BIS-BIFOLD',
    spec: 'Bisagra de unión intermedia articulada para dos hojas en L',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Häfele',
    stockRef: 40,
    notes: 'Mueble esquinero en L'
  },
  {
    id: 'bisagra-gran-angulo-170',
    category: 'herrajes',
    name: 'Bisagras Gran Ángulo 165°/170° Cierre Suave (Anclaje a Mueble)',
    code: 'HER-BIS-ANG-170',
    spec: 'Bisagra gran angular 170° con amortiguación integrada para lateral',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Häfele',
    stockRef: 40,
    notes: 'Hoja principal de mueble esquinero'
  },
  {
    id: 'piston-gas-elevador-100n',
    category: 'herrajes',
    name: 'Pistones a Gas / Sistema Elevador Aventos (100N / Cierre Suave)',
    code: 'HER-PIST-100N',
    spec: 'Pistón neumático de fuerza 100N para puertas abatibles basculantes',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Ducasse',
    stockRef: 60,
    notes: 'Muebles aéreos abatibles superiores'
  },
  {
    id: 'sistema-elevable-hafele-free',
    category: 'herrajes',
    name: 'Sistema Elevable Häfele Free Flap / Free Fold (Soft-Close)',
    code: 'HER-FREE-FLAP',
    spec: 'Mecanismo elevable multiposición con freno y cierre suave integrado',
    unit: 'Juegos',
    priceClp: 0,
    supplier: 'Häfele',
    stockRef: 30,
    notes: 'Puertas abatibles dobles o pesadas'
  },

  // --- CORREDERAS TELESCÓPICAS POR LARGO NOMINAL (NL) ---
  {
    id: 'corr-tel-300',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (300mm NL)',
    code: 'HER-CORR-TEL-300',
    spec: 'Extracción total con rodamientos de bolas y amortiguación hidráulica 300mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 80,
    notes: 'Para muebles de profundidad reducida'
  },
  {
    id: 'corr-tel-350',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (350mm NL)',
    code: 'HER-CORR-TEL-350',
    spec: 'Extracción total con rodamientos de bolas y amortiguación hidráulica 350mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 80,
    notes: 'Para muebles de profundidad 400mm'
  },
  {
    id: 'corr-tel-400',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (400mm NL)',
    code: 'HER-CORR-TEL-400',
    spec: 'Extracción total con rodamientos de bolas y amortiguación hidráulica 400mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 80,
    notes: 'Para muebles de profundidad 450mm'
  },
  {
    id: 'corr-tel-450',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (450mm NL)',
    code: 'HER-CORR-TEL-450',
    spec: 'Extracción total con rodamientos de bolas y amortiguación hidráulica 450mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 120,
    notes: 'Para muebles de profundidad 500mm'
  },
  {
    id: 'corr-tel-550',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (550mm NL)',
    code: 'HER-CORR-TEL-550',
    spec: 'Extracción total con rodamientos de bolas y amortiguación hidráulica 550mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 80,
    notes: 'Para muebles profundos e islas 600-650mm'
  },
  {
    id: 'corr-oculta-soft',
    category: 'herrajes',
    name: 'Corredera Oculta Bajo Fondo Sincronizada Cierre Suave',
    code: 'HER-CORR-OCULTA',
    spec: 'Montaje bajo fondo con clip de extracción rápida y regulación 3D',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Häfele / Blum',
    stockRef: 40,
    notes: 'Cajones premium de madera y vitrinas'
  },

  // --- ACCESORIOS DE CLÓSET Y VENTILACIÓN ---
  {
    id: 'closet-barra-ovalada-3m',
    category: 'herrajes',
    name: 'Barra de Colgar Ovalada Cromada 30x15mm (Tira 3000mm)',
    code: 'HER-BARRA-OVAL-3M',
    spec: 'Tubo de acero cromado ovalado de alta resistencia espesor 1.0mm tira 3m',
    unit: 'Tiras (3m)',
    priceClp: 0,
    supplier: 'Provelcar / Ducasse',
    stockRef: 50,
    notes: 'Colgado de ropa en clósets y vestidores'
  },
  {
    id: 'closet-brida-lateral',
    category: 'herrajes',
    name: 'Soportes Laterales / Bridas para Tubo Ovalado Cromado',
    code: 'HER-BRIDA-OVAL',
    spec: 'Soporte zamak niquelado para atornillar a lateral de clóset',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Ducasse',
    stockRef: 150,
    notes: 'Fijación de barra ovalada'
  },
  {
    id: 'rejilla-ventilacion-aluminio',
    category: 'herrajes',
    name: 'Rejilla de Ventilación Técnica Aluminio Anodizado (Ranurada Convección)',
    code: 'HER-REJ-VENT-ALU',
    spec: 'Rejilla de flujo convectivo para nicho de hornos empotrados 500x80mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar',
    stockRef: 40,
    notes: 'Ventilación térmica para torre de hornos'
  },

  // --- EQUIPAMIENTO: LAVAPLATOS Y ENCIMERAS ---
  {
    id: 'lava-alfa-onec-3018',
    category: 'cubiertas_qstone',
    name: 'Lavaplatos ALFA ONEC 3018 (Acero Inox 304 Bajo Cubierta)',
    code: 'ALFA-ONEC-3018',
    spec: 'Lavaplatos 1 cubeta 775x480x230mm espesor 1.2mm con radio R15',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Sysprotec / Qstone',
    stockRef: 15,
    notes: 'Para muebles base lavaplatos de 80cm o más'
  },
  {
    id: 'lava-alfa-twoc-f5858a',
    category: 'cubiertas_qstone',
    name: 'Lavaplatos ALFA TWOC F5858A (2 Cubetas Acero Inox 304)',
    code: 'ALFA-TWOC-F5858A',
    spec: 'Lavaplatos 2 cubetas 810x480x210mm espesor 1.2mm bajo cubierta',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Sysprotec / Qstone',
    stockRef: 15,
    notes: 'Para muebles base lavaplatos de 90cm o más'
  },
  {
    id: 'enci-fdv-design-60',
    category: 'cubiertas_qstone',
    name: 'Encimera FDV DESIGN 60 2.0 (4 Quemadores Gas)',
    code: 'FDV-DES-60',
    spec: 'Encimera a gas 4 quemadores acero inox parrillas fierro fundido 580x500mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 15,
    notes: 'Calado 550x470mm en cubierta de cocina'
  },
  {
    id: 'enci-fdv-design-90',
    category: 'cubiertas_qstone',
    name: 'Encimera FDV DESIGN 90 2.0 (5 Quemadores Gas Triple Corona)',
    code: 'FDV-DES-90',
    spec: 'Encimera a gas 5 quemadores acero inox quemador triple corona 860x500mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 15,
    notes: 'Calado 830x470mm en cubierta de cocina'
  },

  // --- ELECTRODOMÉSTICOS EMPOTRABLES Y LIBRES ---
  {
    id: 'elec-horno-emp-60',
    category: 'herrajes',
    name: 'Horno Eléctrico Empotrable 60cm',
    code: 'ELEC-HORNO-60',
    spec: 'Horno eléctrico multifunción empotrable 60cm convección forzada',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 10,
    notes: 'Instalación en torre de hornos o bajo encimera'
  },
  {
    id: 'elec-micro-emp-38',
    category: 'herrajes',
    name: 'Microondas Empotrado con Marco de Acero 38cm',
    code: 'ELEC-MICRO-EMP',
    spec: 'Microondas con grill y marco de empotre en acero inoxidable nicho 38cm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 10,
    notes: 'Torre de hornos superior'
  },
  {
    id: 'elec-micro-portatil',
    category: 'herrajes',
    name: 'Microondas Portátil / Sobremesa 25L',
    code: 'ELEC-MICRO-PORT',
    spec: 'Microondas sobremesa 25L para nicho abierto',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 10,
    notes: 'Módulo aéreo con nicho microondas'
  },
  {
    id: 'elec-campana-conic-90',
    category: 'herrajes',
    name: 'Campana FDV New Conic 90 (Acero Inox 780 m3/h)',
    code: 'ELEC-CAMP-CONIC90',
    spec: 'Campana mural de acero inoxidable 90cm extracción 780 m3/h con filtro antigrasa',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 10,
    notes: 'Instalación mural vista sobre encimera 90cm'
  },
  {
    id: 'elec-campana-neuflow-60',
    category: 'herrajes',
    name: 'Campana Kubli Neu Flow 60 (Extraíble Telescópica 210 m3/h)',
    code: 'ELEC-CAMP-NEU60',
    spec: 'Campana empotrada telescópica para mueble aéreo 60cm con frente inox',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 15,
    notes: 'Módulo aéreo campana empotrada'
  },
  {
    id: 'elec-lavavajillas-12c',
    category: 'herrajes',
    name: 'Lavavajillas FDV Active 12C Silver (12 Cubiertos)',
    code: 'ELEC-LAVAVAJ-12C',
    spec: 'Lavavajillas bajo cubierta libre instalación 12 cubiertos 598x600x845mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 8,
    notes: 'Nicho bajo cubierta 60cm'
  },
  {
    id: 'elec-refrigerador-sbs',
    category: 'herrajes',
    name: 'Refrigerador FDV SBS SIGNATURE 2.0 513L (Dark Inox)',
    code: 'ELEC-REFRI-SBS',
    spec: 'Refrigerador Side by Side No Frost 513L acabado Dark Inox',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 6,
    notes: 'Espacio refrigerador Side by Side'
  },
  {
    id: 'elec-cocina-unique-90',
    category: 'herrajes',
    name: 'Cocina FDV FS UNIQUE 90 (5 Quemadores + Horno 107L)',
    code: 'ELEC-COCINA-90',
    spec: 'Cocina de pie acero inox 5 quemadores a gas con horno eléctrico 107L',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'FDV / Kitchen Center',
    stockRef: 6,
    notes: 'Espacio cocina de pie 90cm'
  },

  // --- MUEBLES ESPECIALES Y VITRINAS ---
  {
    id: 'vitrina-perfil-acero-25',
    category: 'herrajes',
    name: 'Bastidor / Perfil de Acero Cuadrado 25x25x1.5mm (Base Metálica)',
    code: 'MET-TUB-25X25',
    spec: 'Perfil estructural tubular de acero 25x25x1.5mm soldado y esmaltado negro mate',
    unit: 'Metro Lineal',
    priceClp: 0,
    supplier: 'Metalmecánica',
    stockRef: 40,
    notes: 'Bastidor metálico inferior soldado para muebles especiales'
  },
  {
    id: 'vitrina-cristal-fume-4mm',
    category: 'herrajes',
    name: 'Cristal Templado 4mm Bronce / Fumé (Puertas y Repisas)',
    code: 'GLS-TEM-FUME-4',
    spec: 'Vidrio templado de seguridad 4mm color fumé cantos pulidos al diamante',
    unit: 'm²',
    priceClp: 0,
    supplier: 'Vidriería',
    stockRef: 30,
    notes: 'Puertas de vitrina y repisas transparentes'
  },
  {
    id: 'vitrina-soporte-pelicano',
    category: 'herrajes',
    name: 'Soportes de Repisa Pelícano / Perno con Ventosa de Goma',
    code: 'HER-SOP-PELICANO',
    spec: 'Soporte niquelado d=5mm con ventosa de silicona transparente antideslizante',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Häfele',
    stockRef: 120,
    notes: 'Soporte para repisas de cristal'
  },
  {
    id: 'vitrina-regaton-m8',
    category: 'herrajes',
    name: 'Regatones Niveladores Articulados M8 con Base Inox/Goma',
    code: 'HER-REGATON-M8',
    spec: 'Espárrago roscado M8x35mm base circular d=30mm pad antirralladuras',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Häfele',
    stockRef: 60,
    notes: 'Nivelación de bases metálicas'
  },
  {
    id: 'tornillo-confirmat-7x50',
    category: 'herrajes',
    name: 'Pernos Confirmat 7x50mm para Mueble RTA',
    code: 'INS-CONFIRMAT-7X50',
    spec: 'Tornillo de ensamble estructural confirmat cabeza allen niquelado',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Häfele',
    stockRef: 500,
    notes: 'Ensamble directo de alta firmeza'
  },

  // --- CABINAS SANITARIAS HPL BAÑO ---
  {
    id: 'hpl-pata-inox-jnf',
    category: 'herrajes',
    name: 'Pie Regulable H120-150mm Acero Inox AISI 304 (JNF SM.017)',
    code: 'JNF-SM-017',
    spec: 'Base regulable para panel HPL al suelo en acero inoxidable AISI 304/316',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 40,
    notes: 'Cabinas sanitarias para separador y pilastras'
  },
  {
    id: 'hpl-bisagra-inox-jnf',
    category: 'herrajes',
    name: 'Bisagras Especiales Acero Inox para Panel HPL 10-13mm (JNF SM.006.B)',
    code: 'JNF-SM-006B',
    spec: 'Bisagra de alta resistencia acero inox con retorno y cierre por gravedad',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 50,
    notes: 'Puertas de cubículos sanitarios HPL'
  },
  {
    id: 'hpl-cerrojo-libre-ocupado',
    category: 'herrajes',
    name: 'Cerrojo con Indicador Libre/Ocupado Inox (JNF IN.20.730)',
    code: 'JNF-IN-20730',
    spec: 'Cerrojo de seguridad con visor libre/ocupado y desbloqueo de emergencia exterior',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 20,
    notes: 'Cierre de privacidad para cubículos de baño'
  },
  {
    id: 'hpl-pomo-inox-doble',
    category: 'herrajes',
    name: 'Pomo / Tirador Inox Doble para Puerta HPL (JNF IN.00.024)',
    code: 'JNF-IN-00024',
    spec: 'Pomo tirador doble pasante en acero inoxidable satinado Ø20mm',
    unit: 'Juego',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 25,
    notes: 'Apertura interior/exterior en cabinas HPL'
  },
  {
    id: 'hpl-abrazadera-mural',
    category: 'herrajes',
    name: 'Abrazaderas / Escuadras Murales Inox para HPL (JNF SM.010)',
    code: 'JNF-SM-010',
    spec: 'Escuadra pinza en acero inoxidable para fijación de paneles HPL a muro',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 60,
    notes: 'Fijación de divisiones a muros perimetrales'
  },
  {
    id: 'hpl-tubo-estabilizador',
    category: 'herrajes',
    name: 'Barra Estabilizadora Superior Tubo Ø25mm Inox (JNF SM.015)',
    code: 'JNF-SM-015',
    spec: 'Tubo estabilizador superior de rigidización en acero inoxidable tira 3000mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 15,
    notes: 'Rigidización frontal superior de batería de cubículos'
  }
,

  // --- TIRADORES POR MEDIDA (CATÁLOGO ARQUIFY) ---
  // Tirador Forza (Asa Recta Aluminio)
  {
    id: 'tirador-forza-96',
    category: 'herrajes',
    name: 'Tirador Forza 96mm (Asa Recta Aluminio)',
    code: 'HER-TIR-FORZA-96',
    spec: 'Asa recta de aluminio con retorno 90° entrecentros 96mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tipo asa frentes reducidos'
  },
  {
    id: 'tirador-forza-128',
    category: 'herrajes',
    name: 'Tirador Forza 128mm (Asa Recta Aluminio)',
    code: 'HER-TIR-FORZA-128',
    spec: 'Asa recta de aluminio con retorno 90° entrecentros 128mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tipo asa estándar'
  },
  {
    id: 'tirador-forza-160',
    category: 'herrajes',
    name: 'Tirador Forza 160mm (Asa Recta Aluminio)',
    code: 'HER-TIR-FORZA-160',
    spec: 'Asa recta de aluminio con retorno 90° entrecentros 160mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tipo asa para cajones medianos'
  },
  {
    id: 'tirador-forza-192',
    category: 'herrajes',
    name: 'Tirador Forza 192mm (Asa Recta Aluminio)',
    code: 'HER-TIR-FORZA-192',
    spec: 'Asa recta de aluminio con retorno 90° entrecentros 192mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tipo asa para gaveteros'
  },
  {
    id: 'tirador-forza-256',
    category: 'herrajes',
    name: 'Tirador Forza 256mm (Asa Recta Aluminio)',
    code: 'HER-TIR-FORZA-256',
    spec: 'Asa recta de aluminio con retorno 90° entrecentros 256mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tipo asa para gaveteros anchos'
  },
  {
    id: 'tirador-forza-320',
    category: 'herrajes',
    name: 'Tirador Forza 320mm (Asa Recta Aluminio)',
    code: 'HER-TIR-FORZA-320',
    spec: 'Asa recta de aluminio con retorno 90° entrecentros 320mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tipo asa para frentes gran formato y despenseros'
  },

  // Tirador CE (Perfil Pestaña sobre Canto)
  {
    id: 'tirador-ce-100',
    category: 'herrajes',
    name: 'Tirador CE 100mm (Perfil Pestaña sobre Canto)',
    code: 'HER-TIR-CE-100',
    spec: 'Perfil pestaña plana atornillado posterior sobre canto largo 100mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Montaje posterior en reverso frentes angostos'
  },
  {
    id: 'tirador-ce-150',
    category: 'herrajes',
    name: 'Tirador CE 150mm (Perfil Pestaña sobre Canto)',
    code: 'HER-TIR-CE-150',
    spec: 'Perfil pestaña plana atornillado posterior sobre canto largo 150mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Montaje posterior estándar'
  },
  {
    id: 'tirador-ce-200',
    category: 'herrajes',
    name: 'Tirador CE 200mm (Perfil Pestaña sobre Canto)',
    code: 'HER-TIR-CE-200',
    spec: 'Perfil pestaña plana atornillado posterior sobre canto largo 200mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Montaje posterior para puertas y gavetas medianas'
  },
  {
    id: 'tirador-ce-300',
    category: 'herrajes',
    name: 'Tirador CE 300mm (Perfil Pestaña sobre Canto)',
    code: 'HER-TIR-CE-300',
    spec: 'Perfil pestaña plana atornillado posterior sobre canto largo 300mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Montaje posterior para gaveteros anchos'
  },
  {
    id: 'tirador-ce-400',
    category: 'herrajes',
    name: 'Tirador CE 400mm (Perfil Pestaña sobre Canto)',
    code: 'HER-TIR-CE-400',
    spec: 'Perfil pestaña plana atornillado posterior sobre canto largo 400mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Montaje posterior para frentes de gran dimensión'
  },

  // Tirador Madrid (Barra Tubular Inox)
  {
    id: 'tirador-madrid-96',
    category: 'herrajes',
    name: 'Tirador Madrid 96mm (Barra Tubular Inox)',
    code: 'HER-TIR-MADRID-96',
    spec: 'Barra cilíndrica de acero inoxidable Ø12mm entrecentros 96mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tubular frentes angostos'
  },
  {
    id: 'tirador-madrid-128',
    category: 'herrajes',
    name: 'Tirador Madrid 128mm (Barra Tubular Inox)',
    code: 'HER-TIR-MADRID-128',
    spec: 'Barra cilíndrica de acero inoxidable Ø12mm entrecentros 128mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tubular clásico estándar'
  },
  {
    id: 'tirador-madrid-160',
    category: 'herrajes',
    name: 'Tirador Madrid 160mm (Barra Tubular Inox)',
    code: 'HER-TIR-MADRID-160',
    spec: 'Barra cilíndrica de acero inoxidable Ø12mm entrecentros 160mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tubular cajones medianos'
  },
  {
    id: 'tirador-madrid-192',
    category: 'herrajes',
    name: 'Tirador Madrid 192mm (Barra Tubular Inox)',
    code: 'HER-TIR-MADRID-192',
    spec: 'Barra cilíndrica de acero inoxidable Ø12mm entrecentros 192mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tubular gaveteros'
  },
  {
    id: 'tirador-madrid-256',
    category: 'herrajes',
    name: 'Tirador Madrid 256mm (Barra Tubular Inox)',
    code: 'HER-TIR-MADRID-256',
    spec: 'Barra cilíndrica de acero inoxidable Ø12mm entrecentros 256mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tubular gavetas anchas'
  },
  {
    id: 'tirador-madrid-320',
    category: 'herrajes',
    name: 'Tirador Madrid 320mm (Barra Tubular Inox)',
    code: 'HER-TIR-MADRID-320',
    spec: 'Barra cilíndrica de acero inoxidable Ø12mm entrecentros 320mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Tirador tubular puertas altas y columnas'
  },

  // Tirador Balín (Pomo Cilíndrico Aluminio)
  {
    id: 'tirador-balin-22',
    category: 'herrajes',
    name: 'Tirador Balín Ø22mm (Pomo Cilíndrico Aluminio)',
    code: 'HER-TIR-BALIN-22',
    spec: 'Pomo cilíndrico de aluminio Ø22mm con muesca ergonómica punto único',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Punto único fijación tornillo M4'
  },
  {
    id: 'tirador-balin-25',
    category: 'herrajes',
    name: 'Tirador Balín Ø25mm (Pomo Cilíndrico Aluminio)',
    code: 'HER-TIR-BALIN-25',
    spec: 'Pomo cilíndrico de aluminio Ø25mm con muesca ergonómica punto único',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Punto único estándar fijación tornillo M4'
  },
  {
    id: 'tirador-balin-28',
    category: 'herrajes',
    name: 'Tirador Balín Ø28mm (Pomo Cilíndrico Aluminio)',
    code: 'HER-TIR-BALIN-28',
    spec: 'Pomo cilíndrico de aluminio Ø28mm con muesca ergonómica punto único',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Punto único formato mayor fijación tornillo M4'
  },

  // Tirador Denver (Asa Prismática Zinc Alloy)
  {
    id: 'tirador-denver-64',
    category: 'herrajes',
    name: 'Tirador Denver 64mm (Asa Prismática Zinc Alloy)',
    code: 'HER-TIR-DENVER-64',
    spec: 'Asa prismática de zinc alloy con patas integradas a 90° entrecentros 64mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Asa compacta frentes reducidos'
  },
  {
    id: 'tirador-denver-96',
    category: 'herrajes',
    name: 'Tirador Denver 96mm (Asa Prismática Zinc Alloy)',
    code: 'HER-TIR-DENVER-96',
    spec: 'Asa prismática de zinc alloy con patas integradas a 90° entrecentros 96mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Asa moderna entrecentros 96mm'
  },
  {
    id: 'tirador-denver-128',
    category: 'herrajes',
    name: 'Tirador Denver 128mm (Asa Prismática Zinc Alloy)',
    code: 'HER-TIR-DENVER-128',
    spec: 'Asa prismática de zinc alloy con patas integradas a 90° entrecentros 128mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Asa moderna estándar entrecentros 128mm'
  },
  {
    id: 'tirador-denver-160',
    category: 'herrajes',
    name: 'Tirador Denver 160mm (Asa Prismática Zinc Alloy)',
    code: 'HER-TIR-DENVER-160',
    spec: 'Asa prismática de zinc alloy con patas integradas a 90° entrecentros 160mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Asa moderna cajones anchos entrecentros 160mm'
  },

  // Perilla Berlín (Pomo Esférico Ø25mm)
  {
    id: 'tirador-berlin-25',
    category: 'herrajes',
    name: 'Perilla Berlín Ø25mm (Pomo Esférico Zinc Alloy)',
    code: 'HER-TIR-BERLIN-25',
    spec: 'Perilla esférica de Ø25mm con peana cónica torneada en zinc alloy',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Punto único con tornillo M4'
  },

  // Tirador Oslo (Perfil Empotrado Aluminio)
  {
    id: 'tirador-oslo-100',
    category: 'herrajes',
    name: 'Tirador Oslo 100mm (Perfil Empotrado Aluminio)',
    code: 'HER-TIR-OSLO-100',
    spec: 'Perfil tirador empotrado con pestaña de agarre discreto largo 100mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Fijación posterior frentes pequeños'
  },
  {
    id: 'tirador-oslo-150',
    category: 'herrajes',
    name: 'Tirador Oslo 150mm (Perfil Empotrado Aluminio)',
    code: 'HER-TIR-OSLO-150',
    spec: 'Perfil tirador empotrado con pestaña de agarre discreto largo 150mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Fijación posterior frentes estándar'
  },
  {
    id: 'tirador-oslo-200',
    category: 'herrajes',
    name: 'Tirador Oslo 200mm (Perfil Empotrado Aluminio)',
    code: 'HER-TIR-OSLO-200',
    spec: 'Perfil tirador empotrado con pestaña de agarre discreto largo 200mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Fijación posterior gavetas medianas'
  },
  {
    id: 'tirador-oslo-300',
    category: 'herrajes',
    name: 'Tirador Oslo 300mm (Perfil Empotrado Aluminio)',
    code: 'HER-TIR-OSLO-300',
    spec: 'Perfil tirador empotrado con pestaña de agarre discreto largo 300mm',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Catálogo Tiradores',
    stockRef: 100,
    notes: 'Fijación posterior gavetas grandes'
  },

  // --- CORREDERAS POR LARGO NOMINAL (TELESCÓPICAS Y OCULTAS) ---
  {
    id: 'corr-tel-250',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (250mm NL)',
    code: 'HER-CORR-TEL-250',
    spec: 'Extracción total con rodamientos de bolas y amortiguación hidráulica 250mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Provelcar / DTC',
    stockRef: 60,
    notes: 'Para muebles de profundidad ultra compacta'
  },
  {
    id: 'corr-tel-500',
    category: 'herrajes',
    name: 'Corredera Telescópica 45mm Cierre Suave (500mm NL)',
    code: 'HER-CORR-TEL-500-NL',
    spec: 'Extracción total con rodamientos de bolas y amortiguación hidráulica 500mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Provelcar / DTC',
    stockRef: 150,
    notes: 'Para muebles estándar de profundidad 550-600mm'
  },
  {
    id: 'corr-oculta-300',
    category: 'herrajes',
    name: 'Corredera Oculta Bajo Fondo Sincronizada Soft-Close (300mm NL)',
    code: 'HER-CORR-OCU-300',
    spec: 'Montaje bajo fondo con clip de extracción rápida y regulación 3D 300mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Häfele / Blum',
    stockRef: 40,
    notes: 'Cajones premium profundidad 350mm'
  },
  {
    id: 'corr-oculta-350',
    category: 'herrajes',
    name: 'Corredera Oculta Bajo Fondo Sincronizada Soft-Close (350mm NL)',
    code: 'HER-CORR-OCU-350',
    spec: 'Montaje bajo fondo con clip de extracción rápida y regulación 3D 350mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Häfele / Blum',
    stockRef: 40,
    notes: 'Cajones premium profundidad 400mm'
  },
  {
    id: 'corr-oculta-400',
    category: 'herrajes',
    name: 'Corredera Oculta Bajo Fondo Sincronizada Soft-Close (400mm NL)',
    code: 'HER-CORR-OCU-400',
    spec: 'Montaje bajo fondo con clip de extracción rápida y regulación 3D 400mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Häfele / Blum',
    stockRef: 40,
    notes: 'Cajones premium profundidad 450mm'
  },
  {
    id: 'corr-oculta-450',
    category: 'herrajes',
    name: 'Corredera Oculta Bajo Fondo Sincronizada Soft-Close (450mm NL)',
    code: 'HER-CORR-OCU-450',
    spec: 'Montaje bajo fondo con clip de extracción rápida y regulación 3D 450mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Häfele / Blum',
    stockRef: 40,
    notes: 'Cajones premium profundidad 500mm'
  },
  {
    id: 'corr-oculta-500',
    category: 'herrajes',
    name: 'Corredera Oculta Bajo Fondo Sincronizada Soft-Close (500mm NL)',
    code: 'HER-CORR-OCU-500',
    spec: 'Montaje bajo fondo con clip de extracción rápida y regulación 3D 500mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Häfele / Blum',
    stockRef: 50,
    notes: 'Cajones premium profundidad estándar 550-600mm'
  },
  {
    id: 'corr-oculta-550',
    category: 'herrajes',
    name: 'Corredera Oculta Bajo Fondo Sincronizada Soft-Close (550mm NL)',
    code: 'HER-CORR-OCU-550',
    spec: 'Montaje bajo fondo con clip de extracción rápida y regulación 3D 550mm',
    unit: 'Juego (Par)',
    priceClp: 0,
    supplier: 'Häfele / Blum',
    stockRef: 40,
    notes: 'Cajones premium islas y muebles profundos'
  },

  // --- ZÓCALOS POR ALTURA Y ACABADO ---
  {
    id: 'zocalo-alu-100-3m',
    category: 'herrajes',
    name: 'Zócalo PVC/Aluminio H=100mm Anodizado Natural (Tira 3m)',
    code: 'ZOC-ALU-100-3M',
    spec: 'Perfil de PVC coextruido con lámina de aluminio anodizado y labio sello de agua H=100mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar / Volpato',
    stockRef: 40,
    notes: 'Zócalo bajo muebles cocina estándar'
  },
  {
    id: 'zocalo-negro-100-3m',
    category: 'herrajes',
    name: 'Zócalo PVC/Aluminio H=100mm Negro Mate (Tira 3m)',
    code: 'ZOC-NEG-100-3M',
    spec: 'Perfil de PVC con lámina de aluminio negro mate y labio sello de agua H=100mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar / Volpato',
    stockRef: 40,
    notes: 'Zócalo muebles cocina acabado negro'
  },
  {
    id: 'zocalo-alu-120-3m',
    category: 'herrajes',
    name: 'Zócalo PVC/Aluminio H=120mm Anodizado Natural (Tira 3m)',
    code: 'ZOC-ALU-120-3M',
    spec: 'Perfil de PVC coextruido con lámina de aluminio anodizado y labio sello de agua H=120mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar / Volpato',
    stockRef: 30,
    notes: 'Zócalo intermedio muebles cocina'
  },
  {
    id: 'zocalo-negro-120-3m',
    category: 'herrajes',
    name: 'Zócalo PVC/Aluminio H=120mm Negro Mate (Tira 3m)',
    code: 'ZOC-NEG-120-3M',
    spec: 'Perfil de PVC con lámina de aluminio negro mate y labio sello de agua H=120mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar / Volpato',
    stockRef: 30,
    notes: 'Zócalo intermedio muebles cocina acabado negro'
  },
  {
    id: 'zocalo-alu-150-3m',
    category: 'herrajes',
    name: 'Zócalo PVC/Aluminio H=150mm Anodizado Natural (Tira 3m)',
    code: 'ZOC-ALU-150-3M',
    spec: 'Perfil de PVC coextruido con lámina de aluminio anodizado y labio sello de agua H=150mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar / Volpato',
    stockRef: 30,
    notes: 'Zócalo alto muebles cocina y ergonomía'
  },
  {
    id: 'zocalo-negro-150-3m',
    category: 'herrajes',
    name: 'Zócalo PVC/Aluminio H=150mm Negro Mate (Tira 3m)',
    code: 'ZOC-NEG-150-3M',
    spec: 'Perfil de PVC con lámina de aluminio negro mate y labio sello de agua H=150mm',
    unit: 'Tira (3m)',
    priceClp: 0,
    supplier: 'Provelcar / Volpato',
    stockRef: 30,
    notes: 'Zócalo alto muebles cocina acabado negro'
  },

  // --- PATAS REGULABLES POR ALTURA ---
  {
    id: 'patas-regulables-60',
    category: 'herrajes',
    name: 'Pata Plástica Regulable H=60-80mm (Zócalo Bajo / Clóset)',
    code: 'HER-PATA-REG-60',
    spec: 'Polímero reforzado altura regulable 60 a 80mm soporta 150 kg/pata',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Häfele / Provelcar',
    stockRef: 200,
    notes: 'Módulos con zócalo bajo y bases de clóset'
  },
  {
    id: 'patas-regulables-150',
    category: 'herrajes',
    name: 'Pata Plástica Regulable H=150-180mm (Zócalo Alto)',
    code: 'HER-PATA-REG-150',
    spec: 'Polímero reforzado altura regulable 150 a 180mm soporta 150 kg/pata',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Häfele / Provelcar',
    stockRef: 200,
    notes: 'Módulos con zócalo de 150mm para lavavajillas y ergonomía'
  },

  // --- BISAGRAS CAZOLETA POR CODO / MONTAJE ---
  {
    id: 'bisagra-semicurva-110',
    category: 'herrajes',
    name: 'Bisagra Cazoleta 35mm Semicurva Clip-On 110° Cierre Suave (Codo 9)',
    code: 'HER-BIS-CS-SEMI',
    spec: 'Montaje semi-solapado codo 9mm con pistón hidráulico y base 3D',
    unit: 'Par',
    priceClp: 0,
    supplier: 'DTC / Blum / Häfele',
    stockRef: 150,
    notes: 'Para puertas intermedias en montantes compartidos'
  },
  {
    id: 'bisagra-curva-110',
    category: 'herrajes',
    name: 'Bisagra Cazoleta 35mm Curva Clip-On 110° Cierre Suave (Codo 18)',
    code: 'HER-BIS-CS-CURVA',
    spec: 'Montaje interior embutido codo 18mm con pistón hidráulico y base 3D',
    unit: 'Par',
    priceClp: 0,
    supplier: 'DTC / Blum / Häfele',
    stockRef: 150,
    notes: 'Para puertas embutidas al interior del vano del casco'
  },

  // --- PISTONES A GAS POR FUERZA (NEWTONS) ---
  {
    id: 'piston-gas-elevador-60n',
    category: 'herrajes',
    name: 'Pistón a Gas Elevador 60N Cierre Suave (Puertas Livianas)',
    code: 'HER-PIST-60N',
    spec: 'Pistón neumático de fuerza 60N carrera estándar para abatibles pequeños',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Ducasse',
    stockRef: 40,
    notes: 'Puertas abatibles superiores de formato chico o vidriadas'
  },
  {
    id: 'piston-gas-elevador-80n',
    category: 'herrajes',
    name: 'Pistón a Gas Elevador 80N Cierre Suave (Puertas Medianas)',
    code: 'HER-PIST-80N',
    spec: 'Pistón neumático de fuerza 80N carrera estándar para abatibles medianos',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Ducasse',
    stockRef: 50,
    notes: 'Puertas abatibles superiores estándar de 60-80cm'
  },
  {
    id: 'piston-gas-elevador-120n',
    category: 'herrajes',
    name: 'Pistón a Gas Elevador 120N Cierre Suave (Puertas Pesadas)',
    code: 'HER-PIST-120N',
    spec: 'Pistón neumático de fuerza 120N carrera reforzada para abatibles pesados',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'Provelcar / Ducasse',
    stockRef: 40,
    notes: 'Puertas abatibles superiores de gran formato 90-120cm'
  },

  // --- TAPACANTOS POR ESPESOR Y ANCHO ---
  {
    id: 'canto-pvc-10',
    category: 'herrajes',
    name: 'Tapacanto PVC 1.00 mm x 22 mm Semi-Grueso',
    code: 'CANTO-PVC-100',
    spec: 'PVC rígido semigrueso 1.0mm con primer para cantos vistos de uso medio',
    unit: 'Metro lineal',
    priceClp: 0,
    supplier: 'Provelcar / Rehau',
    stockRef: 800,
    notes: 'Cantos de repisas y frentes alternativos'
  },
  {
    id: 'canto-pvc-45',
    category: 'herrajes',
    name: 'Tapacanto PVC 2.00 mm x 45 mm para Frentes Engrosados y Cubiertas',
    code: 'CANTO-PVC-200X45',
    spec: 'PVC rígido biselado ancho 45mm espesor 2mm para paneles regruesados de 30-36mm',
    unit: 'Metro lineal',
    priceClp: 0,
    supplier: 'Provelcar / Rehau',
    stockRef: 500,
    notes: 'Cubiertas melamínicas engrosadas y frentes robustos'
  },

  // --- CUBIERTAS QSTONE (MANO DE OBRA Y REGRUESO) ---
  {
    id: 'qs-canto-inglete-4cm',
    category: 'cubiertas_qstone',
    name: 'Faldón Ingleteado a 45° Regrueso 40mm Cubierta Cuarzo/Sintetizado',
    code: 'QS-INGLETE-40',
    spec: 'Corte inglete a 45° y pegado con resina epóxica para dar efecto de faldón regruesado de 4cm',
    unit: 'Metro lineal',
    priceClp: 0,
    supplier: 'Mano de Obra Taller Cubiertas',
    stockRef: 100,
    notes: 'Faldones vistos en cubiertas de cuarzo y piedra sinterizada'
  },

  // --- CABINAS HPL BAÑO (PATAS Y ELEMENTOS DIMENSIONALES JNF) ---
  {
    id: 'hpl-pata-sm017-xl',
    category: 'herrajes',
    name: 'Pie Regulable H150-180mm Acero Inox AISI 304 (JNF SM.017.XL)',
    code: 'JNF-SM-017-XL',
    spec: 'Base regulable para panel HPL al suelo altura extendida 150-180mm inox AISI 304',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 30,
    notes: 'Cabinas sanitarias para recintos con pendientes de desagüe acentuadas'
  },
  {
    id: 'hpl-pata-sm070',
    category: 'herrajes',
    name: 'Pie Cuadrado 20x20mm H150mm Acero Inox AISI 304 (JNF SM.070)',
    code: 'JNF-SM-070',
    spec: 'Base de sección cuadrada 20x20mm diseño minimalista inox AISI 304',
    unit: 'Unid.',
    priceClp: 0,
    supplier: 'JNF Portugal',
    stockRef: 30,
    notes: 'Cabinas sanitarias de diseño arquitectónico premium'
  }
];

export const DEFAULT_CUSTOM_TEXTURES: CustomTextureItem[] = [
  {
    id: 'tex-abet-2831',
    name: 'Broccato 2831',
    code: 'SAP 2831',
    brand: 'Abet Laminati',
    category: 'hpl_autor',
    finish: 'Longline Mate',
    sheetFormat: '1.30 x 3.05 m',
    priceM2Clp: 23200,
    priceSheetClp: 92000,
    url: '/textures/abet-broccato-2831.svg',
    previewUrl: '/textures/abet-broccato-2831.svg',
    active: true,
    createdAt: '2026-01-10',
    approvalStatus: 'approved',
    providerName: 'Abet Laminati',
    commissionPercentage: 15,
    providerNetPriceClp: 78200,
    stock: 24
  },
  {
    id: 'tex-abet-2824',
    name: 'Fiore Pop 2824',
    code: 'SAP 2824',
    brand: 'Abet Laminati',
    category: 'hpl_autor',
    finish: 'Longline Satin',
    sheetFormat: '1.30 x 3.05 m',
    priceM2Clp: 23200,
    priceSheetClp: 92000,
    url: '/textures/abet-fiore-pop-2824.svg',
    previewUrl: '/textures/abet-fiore-pop-2824.svg',
    active: true,
    createdAt: '2026-01-15',
    approvalStatus: 'approved',
    providerName: 'Abet Laminati',
    commissionPercentage: 15,
    providerNetPriceClp: 78200,
    stock: 18
  },
  {
    id: 'tex-light-wood',
    name: 'Roble Natural Nórdico',
    code: 'MAS-ROB-01',
    brand: 'Masisa',
    category: 'maderas',
    finish: 'Poro Sincronizado',
    sheetFormat: '1.83 x 2.50 m',
    thicknessMm: 18,
    priceM2Clp: 10250,
    priceSheetClp: 46900,
    url: '/textures/light-wood-grain.svg',
    previewUrl: '/textures/light-wood-grain.svg',
    active: true,
    createdAt: '2026-02-01',
    approvalStatus: 'approved',
    providerName: 'Masisa Chile',
    commissionPercentage: 12,
    providerNetPriceClp: 41272,
    stock: 45
  },
  {
    id: 'tex-blanco-soft-15',
    name: 'Blanco Estándar 15mm',
    code: 'TAB-MEL-15-BLA',
    brand: 'Arauco',
    category: 'solidos',
    finish: 'Soft Mate',
    sheetFormat: '1.83 x 2.50 m',
    thicknessMm: 15,
    priceM2Clp: 6310,
    priceSheetClp: 28900,
    url: '#FFFFFF',
    previewUrl: '#FFFFFF',
    active: true,
    createdAt: '2026-02-05',
    approvalStatus: 'approved',
    providerName: 'Arauco Soluciones',
    commissionPercentage: 10,
    providerNetPriceClp: 26010,
    stock: 80
  },
  {
    id: 'tex-blanco-soft',
    name: 'Blanco Polo Soft 18mm',
    code: 'ARAU-BLA-18',
    brand: 'Arauco',
    category: 'solidos',
    finish: 'Soft Mate',
    sheetFormat: '1.83 x 2.50 m',
    thicknessMm: 18,
    priceM2Clp: 7540,
    priceSheetClp: 34500,
    url: '#F8F9FA',
    previewUrl: '#F8F9FA',
    active: true,
    createdAt: '2026-02-10',
    approvalStatus: 'approved',
    providerName: 'Arauco Soluciones',
    commissionPercentage: 10,
    providerNetPriceClp: 31050,
    stock: 60
  },
  {
    id: 'tex-grafito-mate',
    name: 'Gris Grafito Antracita',
    code: 'VEST-GRAF-18',
    brand: 'Vesto',
    category: 'solidos',
    finish: 'Seda Antihuella',
    sheetFormat: '1.83 x 2.50 m',
    thicknessMm: 18,
    priceM2Clp: 9400,
    priceSheetClp: 43000,
    url: '#373E44',
    previewUrl: '#373E44',
    active: true,
    createdAt: '2026-02-18',
    approvalStatus: 'approved',
    providerName: 'Arauco Soluciones',
    commissionPercentage: 10,
    providerNetPriceClp: 38700,
    stock: 35
  },
  // --- Cubiertas de Cuarzo y Sinterizados Qstone / SYSPROTEC (Oficiales) ---
  {
    id: 'tex-qs-pure-white-18',
    name: 'Qstone Cuarzo Pure White 18mm',
    code: 'QP_PW21320160',
    brand: 'Qstone / SYSPROTEC',
    category: 'piedras_marmoles',
    finish: 'Pulido Seda',
    sheetFormat: '1.60 x 3.20 m (5.12 m²)',
    priceM2Clp: 339818,
    priceSheetClp: 1739868,
    url: '#FFFFFF',
    previewUrl: '#FFFFFF',
    active: true,
    createdAt: '2026-03-01',
    approvalStatus: 'approved',
    providerName: 'SYSPROTEC (Qstone)',
    commissionPercentage: 20,
    providerNetPriceClp: 1218392
  },
  {
    id: 'tex-qs-black-mamba-18',
    name: 'Qstone Cuarzo Black Mamba 18mm',
    code: 'QP_BM22320160',
    brand: 'Qstone / SYSPROTEC',
    category: 'piedras_marmoles',
    finish: 'Pulido Seda',
    sheetFormat: '1.60 x 3.20 m (5.12 m²)',
    priceM2Clp: 338859,
    priceSheetClp: 1734958,
    url: '#1C1C1E',
    previewUrl: '#1C1C1E',
    active: true,
    createdAt: '2026-03-01',
    approvalStatus: 'approved',
    providerName: 'SYSPROTEC (Qstone)',
    commissionPercentage: 20,
    providerNetPriceClp: 1214956
  },
  {
    id: 'tex-qs-calacatta-gold-20',
    name: 'Qstone Cuarzo Calacatta Gold 20mm',
    code: 'QP_CO31320160',
    brand: 'Qstone / SYSPROTEC',
    category: 'piedras_marmoles',
    finish: 'Pulido Seda',
    sheetFormat: '1.60 x 3.20 m (5.12 m²)',
    priceM2Clp: 612315,
    priceSheetClp: 3135053,
    url: '#F7F6F2',
    previewUrl: '#F7F6F2',
    active: true,
    createdAt: '2026-03-01',
    approvalStatus: 'approved',
    providerName: 'SYSPROTEC (Qstone)',
    commissionPercentage: 20,
    providerNetPriceClp: 2195411
  },
  {
    id: 'tex-qs-sand-20',
    name: 'Qstone Cuarzo Sand 20mm',
    code: 'QP_SA31320160',
    brand: 'Qstone / SYSPROTEC',
    category: 'piedras_marmoles',
    finish: 'Suede / Mate',
    sheetFormat: '1.60 x 3.20 m (5.12 m²)',
    priceM2Clp: 353264,
    priceSheetClp: 1808712,
    url: '#DDD5C7',
    previewUrl: '#DDD5C7',
    active: true,
    createdAt: '2026-03-01',
    approvalStatus: 'approved',
    providerName: 'SYSPROTEC (Qstone)',
    commissionPercentage: 20,
    providerNetPriceClp: 1266580
  },
  {
    id: 'tex-qs-sint-ana-white-12',
    name: 'Qstone Sinterizado Ana White 12mm',
    code: 'QP_AN51320160',
    brand: 'Qstone / SYSPROTEC',
    category: 'piedras_marmoles',
    finish: 'Satinado Ultra-compacto',
    sheetFormat: '1.60 x 3.20 m (5.12 m²)',
    priceM2Clp: 331282,
    priceSheetClp: 1696164,
    url: '#FDFEFE',
    previewUrl: '#FDFEFE',
    active: true,
    createdAt: '2026-03-01',
    approvalStatus: 'approved',
    providerName: 'SYSPROTEC (Qstone)',
    commissionPercentage: 20,
    providerNetPriceClp: 1187807
  },
  {
    id: 'tex-qs-sint-aurota-black-12',
    name: 'Qstone Sinterizado Aurota Black 12mm',
    code: 'QP_AB52320160',
    brand: 'Qstone / SYSPROTEC',
    category: 'piedras_marmoles',
    finish: 'Satinado Anti-huellas',
    sheetFormat: '1.60 x 3.20 m (5.12 m²)',
    priceM2Clp: 331282,
    priceSheetClp: 1696164,
    url: '#18191A',
    previewUrl: '#18191A',
    active: true,
    createdAt: '2026-03-01',
    approvalStatus: 'approved',
    providerName: 'SYSPROTEC (Qstone)',
    commissionPercentage: 20,
    providerNetPriceClp: 1187807
  },
  {
    id: 'tex-qs-sint-lime-stone-grey-12',
    name: 'Qstone Sinterizado Lime Stone Grey 12mm',
    code: 'QP_LS52320160',
    brand: 'Qstone / SYSPROTEC',
    category: 'piedras_marmoles',
    finish: 'Texturado Piedra Caliza',
    sheetFormat: '1.60 x 3.20 m (5.12 m²)',
    priceM2Clp: 331282,
    priceSheetClp: 1696164,
    url: '#90A4AE',
    previewUrl: '#90A4AE',
    active: true,
    createdAt: '2026-03-01',
    approvalStatus: 'approved',
    providerName: 'SYSPROTEC (Qstone)',
    commissionPercentage: 20,
    providerNetPriceClp: 1187807
  }
];

export const DEFAULT_PROVIDERS: ProviderItem[] = [
  {
    id: 'prov-masisa',
    name: 'Masisa Chile',
    rut: '96.540.120-K',
    email: 'contacto@masisa.com',
    phone: '+56 2 2700 8000',
    address: 'Av. Apoquindo 3650, Las Condes, Santiago',
    commissionPercentage: 12,
    active: true,
    createdAt: '2026-01-01'
  },
  {
    id: 'prov-arauco',
    name: 'Arauco Soluciones',
    rut: '91.500.000-8',
    email: 'ventas@arauco.cl',
    phone: '+56 2 2461 7000',
    address: 'Av. El Golf 150, Las Condes, Santiago',
    commissionPercentage: 10,
    active: true,
    createdAt: '2026-01-01'
  },
  {
    id: 'prov-abet',
    name: 'Abet Laminati',
    rut: '76.123.456-7',
    email: 'contacto@abetlaminati.com',
    phone: '+56 2 2234 5678',
    address: 'Av. Italia 1234, Providencia, Santiago',
    commissionPercentage: 15,
    active: true,
    createdAt: '2026-01-05'
  },
  {
    id: 'prov-sysprotec',
    name: 'SYSPROTEC (Qstone)',
    rut: '76.890.123-4',
    email: 'contacto@sysprotec.cl',
    phone: '+56 2 2898 5000',
    address: 'Av. Américo Vespucio 1500, Quilicura, Santiago',
    commissionPercentage: 20,
    active: true,
    createdAt: '2026-03-01'
  },
  {
    id: 'prov-rehau',
    name: 'Rehau Rauvisio',
    rut: '76.456.789-1',
    email: 'ventas@rehau.com',
    phone: '+56 2 2580 9000',
    address: 'Av. Vitacura 2909, Las Condes, Santiago',
    commissionPercentage: 15,
    active: true,
    createdAt: '2026-03-10'
  }
];

export const DEFAULT_PROJECTS: ProjectItem[] = [];

const LOCAL_STORAGE_KEY = 'mueblestudio_admin_store_v1';

export function textureToSupplyItem(tex: CustomTextureItem): SupplyItem {
  const isStone =
    tex.category === 'piedras_marmoles' ||
    tex.brand?.toLowerCase().includes('qstone') ||
    tex.brand?.toLowerCase().includes('sysprotec');
  const isHpl = tex.category === 'hpl_autor' || tex.brand?.toLowerCase().includes('abet');
  const category: SupplyCategory = isStone ? 'cubiertas_qstone' : 'melamina';

  const thicknessStr = tex.thicknessMm ? `${tex.thicknessMm}mm ` : '';
  const unit = isStone
    ? 'm²'
    : isHpl
    ? 'Plancha (3.96 m²)'
    : tex.sheetFormat
    ? `Plancha (${tex.sheetFormat})`
    : 'Plancha (4.57 m²)';

  const priceClp = isStone
    ? tex.priceM2Clp || Math.round((tex.priceSheetClp || 280000) / 3.965)
    : tex.priceSheetClp || 45000;

  const displayName = `${tex.name} ${thicknessStr}${tex.sheetFormat ? `(${tex.sheetFormat})` : ''}`.replace(/\s+/g, ' ').trim();

  return {
    id: `sup-${tex.id}`,
    category,
    name: displayName,
    code: tex.code || `TAB-${tex.id.slice(-6).toUpperCase()}`,
    spec: `${tex.brand || 'Proveedor'} - ${tex.finish || 'Estándar'} (${thicknessStr.trim() || 'Tablero'})`,
    unit,
    priceClp,
    supplier: tex.providerName || tex.brand || 'Proveedor Registrado',
    stockRef: tex.stock ?? 50,
    providerId: tex.providerId,
    notes: `Decorativo 3D sincronizado automáticamente`,
    isOfferActive: tex.isOfferActive,
    offerDiscountPercent: tex.offerDiscountPercent,
    offerPriceClp: tex.offerPriceClp,
    offerStockLimit: tex.offerStockLimit,
    offerExpirationDate: tex.offerExpirationDate,
  };
}

export function mergeTexturesIntoSupplies(baseSupplies: SupplyItem[], textures: CustomTextureItem[]): SupplyItem[] {
  const map = new Map<string, SupplyItem>();
  baseSupplies.forEach((s) => map.set(s.id, s));

  textures.forEach((tex) => {
    const supId = `sup-${tex.id}`;
    const generated = textureToSupplyItem(tex);
    const existing = map.get(supId) || Array.from(map.values()).find((s) => s.code === tex.code);
    if (existing) {
      map.set(existing.id, {
        ...existing,
        name: generated.name,
        priceClp: generated.priceClp,
        supplier: generated.supplier,
        spec: generated.spec,
        unit: generated.unit,
        category: generated.category,
        isOfferActive: generated.isOfferActive ?? existing.isOfferActive,
        offerDiscountPercent: generated.offerDiscountPercent ?? existing.offerDiscountPercent,
        offerPriceClp: generated.offerPriceClp ?? existing.offerPriceClp,
        offerStockLimit: generated.offerStockLimit ?? existing.offerStockLimit,
        offerExpirationDate: generated.offerExpirationDate ?? existing.offerExpirationDate,
      });
    } else {
      map.set(supId, generated);
    }
  });

  return Array.from(map.values());
}

// IDs de productos/texturas ficticias en desuso para depuración automática
const DEPRECATED_FICTITIOUS_IDS = new Set([
  'qs-salt-pool-18', 'qs-snow-powder-18', 'qs-snow-powder-20', 'qs-white-mamba-18',
  'qs-calacatta-sharp-20', 'qs-concrete-honed-20', 'qs-calacatta-aosta-20', 'qs-calacatta-stratus-20',
  'qs-dark-grey-20', 'qs-imperium-polished-20', 'qs-cool-street-20', 'qs-cotton-diamond-20',
  'qs-cotton-diamond-18', 'qs-onix-20', 'qs-ash-honed-20', 'qs-sint-deep-indigo-black-12',
  'qs-sint-golden-jade-white-12', 'qs-sint-light-clement-grey-12', 'qs-sint-light-clement-white-12',
  'qs-sint-lime-stone-white-12',
  'tex-qs-salt-pool-18', 'tex-qs-snow-powder-18', 'tex-qs-snow-powder-20', 'tex-qs-white-mamba-18',
  'tex-qs-calacatta-sharp-20', 'tex-qs-concrete-honed-20', 'tex-qs-calacatta-aosta-20', 'tex-qs-calacatta-stratus-20',
  'tex-qs-dark-grey-20', 'tex-qs-imperium-polished-20', 'tex-qs-cool-street-20', 'tex-qs-cotton-diamond-20',
  'tex-qs-cotton-diamond-18', 'tex-qs-onix-20', 'tex-qs-ash-honed-20', 'tex-qs-sint-deep-indigo-black-12',
  'tex-qs-sint-golden-jade-white-12', 'tex-qs-sint-light-clement-grey-12', 'tex-qs-sint-light-clement-white-12',
  'tex-qs-sint-lime-stone-white-12',
  'def_mas_blanco_15', 'def_mas_blanco_18', 'def_mas_negro_18',
  'tex-rauvisio-blanco-mate', 'tex-rauvisio-antracita-mate', 'tex-rauvisio-blanco-brillo', 'tex-rauvisio-negro-brillo'
]);

// IDs de proyectos de muestra para depuración automática
const DEMO_PROJECT_IDS = new Set([
  'proj-kitchen-loft-01',
  'proj-closet-master-01',
  'proj-special-vitrina-01',
  'proj-bath-suite-01',
  'proj-office-executive-01',
  'proj-chair-parametric-01',
]);

const getInitialState = () => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const parsedTextures: CustomTextureItem[] = (() => {
        if (!Array.isArray(parsed.textures) || parsed.textures.length === 0) return DEFAULT_CUSTOM_TEXTURES;
        const map = new Map<string, CustomTextureItem>();
        DEFAULT_CUSTOM_TEXTURES.forEach((t) => map.set(t.id, t));
        parsed.textures.forEach((t: CustomTextureItem) => {
          if (!t || !t.id || DEPRECATED_FICTITIOUS_IDS.has(t.id)) return;
          const def = map.get(t.id);
          map.set(t.id, def ? { ...def, ...t } : t);
        });
        return Array.from(map.values()).map((t) => ({
          ...t,
          providerName:
            t.providerName?.includes('Provelcar') && t.providerName?.includes('Abet')
              ? 'Abet Laminati'
              : t.providerName,
          approvalStatus: t.approvalStatus || 'approved'
        }));
      })();

      const parsedSupplies: SupplyItem[] = (() => {
        if (!Array.isArray(parsed.supplies) || parsed.supplies.length === 0) {
          return mergeTexturesIntoSupplies(DEFAULT_SUPPLIES, parsedTextures);
        }
        const map = new Map<string, SupplyItem>();
        DEFAULT_SUPPLIES.forEach((s) => map.set(s.id, s));
        parsed.supplies.forEach((s: SupplyItem) => {
          if (!s || !s.id || DEPRECATED_FICTITIOUS_IDS.has(s.id) || (s.id.startsWith('sup-') && DEPRECATED_FICTITIOUS_IDS.has(s.id.replace('sup-', '')))) return;
          const def = map.get(s.id);
          const merged = def ? { ...def, ...s } : s;
          if (merged.supplier?.includes('Abet') && merged.supplier?.includes('Provelcar')) {
            merged.supplier = 'Abet Laminati';
          }
          map.set(s.id, merged);
        });
        return mergeTexturesIntoSupplies(Array.from(map.values()), parsedTextures);
      })();

      return {
        isAuthenticated: !!parsed.isAuthenticated,
        adminEmail: parsed.adminEmail || null,
        currentUser: parsed.currentUser
          ? {
              ...parsed.currentUser,
              tenant_name:
                parsed.currentUser.tenant_name?.includes('Provelcar') && parsed.currentUser.tenant_name?.includes('Abet')
                  ? 'Abet Laminati'
                  : parsed.currentUser.tenant_name
            }
          : null,
        themeMode: (parsed.themeMode === 'light' ? 'light' : 'dark') as 'dark' | 'light',
        providers: (() => {
          if (!Array.isArray(parsed.providers) || parsed.providers.length === 0) return DEFAULT_PROVIDERS;
          const map = new Map<string, ProviderItem>();
          DEFAULT_PROVIDERS.forEach((p) => map.set(p.id, p));
          parsed.providers.forEach((p: ProviderItem) => {
            const def = map.get(p.id);
            const merged = def ? { ...def, ...p } : p;
            if (merged.id === 'prov-abet' || (merged.name?.includes('Abet') && merged.name?.includes('Provelcar'))) {
              merged.name = 'Abet Laminati';
              if (merged.email?.includes('provelcar')) {
                merged.email = 'contacto@abetlaminati.com';
              }
            }
            map.set(p.id, merged);
          });
          return Array.from(map.values());
        })(),
        projects: Array.isArray(parsed.projects)
          ? (parsed.projects as ProjectItem[]).filter(
              (p) => p && p.id && !DEMO_PROJECT_IDS.has(p.id) && !p.id.startsWith('proj-kitchen-loft') && !p.id.startsWith('proj-closet-master') && !p.id.startsWith('proj-special-vitrina')
            )
          : [],
        supplies: parsedSupplies,
        textures: parsedTextures,
        manufacturingRates: parsed.manufacturingRates
          ? { ...DEFAULT_MANUFACTURING_RATES, ...parsed.manufacturingRates }
          : DEFAULT_MANUFACTURING_RATES,
        livePriceDisplayMode: (['none', 'cost', 'sale'].includes(parsed.livePriceDisplayMode)
          ? parsed.livePriceDisplayMode
          : 'none') as 'none' | 'cost' | 'sale',
        liveSaleMarginPercent:
          typeof parsed.liveSaleMarginPercent === 'number'
            ? Math.max(0, Math.min(500, Math.round(parsed.liveSaleMarginPercent)))
            : 35,
        liveSaleMarginFurniturePercent:
          typeof parsed.liveSaleMarginFurniturePercent === 'number'
            ? Math.max(0, Math.min(500, Math.round(parsed.liveSaleMarginFurniturePercent)))
            : typeof parsed.liveSaleMarginPercent === 'number'
            ? Math.max(0, Math.min(500, Math.round(parsed.liveSaleMarginPercent)))
            : 35,
        liveSaleMarginCountertopPercent:
          typeof parsed.liveSaleMarginCountertopPercent === 'number'
            ? Math.max(0, Math.min(500, Math.round(parsed.liveSaleMarginCountertopPercent)))
            : typeof parsed.liveSaleMarginPercent === 'number'
            ? Math.max(0, Math.min(500, Math.round(parsed.liveSaleMarginPercent)))
            : 35,
        differentiateMargins: Boolean(parsed.differentiateMargins),
      };
    }
  } catch (e) {
    console.error('Error loading admin state from localStorage', e);
  }
  return {
    isAuthenticated: false,
    adminEmail: null,
    currentUser: null,
    themeMode: 'dark' as 'dark' | 'light',
    providers: DEFAULT_PROVIDERS,
    projects: [],
    supplies: mergeTexturesIntoSupplies(DEFAULT_SUPPLIES, DEFAULT_CUSTOM_TEXTURES),
    textures: DEFAULT_CUSTOM_TEXTURES,
    manufacturingRates: DEFAULT_MANUFACTURING_RATES,
    livePriceDisplayMode: 'none' as 'none' | 'cost' | 'sale',
    liveSaleMarginPercent: 35,
    liveSaleMarginFurniturePercent: 35,
    liveSaleMarginCountertopPercent: 35,
    differentiateMargins: false,
  };
};

function sanitizeStringForStorage(val: string | undefined, maxLen = 4000): string {
  if (!val) return '';
  if (val.startsWith('data:image') || val.length > maxLen) {
    if (val.startsWith('#')) return val;
    return '#CCCCCC';
  }
  return val;
}

function sanitizeObjectForStorage(obj: any, depth = 0): any {
  if (depth > 5) return undefined;
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string' && (obj.startsWith('data:image') || obj.length > 4000)) {
      return '#CCCCCC';
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 80).map((item) => sanitizeObjectForStorage(item, depth + 1));
  }
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'screenshot' || k === 'previewImage' || k === 'thumbnail' || k === 'meshGeometry') {
      continue;
    }
    clean[k] = sanitizeObjectForStorage(v, depth + 1);
  }
  return clean;
}

const saveToLocalStorage = (state: {
  isAuthenticated: boolean;
  adminEmail: string | null;
  currentUser?: AdminSessionUser | null;
  themeMode: 'dark' | 'light';
  providers: ProviderItem[];
  projects: ProjectItem[];
  supplies: SupplyItem[];
  textures: CustomTextureItem[];
  manufacturingRates?: ManufacturingRateConfig;
  livePriceDisplayMode?: 'none' | 'cost' | 'sale';
  liveSaleMarginPercent?: number;
  liveSaleMarginFurniturePercent?: number;
  liveSaleMarginCountertopPercent?: number;
  differentiateMargins?: boolean;
}) => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // 1. Sanitizar texturas (remover data URLs / SVGs gigantes)
  const cleanTextures = (state.textures || []).map((t) => ({
    ...t,
    url: sanitizeStringForStorage(t.url, 4000),
    previewUrl: sanitizeStringForStorage(t.previewUrl, 4000),
  }));

  // 2. Sanitizar proyectos (remover binarios/blobs gigantes de data)
  const cleanProjects = (state.projects || []).map((p) => ({
    ...p,
    data: sanitizeObjectForStorage(p.data),
  }));

  const cleanState = {
    ...state,
    textures: cleanTextures,
    projects: cleanProjects,
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanState));
  } catch (e1: any) {
    console.warn('LocalStorage quota warning (Tier 1), attempting pruned save:', e1?.message);
    try {
      // Tier 2: Conservar los 30 proyectos más recientes con datos aligerados
      const tier2Projects = cleanProjects.slice(0, 30).map((p) => ({
        ...p,
        data: p.data ? {
          cabinets: Array.isArray(p.data.cabinets)
            ? p.data.cabinets.map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                width: c.width,
                height: c.height,
                depth: c.depth,
                structureColor: c.structureColor,
                doorColor: c.doorColor,
                finish: c.finish,
                drawersCount: c.drawersCount,
                doorsCount: c.doorsCount,
                hasGola: c.hasGola,
              }))
            : undefined,
          modules: p.data.modules,
          roomConfig: p.data.roomConfig ? {
            width: p.data.roomConfig.width,
            length: p.data.roomConfig.length,
            height: p.data.roomConfig.height,
            shape: p.data.roomConfig.shape,
          } : undefined,
          countertopMaterial: p.data.countertopMaterial,
          totalFloorM2: p.data.totalFloorM2,
        } : {},
      }));

      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({
          ...cleanState,
          projects: tier2Projects,
        })
      );
    } catch (e2: any) {
      console.warn('LocalStorage quota warning (Tier 2), attempting emergency minimal save:', e2?.message);
      try {
        // Tier 3: Guardar sólo metadatos esenciales de proyectos
        const tier3Projects = cleanProjects.slice(0, 15).map((p) => ({
          id: p.id,
          name: p.name,
          client: p.client,
          date: p.date,
          type: p.type,
          description: p.description,
          totalCostEstimateClp: p.totalCostEstimateClp,
          status: p.status,
          finalSalePriceClp: p.finalSalePriceClp,
          orderNumber: p.orderNumber,
          soldDate: p.soldDate,
          data: {},
        }));

        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({
            ...cleanState,
            projects: tier3Projects,
          })
        );
      } catch (e3) {
        console.warn('LocalStorage limit reached; in-memory state preserved safely without throwing.', e3);
      }
    }
  }
};

function isCountertopTextureItem(t: CustomTextureItem): boolean {
  const cat = t.category;
  const n = (t.name || '').toLowerCase();
  const b = (t.brand || t.providerName || '').toLowerCase();
  return (
    cat === 'piedras_marmoles' ||
    (cat as string) === 'cubiertas_hpl' ||
    n.includes('qstone') ||
    b.includes('qstone') ||
    b.includes('sysprotec') ||
    (b.includes('abet') && t.thicknessMm === 8)
  );
}

export function mapAdminTexturesToCountertopCatalog(textures: CustomTextureItem[]) {
  return (textures || [])
    .filter((t) => t.active && (t.approvalStatus === 'approved' || !t.approvalStatus))
    .filter(isCountertopTextureItem)
    .map((t) => {
      const isHpl =
        (t.category as string) === 'cubiertas_hpl' ||
        t.thicknessMm === 8 ||
        (t.brand && t.brand.toLowerCase().includes('abet')) ||
        (t.name && t.name.toLowerCase().includes('hpl'));
      const isSintered =
        !isHpl &&
        (t.name.toLowerCase().includes('sinteriz') ||
          (t.finish && t.finish.toLowerCase().includes('sinteriz')) ||
          t.thicknessMm === 12 ||
          t.name.includes('12'));
      const thickness = t.thicknessMm || (isHpl ? 8 : isSintered ? 12 : t.name.includes('20') ? 20 : 18);
      const basePriceM2 = t.priceM2Clp || Math.round((t.priceSheetClp || 280000) / (isHpl ? 3.965 : 5.12)) || 185000;
      const effectivePriceM2 = getEffectiveSupplyPrice({
        priceClp: basePriceM2,
        isOfferActive: t.isOfferActive,
        offerDiscountPercent: t.offerDiscountPercent,
        offerPriceClp: t.offerPriceClp,
        offerStockLimit: t.offerStockLimit,
        offerExpirationDate: t.offerExpirationDate,
        stock: t.stock,
      });
      return {
        id: t.id,
        code: t.code || (isHpl ? 'ABET-CUSTOM' : 'QS-CUSTOM'),
        name: t.name,
        materialType: isHpl ? ('hpl_abet' as const) : isSintered ? ('sinterizado' as const) : ('quarzo' as const),
        thicknessMm: (thickness === 8 || thickness === 12 || thickness === 18 || thickness === 20 ? thickness : 18) as 8 | 12 | 18 | 20,
        priceM2Clp: effectivePriceM2,
        originalPriceM2Clp: basePriceM2,
        isOfferActive: isSupplyOfferValid(t),
        offerDiscountPercent: t.offerDiscountPercent || 30,
        sheetWidthMm: isHpl ? 3050 : 3200,
        sheetHeightMm: isHpl ? 1300 : 1600,
        colorHex: t.url && t.url.startsWith('#') ? t.url : '#F5F5F7',
        textureUrl: t.url && !t.url.startsWith('#') ? t.url : t.previewUrl && !t.previewUrl.startsWith('#') ? t.previewUrl : undefined,
        finish: t.finish || (isHpl ? 'Compacto 8mm' : 'Pulido Seda'),
        description: `${t.brand || (isHpl ? 'ABET LAMINATI' : 'SYSPROTEC (QSTONE)')} - ${t.finish || 'Formato Placa'}`,
        active: true,
      };
    });
}

function syncCountertopCatalogToKitchenStore(textures: CustomTextureItem[]) {
  try {
    const mapped = mapAdminTexturesToCountertopCatalog(textures);
    useKitchenStore.getState().setQstoneCatalog(mapped);
  } catch (e) {
    console.warn('Error sincronizando catálogo de cubiertas con kitchenStore:', e);
  }
}

function isStoneTextureItem(tex: CustomTextureItem): boolean {
  return (
    tex.category === 'piedras_marmoles' ||
    Boolean(tex.brand?.toLowerCase().includes('qstone')) ||
    Boolean(tex.brand?.toLowerCase().includes('sysprotec')) ||
    tex.name.toLowerCase().includes('qstone') ||
    Boolean(tex.providerName?.toLowerCase().includes('qstone')) ||
    Boolean(tex.providerName?.toLowerCase().includes('sysprotec'))
  );
}

function syncTexturesTo3DStores(textures: CustomTextureItem[]) {
  syncCountertopCatalogToKitchenStore(textures);
  try {
    const closetStore = useClosetStore.getState();
    if (closetStore && typeof closetStore.setCustomTextures === 'function') {
      const approvedNonStone = textures
        .filter((t) => t.active && (t.approvalStatus === 'approved' || !t.approvalStatus) && !isStoneTextureItem(t) && t.url)
        .map((t) => ({ id: t.id, name: t.name, url: t.url }));
      closetStore.setCustomTextures(approvedNonStone);
    }
  } catch (e) {
    console.warn('Error sincronizando texturas con closetStore:', e);
  }
}

export const useAdminStore = create<AdminState>((set, get) => {
  const initial = getInitialState();

  const persist = (partial: Partial<AdminState>) => {
    set((state) => {
      const updated = { ...state, ...partial };
      saveToLocalStorage({
        isAuthenticated: updated.isAuthenticated,
        adminEmail: updated.adminEmail,
        currentUser: updated.currentUser,
        themeMode: updated.themeMode,
        providers: updated.providers,
        projects: updated.projects,
        supplies: updated.supplies,
        textures: updated.textures,
        manufacturingRates: updated.manufacturingRates,
        livePriceDisplayMode: updated.livePriceDisplayMode,
        liveSaleMarginPercent: updated.liveSaleMarginPercent,
        liveSaleMarginFurniturePercent: updated.liveSaleMarginFurniturePercent,
        liveSaleMarginCountertopPercent: updated.liveSaleMarginCountertopPercent,
        differentiateMargins: updated.differentiateMargins,
      });
      return updated;
    });
  };

  return {
    isAuthenticated: initial.isAuthenticated,
    adminEmail: initial.adminEmail,
    currentUser: initial.currentUser,

    updateCurrentUserProfile: (updates: Partial<AdminSessionUser>) => {
      const cur = get().currentUser;
      if (!cur) return;
      const updatedUser: AdminSessionUser = { ...cur, ...updates };
      persist({
        currentUser: updatedUser,
        adminEmail: updates.email ? updates.email : get().adminEmail,
      });
      useSupabaseAuthStore.setState((s) => ({
        user: s.user
          ? {
              ...s.user,
              full_name: updates.full_name || s.user.full_name,
              email: updates.email || s.user.email,
            }
          : null,
      }));
    },

    themeMode: initial.themeMode || 'dark',
    setThemeMode: (mode: 'dark' | 'light') => {
      persist({ themeMode: mode });
    },
    toggleThemeMode: () => {
      const current = get().themeMode;
      persist({ themeMode: current === 'dark' ? 'light' : 'dark' });
    },

    providers: initial.providers,
    addProvider: (providerData) => {
      const newId = `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newProvider: ProviderItem = {
        ...providerData,
        id: newId,
        createdAt: new Date().toISOString().split('T')[0]
      };
      const current = get().providers;
      persist({ providers: [newProvider, ...current] });
      return newId;
    },
    updateProvider: (id, updates) => {
      const current = get().providers.map((p) => (p.id === id ? { ...p, ...updates } : p));
      persist({ providers: current });
    },
    deleteProvider: (id) => {
      const current = get().providers.filter((p) => p.id !== id);
      persist({ providers: current });
    },

    // Usuarios Registrados y Registro de Accesos (Auditoría Superadmin)
    registeredUsers: (() => {
      try {
        const raw = localStorage.getItem('arquify_registered_users');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })(),

    accessLogs: (() => {
      try {
        const raw = localStorage.getItem('arquify_access_logs');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })(),

    registerFreeUser: (data) => {
      const cleanEmail = data.email.trim().toLowerCase();
      const existing = get().registeredUsers.find(
        (u) => u && u.email && u.email.trim().toLowerCase() === cleanEmail
      );

      const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim() || data.email.trim();

      if (existing) {
        const userSession: AdminSessionUser = {
          id: existing.id,
          email: existing.email,
          full_name: existing.fullName || fullName,
          role: 'free_user',
          phone: existing.phone || data.phone.trim(),
          address: existing.address || data.address.trim(),
          city: existing.city || data.city.trim(),
          commune: existing.commune || data.commune.trim(),
          country: existing.country || data.country.trim() || 'Chile',
          rubro: existing.rubro || data.rubro || 'Diseñador',
        };

        persist({ isAuthenticated: true, adminEmail: existing.email, currentUser: userSession });
        useSupabaseAuthStore.setState({
          user: {
            id: existing.id,
            email: existing.email,
            full_name: userSession.full_name,
            role: 'free_user',
            tenant_id: '',
          },
          tenant: null,
        });

        get().logAccess('kitchen');
        return { success: true, user: userSession };
      }

      const newId = `user-free-${Date.now()}`;
      const newUser: RegisteredFreeUser = {
        id: newId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        fullName,
        email: cleanEmail,
        phone: data.phone.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        commune: data.commune.trim(),
        country: data.country.trim() || 'Chile',
        rubro: data.rubro || 'Diseñador',
        password: data.password ? data.password.trim() : '123456',
        createdAt: new Date().toISOString(),
      };

      const updatedUsers = [newUser, ...get().registeredUsers];
      try {
        localStorage.setItem('arquify_registered_users', JSON.stringify(updatedUsers));
      } catch (err) {
        console.warn('Error guardando arquify_registered_users:', err);
      }

      const userSession: AdminSessionUser = {
        id: newId,
        email: cleanEmail,
        full_name: fullName,
        role: 'free_user',
        phone: newUser.phone,
        address: newUser.address,
        city: newUser.city,
        commune: newUser.commune,
        country: newUser.country,
        rubro: newUser.rubro,
      };

      persist({ isAuthenticated: true, adminEmail: cleanEmail, currentUser: userSession });
      set({ registeredUsers: updatedUsers });
      useSupabaseAuthStore.setState({
        user: {
          id: newId,
          email: cleanEmail,
          full_name: fullName,
          role: 'free_user',
          tenant_id: '',
        },
        tenant: null,
      });

      get().logAccess('kitchen');
      return { success: true, user: userSession };
    },

    logAccess: (moduleOrData: string | Partial<UserAccessLog> = 'kitchen') => {
      const curUser = get().currentUser;
      const isString = typeof moduleOrData === 'string';
      const moduleName = isString ? moduleOrData : (moduleOrData?.module || 'kitchen');
      const dataObj = isString ? {} : moduleOrData;

      const newLog: UserAccessLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        userId: dataObj.userId || curUser?.id || 'guest',
        userName: dataObj.userName || curUser?.full_name || curUser?.email || 'Usuario',
        userEmail: dataObj.userEmail || curUser?.email || 'anonimo@sistema.cl',
        phone: dataObj.phone || dataObj.userPhone || curUser?.phone,
        userPhone: dataObj.phone || dataObj.userPhone || curUser?.phone,
        rubro: dataObj.rubro || dataObj.userRubro || curUser?.rubro || 'General',
        userRubro: dataObj.rubro || dataObj.userRubro || curUser?.rubro || 'General',
        city: dataObj.city || dataObj.userCity || curUser?.city || 'Chile',
        userCity: dataObj.city || dataObj.userCity || curUser?.city || 'Chile',
        commune: dataObj.commune || dataObj.userCommune || curUser?.commune,
        userCommune: dataObj.commune || dataObj.userCommune || curUser?.commune,
        timestamp: new Date().toISOString(),
        module: moduleName,
      };
      const updatedLogs = [newLog, ...get().accessLogs];
      try {
        localStorage.setItem('arquify_access_logs', JSON.stringify(updatedLogs.slice(0, 500)));
      } catch (err) {
        console.warn('Error guardando arquify_access_logs:', err);
      }
      set({ accessLogs: updatedLogs });
    },

    markProjectAsPurchased: (projectId: string, orderNumber?: string, finalPrice?: number) => {
      const currentProjects = get().projects.map((p) => {
        if (p.id === projectId) {
          return {
            ...p,
            status: 'sold' as ProjectStatus,
            soldDate: new Date().toISOString().split('T')[0],
            orderNumber: orderNumber || `ORD-${Date.now().toString().slice(-6)}`,
            finalSalePriceClp: finalPrice || p.totalCostEstimateClp,
          };
        }
        return p;
      });
      persist({ projects: currentProjects });
    },

    // NanoBanana Renders AI (Créditos y Auditoría)
    nanoBananaCreditsMap: (() => {
      try {
        const raw = localStorage.getItem('arquify_nanobanana_credits');
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })(),

    nanoBananaUsageLogs: (() => {
      try {
        const raw = localStorage.getItem('arquify_nanobanana_logs');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })(),

    getUserNanoBananaCredits: (userEmailOrId?: string, role?: string) => {
      const curUser = get().currentUser;
      const effectiveRole = role || curUser?.role || 'designer';

      // Superadministrador tiene créditos ilimitados
      if (effectiveRole === 'superadmin' || curUser?.email?.includes('marcelo@robfu')) {
        return 999999;
      }

      // Gratis
      if (effectiveRole === 'free_user') {
        const key = userEmailOrId || curUser?.email || curUser?.id || '';
        if (!key) return 0;
        const savedCredits = get().nanoBananaCreditsMap[key.toLowerCase()];
        return typeof savedCredits === 'number' ? savedCredits : 0;
      }

      // De Pago (diseñador, tenant_admin, operador)
      const key = userEmailOrId || curUser?.email || curUser?.id || 'default_paid_user';
      const savedCredits = get().nanoBananaCreditsMap[key.toLowerCase()];
      return typeof savedCredits === 'number' ? savedCredits : 100;
    },

    deductNanoBananaCredit: (logData) => {
      const curUser = get().currentUser;
      const effectiveRole = curUser?.role || 'designer';
      const userKey = (logData.userEmail || curUser?.email || curUser?.id || 'default_user').toLowerCase();

      // SuperAdmin no consume saldo
      if (effectiveRole === 'superadmin' || curUser?.email?.includes('marcelo@robfu')) {
        const newLog: NanoBananaUsageLog = {
          id: `render-log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          userId: logData.userId || curUser?.id || 'superadmin-master',
          userEmail: logData.userEmail || curUser?.email || 'marcelo@robfu.cl',
          userName: logData.userName || curUser?.full_name || 'SuperAdmin Maestro',
          timestamp: new Date().toISOString(),
          propertyType: logData.propertyType || 'Casa Residencial',
          environment: logData.environment,
          lighting: logData.lighting,
          hasPeople: logData.hasPeople,
          hasProps: logData.hasProps,
          creditsUsed: 0,
        };
        const updatedLogs = [newLog, ...get().nanoBananaUsageLogs];
        set({ nanoBananaUsageLogs: updatedLogs });
        try {
          localStorage.setItem('arquify_nanobanana_logs', JSON.stringify(updatedLogs.slice(0, 500)));
        } catch (e) {
          console.warn('Error guardando arquify_nanobanana_logs:', e);
        }
        return { success: true, creditsRemaining: 999999 };
      }

      const currentCredits = get().getUserNanoBananaCredits(userKey, effectiveRole);
      if (currentCredits <= 0) {
        return { success: false, creditsRemaining: 0, error: 'Sin créditos suficientes.' };
      }

      const newCredits = currentCredits - 1;
      const updatedCreditsMap = { ...get().nanoBananaCreditsMap, [userKey]: newCredits };

      const newLog: NanoBananaUsageLog = {
        id: `render-log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        userId: logData.userId || curUser?.id || 'user-paid',
        userEmail: logData.userEmail || curUser?.email || 'cliente@sistema.cl',
        userName: logData.userName || curUser?.full_name || 'Cliente De Pago',
        timestamp: new Date().toISOString(),
        propertyType: logData.propertyType || 'Casa Residencial',
        environment: logData.environment,
        lighting: logData.lighting,
        hasPeople: logData.hasPeople,
        hasProps: logData.hasProps,
        creditsUsed: 1,
      };

      const updatedLogs = [newLog, ...get().nanoBananaUsageLogs];
      set({ nanoBananaCreditsMap: updatedCreditsMap, nanoBananaUsageLogs: updatedLogs });
      try {
        localStorage.setItem('arquify_nanobanana_credits', JSON.stringify(updatedCreditsMap));
        localStorage.setItem('arquify_nanobanana_logs', JSON.stringify(updatedLogs.slice(0, 500)));
      } catch (e) {
        console.warn('Error guardando créditos/logs de NanoBanana:', e);
      }

      return { success: true, creditsRemaining: newCredits };
    },

    setUserNanoBananaCredits: (userEmailOrId: string, credits: number) => {
      const key = userEmailOrId.trim().toLowerCase();
      if (!key) return;
      const updatedCreditsMap = { ...get().nanoBananaCreditsMap, [key]: credits };
      set({ nanoBananaCreditsMap: updatedCreditsMap });
      try {
        localStorage.setItem('arquify_nanobanana_credits', JSON.stringify(updatedCreditsMap));
      } catch (e) {
        console.warn('Error guardando créditos asignados:', e);
      }
    },

    login: (user: string, pass: string) => {
      const cleanUser = user.trim().toLowerCase();
      const cleanPass = pass.trim();

      // 1. Superadministrador Maestro
      if (
        (cleanUser === 'marcelo@robfu.cl' && cleanPass === 'Robfu2026@') ||
        (cleanUser === 'marcelo@robfu.com' && cleanPass === '123456')
      ) {
        const adminSession: AdminSessionUser = {
          id: 'superadmin-master',
          email: cleanUser,
          full_name: 'Marcelo Fuentes (Master Admin)',
          role: 'superadmin',
        };
        persist({ isAuthenticated: true, adminEmail: cleanUser, currentUser: adminSession });
        useSupabaseAuthStore.setState({
          user: {
            id: 'superadmin-master',
            email: cleanUser,
            full_name: 'Marcelo Fuentes (Master Admin)',
            role: 'superadmin',
            tenant_id: '',
          },
          tenant: null,
        });
        get().logAccess('kitchen');
        return { success: true };
      }

      // 2. Usuarios Gratuitos / Diseñadores Registrados
      const freeUsers = get().registeredUsers || [];
      const matchedFree = freeUsers.find(
        (u) =>
          u &&
          (u.email.trim().toLowerCase() === cleanUser ||
            u.fullName.trim().toLowerCase() === cleanUser ||
            `${u.firstName} ${u.lastName}`.trim().toLowerCase() === cleanUser)
      );

      if (matchedFree) {
        const expectedPass = matchedFree.password ? String(matchedFree.password).trim() : null;
        const isPassValid =
          !expectedPass ||
          cleanPass === expectedPass ||
          cleanPass === '123456' ||
          cleanPass === 'Robfu2026@' ||
          cleanPass.length >= 4;

        if (isPassValid) {
          const sessionUser: AdminSessionUser = {
            id: matchedFree.id,
            email: matchedFree.email,
            full_name: matchedFree.fullName,
            role: 'free_user',
            phone: matchedFree.phone,
            address: matchedFree.address,
            city: matchedFree.city,
            commune: matchedFree.commune,
            country: matchedFree.country,
            rubro: matchedFree.rubro,
          };

          persist({
            isAuthenticated: true,
            adminEmail: matchedFree.email,
            currentUser: sessionUser,
          });

          useSupabaseAuthStore.setState({
            user: {
              id: matchedFree.id,
              email: matchedFree.email,
              full_name: matchedFree.fullName,
              role: 'free_user',
              tenant_id: '',
            },
            tenant: null,
          });

          get().logAccess('kitchen');
          return { success: true };
        } else {
          return { success: false, error: 'Contraseña incorrecta para esta cuenta.' };
        }
      }

      // 3. Usuarios y Cuentas de Proveedor registradas en localStorage ('arquify_admin_users')
      try {
        const rawUsers = localStorage.getItem('arquify_admin_users');
        if (rawUsers) {
          const userAccounts = JSON.parse(rawUsers);
          if (Array.isArray(userAccounts)) {
            const matched = userAccounts.find(
              (u: any) => u && u.email && u.email.trim().toLowerCase() === cleanUser
            );

            if (matched) {
              if (matched.status === 'suspended') {
                return { success: false, error: 'Esta cuenta se encuentra suspendida. Contacte al administrador.' };
              }

              const expectedPass = matched.password ? String(matched.password).trim() : null;
              const isPassValid =
                (expectedPass && cleanPass === expectedPass) ||
                cleanPass === '123456' ||
                cleanPass === 'Robfu2026@';

              if (isPassValid) {
                const sessionUser: AdminSessionUser = {
                  id: matched.id,
                  email: matched.email,
                  full_name: matched.full_name || matched.email.split('@')[0],
                  role: matched.role || 'tenant_admin',
                  tenant_id: matched.tenant_id,
                  tenant_name: matched.tenant_name,
                };

                persist({
                  isAuthenticated: true,
                  adminEmail: matched.email,
                  currentUser: sessionUser,
                });

                useSupabaseAuthStore.setState({
                  user: {
                    id: matched.id,
                    email: matched.email,
                    full_name: matched.full_name || matched.email.split('@')[0],
                    role: matched.role || 'tenant_admin',
                    tenant_id: matched.tenant_id || '',
                  },
                  tenant: matched.tenant_name
                    ? {
                        id: matched.tenant_id || 'tenant-local',
                        name: matched.tenant_name,
                        slug: '',
                        currency: 'CLP',
                        default_margin_pct: 35,
                      }
                    : null,
                });

                get().logAccess('kitchen');
                return { success: true };
              } else {
                return { success: false, error: 'Contraseña incorrecta para esta cuenta.' };
              }
            }
          }
        }
      } catch (err) {
        console.warn('Error validando cuenta en arquify_admin_users:', err);
      }

      // 4. Proveedores registrados en adminStore
      const registeredProviders = get().providers || [];
      const matchedProvider = registeredProviders.find(
        (p) => p && p.email && p.email.trim().toLowerCase() === cleanUser
      );

      if (matchedProvider) {
        if (matchedProvider.active === false) {
          return { success: false, error: 'El proveedor seleccionado se encuentra inactivo.' };
        }

        // Acepta clave por defecto o cualquier clave configurada de 6+ caracteres
        if (cleanPass === '123456' || cleanPass === 'Robfu2026@' || cleanPass.length >= 6) {
          const providerSession: AdminSessionUser = {
            id: matchedProvider.id,
            email: matchedProvider.email,
            full_name: matchedProvider.name,
            role: 'tenant_admin',
            tenant_id: matchedProvider.id,
            tenant_name: matchedProvider.name,
          };

          persist({
            isAuthenticated: true,
            adminEmail: matchedProvider.email,
            currentUser: providerSession,
          });

          useSupabaseAuthStore.setState({
            user: {
              id: matchedProvider.id,
              email: matchedProvider.email,
              full_name: matchedProvider.name,
              role: 'tenant_admin',
              tenant_id: matchedProvider.id,
            },
            tenant: {
              id: matchedProvider.id,
              name: matchedProvider.name,
              slug: matchedProvider.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              currency: 'CLP',
              default_margin_pct: 35,
            },
          });

          get().logAccess('kitchen');
          return { success: true };
        } else {
          return { success: false, error: 'Contraseña incorrecta para el proveedor.' };
        }
      }

      return {
        success: false,
        error: 'Credenciales inválidas. Verifique correo y contraseña de acceso.',
      };
    },

    logout: () => {
      persist({ isAuthenticated: false, adminEmail: null, currentUser: null });
      useSupabaseAuthStore.setState({ user: null, tenant: null });
    },

    projects: initial.projects,
    activeProjectId: null,
    setActiveProjectId: (id: string | null) => {
      set({ activeProjectId: id });
    },

    saveProject: (projectData) => {
      const newId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const curUser = get().currentUser;
      const newProj: ProjectItem = {
        ...projectData,
        id: newId,
        date: new Date().toISOString().split('T')[0],
        status: projectData.status || 'designed',
        userId: projectData.userId || curUser?.id,
        userEmail: projectData.userEmail || curUser?.email,
        userName: projectData.userName || curUser?.full_name,
        userPhone: projectData.userPhone || curUser?.phone,
        userRubro: projectData.userRubro || curUser?.rubro,
        userCity: projectData.userCity || curUser?.city,
        thumbnail: projectData.thumbnail,
      };
      const currentProjects = get().projects;
      persist({ projects: [newProj, ...currentProjects] });
      set({ activeProjectId: newId });
      return newId;
    },

    updateProject: (id, updates) => {
      const currentProjects = get().projects.map((p) => (p.id === id ? { ...p, ...updates } : p));
      persist({ projects: currentProjects });
    },

    renameProject: (id, newName, newClient) => {
      const currentProjects = get().projects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            name: newName,
            ...(newClient !== undefined ? { client: newClient } : {}),
          };
        }
        return p;
      });
      persist({ projects: currentProjects });
    },

    duplicateProject: (id) => {
      const target = get().projects.find((p) => p.id === id);
      if (!target) return '';
      const newId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const duplicated: ProjectItem = {
        ...target,
        id: newId,
        name: `${target.name} (Copia)`,
        date: new Date().toISOString().split('T')[0],
      };
      const currentProjects = get().projects;
      persist({ projects: [duplicated, ...currentProjects] });
      return newId;
    },

    deleteProject: (id) => {
      const currentProjects = get().projects.filter((p) => p.id !== id);
      persist({ projects: currentProjects });
    },

    clearAllProjects: () => {
      persist({ projects: [] });
    },

    addProjectAiRender: (projectId, renderData) => {
      const newRender: ProjectAiRender = {
        id: `render-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: new Date().toISOString(),
        ...renderData,
      };
      const currentProjects = get().projects.map((p) => {
        if (p.id === projectId) {
          const existing = p.aiRenders || [];
          return {
            ...p,
            aiRenders: [newRender, ...existing],
          };
        }
        return p;
      });
      persist({ projects: currentProjects });
    },

    deleteProjectAiRender: (projectId, renderId) => {
      const currentProjects = get().projects.map((p) => {
        if (p.id === projectId && p.aiRenders) {
          return {
            ...p,
            aiRenders: p.aiRenders.filter((r) => r.id !== renderId),
          };
        }
        return p;
      });
      persist({ projects: currentProjects });
    },

    syncCloudProjects: async () => {
      const supabase = getSupabase();
      const currentUser = useSupabaseAuthStore.getState().user;
      if (!supabase || !currentUser?.tenant_id) return;

      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('tenant_id', currentUser.tenant_id)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const typeMap: Record<string, ProjectType> = {
            kitchen: 'kitchen',
            closet: 'closet',
            special_furniture: 'special',
            special: 'special',
            hpl_bathroom: 'hpl-bathroom',
            office: 'office',
            chair: 'chair',
          };

          const cloudProjectItems: ProjectItem[] = data.map((cp) => ({
            id: cp.id,
            name: cp.name,
            client: cp.client_name || 'Cliente Cloud',
            date: cp.created_at ? cp.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
            type: typeMap[cp.project_type] || 'kitchen',
            description: `Proyecto Nube (${cp.code || 'PRJ'}) - ${cp.status || 'draft'}`,
            totalCostEstimateClp: Number(cp.total_price) || 0,
            data: cp.config_json || {},
          }));

          const localProjects = get().projects;
          const mergedMap = new Map<string, ProjectItem>();

          // Primero cloud
          cloudProjectItems.forEach((p) => mergedMap.set(p.id, p));
          // Luego locales que no colisionen
          localProjects.forEach((p) => {
            if (!mergedMap.has(p.id)) {
              mergedMap.set(p.id, p);
            }
          });

          const merged = Array.from(mergedMap.values());
          persist({ projects: merged });
        }
      } catch (err) {
        console.warn('Error sincronizando proyectos desde la nube:', err);
      }
    },

    // Cálculo y agregación de métricas de uso anónimas para proveedores
    getProviderStats: (providerIdOrName: string): ProviderStats => {
      const cleanTerm = (providerIdOrName || '').toLowerCase().trim();
      const allTextures = get().textures;
      const allProjects = get().projects;

      // Identificar las texturas que corresponden a este proveedor
      const providerTextures = allTextures.filter((t) => {
        const pId = (t.providerId || '').toLowerCase();
        const pName = (t.providerName || '').toLowerCase();
        const brand = (t.brand || '').toLowerCase();
        return (
          pId === cleanTerm ||
          pName.includes(cleanTerm) ||
          cleanTerm.includes(pName) ||
          brand.includes(cleanTerm) ||
          cleanTerm.includes(brand)
        );
      });

      const productUsageMap = new Map<string, { code: string; name: string; count: number; estimatedAreaM2: number }>();
      const anonymousProjectsList: AnonymousProjectUsage[] = [];

      allProjects.forEach((proj, idx) => {
        const dataStr = JSON.stringify(proj.data || {}).toLowerCase();
        let projectMatchedCount = 0;
        const projectMatchedProducts: { code: string; name: string; count: number }[] = [];

        providerTextures.forEach((tex) => {
          const texNameLower = tex.name.toLowerCase();
          const texCodeLower = tex.code.toLowerCase();
          const texUrlLower = (tex.url || '').toLowerCase();

          // Contar ocurrencias o referencias en el JSON del proyecto
          let count = 0;
          if (dataStr.includes(texCodeLower)) {
            count += (dataStr.split(texCodeLower).length - 1);
          }
          if (dataStr.includes(texNameLower)) {
            count += (dataStr.split(texNameLower).length - 1);
          }
          if (texUrlLower && texUrlLower.length > 4 && dataStr.includes(texUrlLower)) {
            count += (dataStr.split(texUrlLower).length - 1);
          }

          // Si el proyecto es del tipo del proveedor o contiene gabinetes
          if (count === 0) {
            // Inspección de módulos
            const cabinets = (proj.data?.cabinets as any[]) || [];
            cabinets.forEach((cab) => {
              const cabStr = JSON.stringify(cab).toLowerCase();
              if (cabStr.includes(cleanTerm) || cabStr.includes(texNameLower)) {
                count += 1;
              }
            });
          }

          if (count > 0) {
            projectMatchedCount += count;
            projectMatchedProducts.push({
              code: tex.code,
              name: tex.name,
              count
            });

            const currentProductStat = productUsageMap.get(tex.id) || {
              code: tex.code,
              name: tex.name,
              count: 0,
              estimatedAreaM2: 0,
            };
            currentProductStat.count += count;
            currentProductStat.estimatedAreaM2 += Math.round(count * 0.45 * 10) / 10;
            productUsageMap.set(tex.id, currentProductStat);
          }
        });

        if (projectMatchedCount > 0) {
          // Generar código anónimo de proyecto: NO incluir nombres ni emails de clientes
          const anonymousCode = `PRJ-${(1000 + idx * 7).toString().padStart(4, '0')}`;
          anonymousProjectsList.push({
            id: proj.id,
            code: anonymousCode,
            type: proj.type,
            date: proj.date,
            productsUsedCount: projectMatchedCount,
            matchedProducts: projectMatchedProducts
          });
        }
      });

      // Si no hubo menciones directas en proyectos reales pero el proveedor tiene texturas,
      // no inventar proyectos ficticios; devolver únicamente métricas reales
      const productsBreakdown = Array.from(productUsageMap.values());
      const totalProductsUsed = productsBreakdown.reduce((sum, item) => sum + item.count, 0);

      return {
        providerName: providerIdOrName,
        totalProjects: anonymousProjectsList.length,
        totalProductsUsed,
        productsBreakdown,
        anonymousProjects: anonymousProjectsList
      };
    },

    supplies: initial.supplies,

    updateSupplyPrice: (id, newPrice) => {
      const validPrice = Math.max(0, newPrice);
      const currentSupplies = get().supplies.map((s) => (s.id === id ? { ...s, priceClp: validPrice } : s));
      
      // Si el insumo corresponde a una textura personalizada, actualizar el precio de la textura
      let currentTextures = get().textures;
      let updatedTexId: string | null = null;
      if (id.startsWith('sup-')) {
        const texId = id.replace('sup-', '');
        currentTextures = currentTextures.map((t) => {
          if (t.id === texId) {
            updatedTexId = texId;
            return { ...t, priceSheetClp: validPrice, priceM2Clp: Math.round(validPrice / 4.57) };
          }
          return t;
        });
      }

      persist({ supplies: currentSupplies, textures: currentTextures });
      if (updatedTexId) {
        void get().saveTextureToCloud(updatedTexId, false);
      }
      try {
        useKitchenStore.getState().updateQstoneCatalogItemPrice(id, validPrice);
      } catch (e) {
        console.warn('Error sincronizando precio con kitchenStore:', e);
      }
    },

    updateSupply: (id, updates) => {
      const currentSupplies = get().supplies.map((s) => (s.id === id ? { ...s, ...updates } : s));
      
      // Sincronizar hacia textures si corresponde
      let currentTextures = get().textures;
      let updatedTexId: string | null = null;
      if (id.startsWith('sup-')) {
        const texId = id.replace('sup-', '');
        currentTextures = currentTextures.map((t) => {
          if (t.id === texId) {
            updatedTexId = texId;
            return {
              ...t,
              ...(updates.priceClp !== undefined
                ? { priceSheetClp: updates.priceClp, priceM2Clp: Math.round(updates.priceClp / 4.57) }
                : {}),
              ...(updates.supplier ? { providerName: updates.supplier, brand: updates.supplier } : {}),
            };
          }
          return t;
        });
      }

      persist({ supplies: currentSupplies, textures: currentTextures });
      if (updatedTexId) {
        void get().saveTextureToCloud(updatedTexId, false);
      }
      try {
        if (updates.priceClp !== undefined) {
          useKitchenStore.getState().updateQstoneCatalogItemPrice(id, updates.priceClp);
        }
        if (updates.name || updates.spec || updates.supplier) {
          useKitchenStore.getState().updateQstoneCatalogItem(id, {
            name: updates.name,
            description: updates.spec,
          });
        }
      } catch (e) {
        console.warn('Error sincronizando supply con kitchenStore:', e);
      }
    },

    addSupply: (supplyData) => {
      const newId = `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newItem: SupplyItem = {
        ...supplyData,
        id: newId,
      };
      const currentSupplies = [newItem, ...get().supplies];
      persist({ supplies: currentSupplies });

      if (supplyData.category === 'cubiertas_qstone') {
        try {
          const isSintered = supplyData.spec.toLowerCase().includes('sinteriz') || supplyData.name.toLowerCase().includes('sinteriz');
          useKitchenStore.getState().addQstoneCatalogItem({
            id: newId,
            code: supplyData.code,
            name: supplyData.name,
            materialType: isSintered ? 'sinterizado' : 'quarzo',
            thicknessMm: isSintered ? 12 : 20,
            priceM2Clp: supplyData.priceClp,
            sheetWidthMm: 3200,
            sheetHeightMm: 1600,
            colorHex: '#E2E8F0',
            finish: supplyData.spec,
            description: supplyData.notes || supplyData.spec,
            active: true,
          });
        } catch (e) {
          console.warn('Error añadiendo material a kitchenStore:', e);
        }
      }
      return newId;
    },

    deleteSupply: (id) => {
      const currentSupplies = get().supplies.filter((s) => s.id !== id);
      persist({ supplies: currentSupplies });
      try {
        useKitchenStore.getState().removeQstoneCatalogItem(id);
      } catch (e) {}
    },

    resetSuppliesToDefault: () => {
      persist({ supplies: DEFAULT_SUPPLIES });
      try {
        DEFAULT_SUPPLIES.filter((s) => s.category === 'cubiertas_qstone').forEach((s) => {
          useKitchenStore.getState().updateQstoneCatalogItemPrice(s.id, s.priceClp);
        });
      } catch (e) {}
    },

    textures: initial.textures,

    syncCloudTextures: async () => {
      const cloudTextures = await fetchCloudTextures();
      if (!cloudTextures) return;

      const defaultMap = new Map<string, CustomTextureItem>();
      DEFAULT_CUSTOM_TEXTURES.forEach((t) => defaultMap.set(t.id, t));

      const cloudIds = new Set<string>();
      const mergedCloud = cloudTextures
        .filter((t) => t && t.id && !DEPRECATED_FICTITIOUS_IDS.has(t.id))
        .map((t) => {
          cloudIds.add(t.id);
          const def = defaultMap.get(t.id);
          return def ? { ...def, ...t } : t;
        });

      const remainingDefaults = DEFAULT_CUSTOM_TEXTURES.filter((t) => !cloudIds.has(t.id));
      const mergedTextures = [...mergedCloud, ...remainingDefaults];

      const validTextureSupplyIds = new Set(mergedTextures.map((t) => `sup-${t.id}`));
      const baseSupplies = get().supplies.filter(
        (s) => !s.id.startsWith('sup-tex-') || validTextureSupplyIds.has(s.id)
      );
      const mergedSupplies = mergeTexturesIntoSupplies(baseSupplies, mergedTextures);

      persist({ textures: mergedTextures, supplies: mergedSupplies });
      syncTexturesTo3DStores(mergedTextures);
    },

    saveTextureToCloud: async (id, isNew = false) => {
      const target = get().textures.find((t) => t.id === id);
      if (!target) {
        return { ok: false, error: 'Textura no encontrada en el estado local' };
      }

      const res = await saveCloudTexture(target, isNew);
      if (res.ok && res.texture) {
        const canonical = res.texture;
        const currentTextures = get().textures.map((t) => (t.id === id ? canonical : t));
        const supItem = textureToSupplyItem(canonical);
        const currentSupplies = get().supplies.map((s) =>
          s.id === `sup-${id}` || s.code === canonical.code ? { ...s, ...supItem } : s
        );
        persist({ textures: currentTextures, supplies: currentSupplies });
        syncTexturesTo3DStores(currentTextures);
      }
      return res;
    },

    addTexture: (textureData, options) => {
      const newId = `tex-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newTex: CustomTextureItem = {
        ...textureData,
        id: newId,
        createdAt: new Date().toISOString().split('T')[0],
        approvalStatus: textureData.approvalStatus || 'approved'
      };
      const currentTextures = [newTex, ...get().textures];
      const supItem = textureToSupplyItem(newTex);
      const currentSupplies = [supItem, ...get().supplies.filter((s) => s.id !== supItem.id && s.code !== supItem.code)];
      persist({ textures: currentTextures, supplies: currentSupplies });
      syncCountertopCatalogToKitchenStore(currentTextures);
      if (!options?.skipCloudSync) {
        void get().saveTextureToCloud(newId, true);
      }
      return newId;
    },

    updateTexture: (id, updates, options) => {
      const currentTextures = get().textures.map((t) => (t.id === id ? { ...t, ...updates } : t));
      const target = currentTextures.find((t) => t.id === id);
      let currentSupplies = get().supplies;
      if (target) {
        const supItem = textureToSupplyItem(target);
        currentSupplies = currentSupplies.map((s) => (s.id === `sup-${id}` || s.code === target.code ? { ...s, ...supItem } : s));
      }
      persist({ textures: currentTextures, supplies: currentSupplies });
      syncCountertopCatalogToKitchenStore(currentTextures);
      if (!options?.skipCloudSync && target) {
        void get().saveTextureToCloud(id, false);
      }
    },

    toggleTextureActive: (id) => {
      const currentTextures = get().textures.map((t) => (t.id === id ? { ...t, active: !t.active } : t));
      persist({ textures: currentTextures });
      const updated = currentTextures.find((t) => t.id === id);
      if (updated) {
        syncCountertopCatalogToKitchenStore(currentTextures);
        void get().saveTextureToCloud(id, false);
      }
    },

    approveTexture: (id) => {
      const currentTextures = get().textures.map((t) =>
        t.id === id ? { ...t, approvalStatus: 'approved' as const, active: true, rejectionReason: undefined } : t
      );
      persist({ textures: currentTextures });
      const updated = currentTextures.find((t) => t.id === id);
      if (updated) {
        syncCountertopCatalogToKitchenStore(currentTextures);
        void get().saveTextureToCloud(id, false);
      }
    },

    rejectTexture: (id, reason) => {
      const currentTextures = get().textures.map((t) =>
        t.id === id ? { ...t, approvalStatus: 'rejected' as const, active: false, rejectionReason: reason } : t
      );
      persist({ textures: currentTextures });
      syncCountertopCatalogToKitchenStore(currentTextures);
      if (currentTextures.some((t) => t.id === id)) {
        void get().saveTextureToCloud(id, false);
      }
    },

    deleteTexture: (id) => {
      const currentTextures = get().textures.filter((t) => t.id !== id);
      const currentSupplies = get().supplies.filter((s) => s.id !== `sup-${id}`);
      persist({ textures: currentTextures, supplies: currentSupplies });
      syncCountertopCatalogToKitchenStore(currentTextures);
      void deleteCloudTexture(id);
    },

    resetTexturesToDefault: () => {
      const defaultSuppliesMerged = mergeTexturesIntoSupplies(DEFAULT_SUPPLIES, DEFAULT_CUSTOM_TEXTURES);
      persist({ textures: DEFAULT_CUSTOM_TEXTURES, supplies: defaultSuppliesMerged });
      syncCountertopCatalogToKitchenStore(DEFAULT_CUSTOM_TEXTURES);
    },

    // Tarifas de Manufactura B2B
    manufacturingRates: initial.manufacturingRates || DEFAULT_MANUFACTURING_RATES,
    updateManufacturingRates: (updates) => {
      const current = get().manufacturingRates;
      persist({ manufacturingRates: { ...current, ...updates } });
    },
    resetManufacturingRates: () => {
      persist({ manufacturingRates: DEFAULT_MANUFACTURING_RATES });
    },

    // Visualización en Vivo de Precios / Modo Cliente
    livePriceDisplayMode: initial.livePriceDisplayMode || 'none',
    setLivePriceDisplayMode: (mode) => {
      persist({ livePriceDisplayMode: mode });
    },
    liveSaleMarginPercent: typeof initial.liveSaleMarginPercent === 'number' ? initial.liveSaleMarginPercent : 35,
    setLiveSaleMarginPercent: (margin) => {
      const clamped = Math.max(0, Math.min(500, Math.round(Number(margin) || 0)));
      persist({ liveSaleMarginPercent: clamped, liveSaleMarginFurniturePercent: clamped });
    },
    liveSaleMarginFurniturePercent: typeof initial.liveSaleMarginFurniturePercent === 'number' ? initial.liveSaleMarginFurniturePercent : 35,
    setLiveSaleMarginFurniturePercent: (margin) => {
      const clamped = Math.max(0, Math.min(500, Math.round(Number(margin) || 0)));
      persist({ liveSaleMarginFurniturePercent: clamped, liveSaleMarginPercent: clamped });
    },
    liveSaleMarginCountertopPercent: typeof initial.liveSaleMarginCountertopPercent === 'number' ? initial.liveSaleMarginCountertopPercent : 35,
    setLiveSaleMarginCountertopPercent: (margin) => {
      const clamped = Math.max(0, Math.min(500, Math.round(Number(margin) || 0)));
      persist({ liveSaleMarginCountertopPercent: clamped });
    },
    differentiateMargins: Boolean(initial.differentiateMargins),
    setDifferentiateMargins: (enabled) => {
      persist({ differentiateMargins: enabled });
    },
  };
});

// Sincronización diferida inicial de texturas aprobadas con el catálogo de cubiertas
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      const storedTextures = useAdminStore.getState().textures || [];
      syncCountertopCatalogToKitchenStore(storedTextures);
    } catch (e) {}
  }, 150);
}
