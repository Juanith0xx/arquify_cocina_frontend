import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateNestingLayout } from './src/utils/nesting.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    microservice: 'Arquify Cocina Cut Optimizer Service (Nesting)',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/optimize', (req, res) => {
  try {
    const { parts, sheetWidth = 1830, sheetHeight = 2500, kerf = 4 } = req.body;
    if (!parts || !Array.isArray(parts)) {
      return res.status(400).json({ error: 'Lista de piezas requerida para optimizar el corte' });
    }

    const result = generateNestingLayout(parts, { sheetWidth, sheetHeight, kerf });
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error procesando optimización de corte', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Cut Optimizer Microservice corriendo en puerto ${PORT}`);
});
