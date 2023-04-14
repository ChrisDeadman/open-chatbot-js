import type { RedisClientType } from 'redis';
import { SchemaFieldTypes, VectorAlgorithms, createClient } from 'redis';
import { toFloat32Buffer } from '../utils/conversion_utils.js';
import { MemoryProvider } from './memory_provider.js';

export class RedisMemory extends MemoryProvider {
    private redis: RedisClientType;
    private vectorDim: number;
    private memoryIndex: string;
    private searchPrefix: string;
    private vecNum: number;
    private initComplete: Promise<void>;

    constructor(
        redisHost: string,
        redisPort: number,
        vectorDim: number,
        memoryIndex = 'idx:memory',
        searchPrefix = 'noderedis:knn'
    ) {
        super();
        this.vectorDim = vectorDim;
        this.memoryIndex = memoryIndex;
        this.searchPrefix = searchPrefix;
        this.vecNum = 0;

        this.redis = createClient({
            socket: {
                host: redisHost,
                port: redisPort,
            },
        });

        this.initComplete = this.prepareDatabase();
    }

    private async prepareDatabase() {
        await this.redis.connect();
        await this.createIndex();
    }

    async add(vector: number[], data: string) {
        await this.initComplete;

        if (vector.length != this.vectorDim) {
            throw Error(`vector dimension must be exactly ${this.vectorDim}.`);
        }

        const dataDict = {
            data: data,
            embedding: toFloat32Buffer(vector),
        };

        await this.redis
            .multi()
            .hSet(`${this.searchPrefix}:${this.vecNum}`, dataDict)
            .set(`${this.searchPrefix}-vec_num`, this.vecNum + 1)
            .exec();

        this.vecNum += 1;
    }

    async get(vector: number[], numRelevant = 1): Promise<string[]> {
        await this.initComplete;

        if (vector.length != this.vectorDim) {
            throw Error(`vector dimension must be exactly ${this.vectorDim}.`);
        }

        const baseQuery = `*=>[KNN ${numRelevant} @embedding $vector AS dist]`;
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
        await this.initComplete;
        const info = await this.redis.ft.info(this.memoryIndex);
        return JSON.stringify(info, null, 2);
    }

    async clear() {
        await this.initComplete;
        await this.redis.ft.dropIndex(this.memoryIndex, { DD: true });
        await this.redis.set(`${this.searchPrefix}-vec_num`, 0);
        await this.createIndex();
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
                        DIM: this.vectorDim,
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
        const vecNum = await this.redis.get(`${this.searchPrefix}-vec_num`);
        this.vecNum = vecNum != null ? parseInt(vecNum.toString(), 10) : 0;
    }
}
