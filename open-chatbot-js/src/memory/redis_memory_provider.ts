import type { RedisClientType } from 'redis';
import { SchemaFieldTypes, VectorAlgorithms, createClient } from 'redis';
import { toFloat32Buffer } from '../utils/conversion_utils.js';
import { MemoryProvider } from './memory_provider.js';

import { EmbeddingModel } from '../models/embedding_model.js';
import { ConvMessage } from '../utils/conv_message.js';

export class RedisMemory extends MemoryProvider {
    private redis: RedisClientType;
    private embeddingModel: EmbeddingModel;
    private memoryIndex: string;
    private searchPrefix: string;

    constructor(
        redisHost: string,
        redisPort: number,
        embeddingModel: EmbeddingModel,
        memoryIndex = 'idx:memory',
        searchPrefix = 'noderedis:knn'
    ) {
        super();
        this.embeddingModel = embeddingModel;
        this.memoryIndex = memoryIndex;
        this.searchPrefix = searchPrefix;

        this.redis = createClient({
            socket: {
                host: redisHost,
                port: redisPort,
            },
        });
    }

    async init() {
        await this.redis.connect();
        await this.createIndex();
    }

    async add(context: ConvMessage[], data: string) {
        const vector = await this.embeddingModel.createEmbedding(context);
        const dataDict = {
            data: data,
            embedding: toFloat32Buffer(vector),
        };

        // Use INCR to generate a unique identifier for the hash
        const id = await this.redis.incr(`${this.searchPrefix}:id`);

        // Use the generated ID as the key for the hash
        await this.redis.hSet(`${this.searchPrefix}:${id}`, dataDict);
    }

    async del(context: ConvMessage[], data: string) {
        const baseQuery = `*=>[KNN 1 @embedding $vector AS dist]`;
        const vector = await this.embeddingModel.createEmbedding([
            ...context,
            new ConvMessage('assistant', 'assistant', data),
        ]);
        const results = await this.redis.ft.search(this.memoryIndex, baseQuery, {
            PARAMS: {
                vector: toFloat32Buffer(vector),
            },
            SORTBY: 'dist',
            DIALECT: 2,
            RETURN: ['id'],
        });

        // no results found, nothing to delete
        if (results.total === 0) {
            return;
        }

        // delete the document from the Redis database
        const docId = results.documents[0].id;
        await this.redis.del(docId);
    }

    async get(context: ConvMessage[], numRelevant = 1): Promise<string[]> {
        const baseQuery = `*=>[KNN ${numRelevant} @embedding $vector AS dist]`;
        const vector = await this.embeddingModel.createEmbedding(context);
        const results = await this.redis.ft.search(this.memoryIndex, baseQuery, {
            PARAMS: {
                vector: toFloat32Buffer(vector),
            },
            SORTBY: 'dist',
            DIALECT: 2,
            RETURN: ['data', 'dist'],
        });

        return Array.from(results.documents, res => String(res.value.data));
    }

    async getStats(): Promise<string> {
        const info = await this.redis.ft.info(this.memoryIndex);
        return JSON.stringify(info, null, 2);
    }

    async clear() {
        await this.dropIndex();
        await this.createIndex();
    }

    private async dropIndex() {
        await this.redis.ft.dropIndex(this.memoryIndex, { DD: true });
        console.info(`dropped redis index ${this.memoryIndex}.`);
    }

    private async createIndex() {
        try {
            await this.redis.ft.create(
                this.memoryIndex,
                {
                    data: {
                        type: SchemaFieldTypes.TEXT,
                    },
                    embedding: {
                        type: SchemaFieldTypes.VECTOR,
                        ALGORITHM: VectorAlgorithms.HNSW,
                        TYPE: 'FLOAT32',
                        DIM: this.embeddingModel.dimension,
                        DISTANCE_METRIC: 'COSINE',
                    },
                },
                {
                    ON: 'HASH',
                    PREFIX: this.searchPrefix,
                }
            );
            console.info(`created redis index ${this.memoryIndex}.`);
        } catch (error) {
            // there is still no command to check if an index already exists :/
            // see https://github.com/RediSearch/RediSearch/issues/1656
            console.warn(error);
        }
    }
}
