import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline, env } from '@xenova/transformers';
import { config } from '../config/index.js';

// Disable local models to fetch from HuggingFace, but cache them locally
env.allowLocalModels = false;

let extractor: any = null;
let qdrantClient: QdrantClient | null = null;
const COLLECTION_NAME = 'hr_rules';

export async function queryHrRules(query: string): Promise<{
  success: boolean;
  results: any[];
  message?: string;
}> {
  try {
    if (!extractor) {
      console.log('[INFO] Initializing embedding model for HR queries...');
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    if (!qdrantClient) {
      qdrantClient = new QdrantClient({ url: config.qdrant.url });
    }

    // Check if collection exists
    try {
      await qdrantClient.getCollection(COLLECTION_NAME);
    } catch (err: any) {
      return {
        success: false,
        results: [],
        message: 'The HR knowledge base has not been initialized yet. Please run the ingestion script.',
      };
    }

    // Embed query
    const output = await extractor(query, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    // Search Qdrant
    const searchResults = await qdrantClient.search(COLLECTION_NAME, {
      vector: vector as number[],
      limit: 5, // Top 5 most relevant chunks
      with_payload: true,
    });

    // Format results
    const results = searchResults.map(res => ({
      score: res.score,
      text: res.payload?.text,
      source: res.payload?.source,
    }));

    return {
      success: true,
      results,
    };
  } catch (error: any) {
    console.error('[ERROR] Error in queryHrRules:', error);
    return {
      success: false,
      results: [],
      message: error.message,
    };
  }
}
