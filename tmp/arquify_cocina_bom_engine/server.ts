import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateKitchenPartsList } from './src/utils/kitchenManufacturing.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    microservice: 'Arquify Cocina BOM Engine Service (Despiece Industrial)',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/calculate', (req, res) => {
  try {
    const { cabinets } = req.body;
    if (!cabinets || !Array.isArray(cabinets)) {
      return res.status(400).json({ error: 'Módulos requeridos para calcular despiece BOM' });
    }

    const parts = generateKitchenPartsList(cabinets);
    res.json({
      success: true,
      totalParts: parts.length,
      parts,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error calculando despiece BOM', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 BOM Engine Microservice corriendo en puerto ${PORT}`);
});
