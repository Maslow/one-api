const assert = require('assert')
const { Entry, MongoAccessor, ActionType } = require('../../dist')
const { dbconfig } = require('./_db')

const TEST_DATA = [
  { type: 'a', title: 'title-1', content: 'content-1' },
  { type: 'a', title: 'title-2', content: 'content-2' },
  { type: 'b', title: 'title-3', content: 'content-3' }
]

describe('Database count', function () {
  this.timeout(10000)

  const accessor = new MongoAccessor(dbconfig.dbName, dbconfig.url, dbconfig.connSettings)
  let entry = new Entry(accessor)
  let coll = null

  before(async () => {
    await entry.init()

    // insert data
    coll = accessor.db.collection('test_count')
    await coll.deleteMany({})
    const r = await coll.insertMany(TEST_DATA)
    assert.equal(r.insertedCount, TEST_DATA.length)
  })

  it('count all without query should be ok', async () => {
    let params = {
      collection: 'test_count',
      action: ActionType.COUNT
    }
    const result = await entry.execute(params)
    assert.ok(result)
    assert.equal(result.count, TEST_DATA.length)
  })

  it('count with query should be ok', async () => {
    let params = {
      collection: 'test_count',
      action: ActionType.COUNT,
      query: { type: 'a' }
    }
    let result = await entry.execute(params)
    assert.ok(result)
    assert.equal(result.count, 2)

    params.query.type = 'b'
    result = await entry.execute(params)
    assert.ok(result)
    assert.equal(result.count, 1)

    params.query = { $or: [{type: 'a'}, {type: 'b'}]}
    result = await entry.execute(params)
    assert.ok(result)
    assert.equal(result.count, 3)

    params.query.type = 'invalid_type'
    result = await entry.execute(params)
    assert.ok(result)
    assert.equal(result.count, 0)
  })

  after(async () => {
    await coll.deleteMany({})
    if (entry) accessor.conn.close()
  })
})
