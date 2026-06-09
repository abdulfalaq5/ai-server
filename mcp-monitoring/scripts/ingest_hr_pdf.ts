import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline, env } from '@xenova/transformers';
import { v4 as uuidv4 } from 'uuid';

// Disable local models to fetch from HuggingFace, but cache them locally
env.allowLocalModels = false;

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'hr_rules';
const EMBEDDING_DIMENSION = 384; // all-MiniLM-L6-v2 dimension

async function run() {
  console.log('--- Starting HR PDF Ingestion ---');

  const pdfPath = path.resolve(__dirname, '../../documents/peraturan-perusahaan.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found at ${pdfPath}`);
    process.exit(1);
  }

  // 1. Read PDF
  console.log(`Reading PDF from ${pdfPath}...`);
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer);
  const text = data.text;

  // 2. Chunk text
  // Simple chunking by double newlines or split into roughly equal chunks
  console.log('Chunking text...');
  const chunks = text
    .split(/\n\s*\n/)
    .map(c => c.trim())
    .filter(c => c.length > 50); // Ignore very short chunks

  console.log(`Extracted ${chunks.length} chunks from the PDF.`);

  // 3. Initialize Transformer
  console.log('Initializing embedding model (Xenova/all-MiniLM-L6-v2)...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  // 4. Initialize Qdrant
  console.log(`Connecting to Qdrant at ${QDRANT_URL}...`);
  const client = new QdrantClient({ url: QDRANT_URL });

  const collections = await client.getCollections();
  const collectionExists = collections.collections.some((c: any) => c.name === COLLECTION_NAME);

  if (!collectionExists) {
    console.log(`Creating collection '${COLLECTION_NAME}'...`);
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: EMBEDDING_DIMENSION, distance: 'Cosine' },
    });
  } else {
    console.log(`Collection '${COLLECTION_NAME}' already exists. Recreating...`);
    await client.deleteCollection(COLLECTION_NAME);
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: EMBEDDING_DIMENSION, distance: 'Cosine' },
    });
  }

  // 5. Embed and Upsert
  console.log('Embedding and uploading chunks to Qdrant...');
  const points = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Generate embedding
    const output = await extractor(chunk, { pooling: 'mean', normalize: true });
    // Convert to regular array
    const vector = Array.from(output.data);

    points.push({
      id: uuidv4(),
      vector,
      payload: {
        text: chunk,
        source: 'peraturan-perusahaan.pdf',
        chunk_index: i,
      },
    });

    if (i % 10 === 0 && i > 0) {
      console.log(`Processed ${i}/${chunks.length} chunks...`);
    }
  }

  // Upsert in batches to avoid payload size limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch,
    });
    console.log(`Upserted batch ${i / BATCH_SIZE + 1}...`);
  }

  console.log('--- Ingestion Complete! ---');
}

run().catch(console.error);
