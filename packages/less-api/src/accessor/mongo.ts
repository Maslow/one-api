import { AccessorInterface, ReadResult, UpdateResult, AddResult, RemoveResult, CountResult } from "./accessor"
import { Params, ActionType, Order, Direction } from '../types'
import { MongoClient, ObjectID, MongoClientOptions, Db } from 'mongodb'
import { DefaultLogger, LoggerInterface } from "../logger"
import { EventEmitter } from "events"

/**
 * Mongodb Accessor 负责执行 mongodb 数据操作
 * 
 * 连接参数同 mongodb javascript driver，参考以下链接：
 * @see https://mongodb.github.io/node-mongodb-native/3.3/reference/connecting/connection-settings/
 * 
 * 实例化本对象后，须调用 `init()` 待数据库连接成功，方可执行数据操作。
 * ```js
 *  const accessor = new MongoAccessor('dbname', 'mongodb://localhost:27017', {
 *      useNewUrlParser: true,
 *      useUnifiedTopology: true
 *  })
 * 
 *  accessor.init()
 * ```
 * 
 * 可通过 `ready` 属性等待数据库连接就绪，该属性为 `Promise` 对象：
 * ```js
 *  accessor.ready.then(() => { 
 *      // 连接就绪，可进行数据操作
 *  })
 * ```
 */
export class MongoAccessor implements AccessorInterface {

    readonly type: string = 'mongo'

    /**
     * 数据库名
     */
    readonly db_name: string
    readonly conn: MongoClient
    protected _event = new EventEmitter()

    /**
     * `ready` 属性可用于等待数据库连接就绪，该属性为 `Promise` 对象：
     * ```js
     *  accessor.ready.then(() => { 
     *      // 连接就绪，可进行数据操作
     *  })
     * ```
     */
    ready: Promise<MongoClient>

    db: Db

    private _logger: LoggerInterface

    get logger() {
        if (!this._logger) {
            this._logger = new DefaultLogger()
        }
        return this._logger
    }

    setLogger(logger: LoggerInterface) {
        this._logger = logger
    }

    /**
     * @see https://mongodb.github.io/node-mongodb-native/3.3/reference/connecting/connection-settings/
     */
    constructor(db: string, url: string, options?: MongoClientOptions) {
        this.db_name = db
        this.conn = new MongoClient(url, options || {})
        this.db = null
        // 初始化为空 Promise，永远不被 resolved
        this.ready = new Promise(() => { /* nop */ })
    }

    emit(event: string | symbol, ...args: any[]): boolean {
        return this._event.emit(event, ...args)
    }

    once(event: string | symbol, listener: (...args: any[]) => void): void {
        this.once(event, listener)
    }

    removeAllListeners(event?: string | symbol): void {
        this._event.removeAllListeners(event)
    }

    on(event: string | symbol, listener: (...args: any[]) => void): void {
        this._event.on(event, listener)
    }

    off(event: string | symbol, listener: (...args: any[]) => void): void {
        this._event.off(event, listener)
    }

    /**
     * 初始化实例: 执行数据库连接
     * @returns Promise<MongoClient>
     */
    async init() {
        this.logger.info(`mongo accessor connecting...`)
        this.ready = this.conn
            .connect()
            .then(ret => {
                this.logger.info(`mongo accessor connected, db: ` + this.db_name)
                this.db = this.conn.db(this.db_name)
                return ret
            })

        return await this.ready
    }

    /**
     * 关闭连接
     */
    async close() {
        await this.conn.close()
        this.logger.info('mongo connection closed')
    }

    /**
     * 执行数据请求
     * @param params 数据请求参数
     * @returns 
     */
    async execute(params: Params): Promise<ReadResult | UpdateResult | AddResult | RemoveResult | CountResult | never> {
        // 优化 requestId 为空时日志显示
        params.requestId = params.requestId ?? 'internal'

        const { collection, action, query, requestId } = params

        this.logger.info(`[${requestId}] mongo start executing {${collection}}: ` + JSON.stringify(params))

        // 处理 _id 的类型问题
        {
            const q = query ?? {}

            if (typeof q._id === 'string') {
                query._id = new ObjectID(query._id)
                this.logger.debug(`[${requestId}] mongo process _id -> ObjectID: ` + JSON.stringify(params))
            }

            if (q._id && (q._id.$in instanceof Array)) {
                query._id.$in = query._id.$in.map((id: string) => new ObjectID(id))
                this.logger.debug(`[${requestId}] mongo process _id -> ObjectID: ` + JSON.stringify(params))
            }
        }


        if (action === ActionType.READ) {
            return await this.read(collection, params)
        }

        if (action === ActionType.UPDATE) {
            return await this.update(collection, params)
        }

        if (action === ActionType.ADD) {
            return await this.add(collection, params)
        }

        if (action === ActionType.REMOVE) {
            return await this.remove(collection, params)
        }

        if (action === ActionType.COUNT) {
            return await this.count(collection, params)
        }

        const error = new Error(`invalid 'action': ${action}`)
        this.logger.error(`[${requestId}] mongo end of executing occurred error: `, error)
        throw error
    }

    /**
     * 查询单个文档，主要用于 `访问规则` 中的数据查询
     */
    async get(collection: string, query: any): Promise<any> {
        if (query && query._id) {
            query._id = new ObjectID(query._id)
        }
        const coll = this.db.collection(collection)
        return await coll.findOne(query)
    }

