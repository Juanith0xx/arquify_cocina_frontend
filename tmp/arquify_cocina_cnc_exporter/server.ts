import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateKitchenCncDxf } from './src/utils/kitchenCncDxf.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    microservice: 'Arquify Cocina CNC Exporter Service (Mecanizado CAD/DXF)',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/dxf', (req, res) => {
  try {
    const { cabinets } = req.body;
    if (!cabinets || !Array.isArray(cabinets)) {
      return res.status(400).json({ error: 'Módulos requeridos para mecanizado CNC' });
    }

    const dxfContent = generateKitchenCncDxf(cabinets);
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Disposition', 'attachment; filename="mecanizado_cocina.dxf"');
    res.send(dxfContent);
  } catch (error: any) {
    res.status(500).json({ error: 'Error generando mecanizado CNC DXF', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 CNC Exporter Microservice corriendo en puerto ${PORT}`);
});