    /**
     * 触发查询结果事件
     * @param params 
     * @param data 
     */
    protected emitResult(params: Params, result: any) {
        this.emit('result', { params, result })
    }

    /**
     * 执行查询文档操作
     * @param collection 集合名
     * @param params 请求参数
     * @returns 查询结果
     */
    protected async read(collection: string, params: Params): Promise<ReadResult> {
        const { requestId } = params
        const coll = this.db.collection(collection)

        let { query, order, offset, limit, projection } = params
        query = query || {}
        let options: any = {
            limit: 100,
            skip: 0
        }
        if (order) options.sort = this.processOrder(order)
        if (offset) options.skip = offset
        if (projection) options.projection = projection

        if (limit) {
            options.limit = limit
        }

        this.logger.debug(`[${requestId}] mongo before read {${collection}}: `, { query, options })
        const data = await coll.find(query, options).toArray()
        this.logger.debug(`[${requestId}] mongo end of read {${collection}}: `, { query, options, dataLength: data.length })

        const total = await coll.estimatedDocumentCount(query, {})

        this.emitResult(params, { data, total })
        return { list: data, total, limit: options.limit, offset: options.skip }
    }

    /**
     * 执行更新文档操作
     * @param collection 集合名
     * @param params 请求参数
     * @returns 执行结果
     */
    protected async update(collection: string, params: Params): Promise<UpdateResult> {
        const { requestId } = params
        const coll = this.db.collection(collection)

        let { query, data, multi, upsert, merge } = params

        query = query || {}
        data = data || {}

        let options = {} as any
        if (upsert) options.upsert = upsert

        // merge 不为 true 代表替换操作，暂只允许单条替换
        if (!merge) {
            this.logger.debug(`[${requestId}] mongo before update (replaceOne) {${collection}}: `, { query, data, options, merge, multi })
            const result: any = await coll.replaceOne(query, data, options)
            const _data = {
                upsert_id: result.upsertedId,
                updated: result.modifiedCount,
                matched: result.matchedCount
            }
            this.emitResult(params, _data)
            return _data
        }

        let result: any

        // multi 表示更新一条或多条
        if (!multi) {
            this.logger.debug(`[${requestId}] mongo before update (updateOne) {${collection}}: `, { query, data, options, merge, multi })
            result = await coll.updateOne(query, data, options)
        } else {
            options.upsert = false
            this.logger.debug(`[${requestId}] mongo before update (updateMany) {${collection}}: `, { query, data, options, merge, multi })
            result = await coll.updateMany(query, data, options)
        }

        const ret = {
            upsert_id: result.upsertedId,
            updated: result.modifiedCount,
            matched: result.matchedCount
        }

        this.emitResult(params, ret)
        this.logger.debug(`[${requestId}] mongo end of update {${collection}}: `, { query, data, options, merge, multi, result: ret })
        return ret
    }

    /**
     * 执行添加文档操作
     * @param collection 集合名
     * @param params 请求参数
     * @returns 执行结果
     */
    protected async add(collection: string, params: Params): Promise<AddResult> {
        const { requestId } = params
        const coll = this.db.collection(collection)
        let { data, multi } = params
        data = data || {}
        let result: any

        this.logger.debug(`[${requestId}] mongo before add {${collection}}: `, { data, multi })

        // multi 表示单条或多条添加
        if (!multi) {
            result = await coll.insertOne(data)
        } else {
            data = data instanceof Array ? data : [data]
            result = await coll.insertMany(data)
        }

        const ret = {
            _id: result.insertedIds || result.insertedId,
            insertedCount: result.insertedCount
        }
        this.emitResult(params, ret)
        this.logger.debug(`[${requestId}] mongo end of add {${collection}}: `, { data, multi, result: ret })
        return ret
    }

    /**
     * 执行删除文档操作
     * @param collection 集合名
     * @param params 请求参数
     * @returns 执行结果
     */
    protected async remove(collection: string, params: Params): Promise<RemoveResult> {
        const { requestId } = params
        const coll = this.db.collection(collection)
        let { query, multi } = params
        query = query || {}
        let result: any

        this.logger.debug(`[${requestId}] mongo before remove {${collection}}: `, { query, multi })

        // multi 表示单条或多条删除
        if (!multi) {
            result = await coll.deleteOne(query)
        } else {
            result = await coll.deleteMany(query)
        }

        const ret = {
            deleted: result.deletedCount
        }

        this.emitResult(params, ret)
        this.logger.debug(`[${requestId}] mongo end of remove {${collection}}: `, ret)
        return ret
    }

    /**
     * 执行文档计数操作
     * @param collection 集合名
     * @param params 请求参数
     * @returns 执行结果
     */
    protected async count(collection: string, params: Params): Promise<CountResult> {
        const { requestId } = params
        const coll = this.db.collection(collection)

        const query = params.query || {}
        const options = {}

        this.logger.debug(`[${requestId}] mongo before count {${collection}}: `, { query })
        const result = await coll.countDocuments(query, options)
        this.logger.debug(`[${requestId}] mongo end of count {${collection}}: `, { query, result })

        this.emitResult(params, result)
        return {
            total: result
        }
    }

    /**
     * 将 Order 结构转换为 Mongo 语法
     * @param order 
     * @returns 
     */
    protected processOrder(order: Order[]) {
        if (!(order instanceof Array))
            return undefined

        return order.map(o => {
            const dir = o.direction === Direction.DESC ? -1 : 1
            return [o.field, dir]
        })
    }
}