const assert = require('assert')
const { Entry } = require('../../src/index')
const { actions } = require('../../src/types')
const { dbconfig } = require('./_db')

const TEST_DATA = [
  { type: 'a', title: 'title-1', content: 'content-1' },
  { type: 'a', title: 'title-2', content: 'content-2' },
  { type: 'b', title: 'title-3', content: 'content-3' }
]

describe('Database count', function () {
  this.timeout(10000)

  let entry = new Entry({ db: dbconfig })

  before(async () => {
    await entry.init()

    // insert data
    const coll = entry.db.collection('test_count')
    await coll.deleteMany({})
    const r = await coll.insertMany(TEST_DATA)
    assert.equal(r.insertedCount, TEST_DATA.length)
  })

  it('count all without query should be ok', async () => {
    let params = {
      collection: 'test_count',
      action: actions.COUNT
    }
    const result = await entry.execute(params)
    assert.ok(result)
    assert.equal(result.count, TEST_DATA.length)
  })

  it('count with query should be ok', async () => {
    let params = {
      collection: 'test_count',
      action: actions.COUNT,
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


  // it('read with query should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: { title: TEST_DATA[0].title }
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, 1)
  //   assert.equal(data.list[0].title, TEST_DATA[0].title)
  // })

  // it('read with order(desc) should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: {},
  //     order: [{ field: 'title', direction: 'desc' }]
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, TEST_DATA.length)
  //   const lastItem = TEST_DATA[TEST_DATA.length - 1]
  //   assert.equal(data.list[0].title, lastItem.title)
  // })

  // it('read with order(asc) should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: {},
  //     order: [{ field: 'title', direction: 'asc' }]
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, TEST_DATA.length)
  //   assert.equal(data.list[0].title, TEST_DATA[0].title)
  // })

  // it('read with offset should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: {},
  //     offset: 1
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, TEST_DATA.length - 1)
  //   assert.equal(data.list[0].title, TEST_DATA[1].title)
  // })

  // it('read with exceed offset should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: {},
  //     offset: 99999
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, 0)
  // })

  // it('read with limit = 0 should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: {},
  //     order: [{ field: 'title', direction: 'asc' }],
  //     limit: 0
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, 3)
  //   assert.equal(data.list[0].title, TEST_DATA[0].title)
  // })

  // it('read with limit should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: {},
  //     limit: 1
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, 1)
  //   assert.equal(data.list[0].title, TEST_DATA[0].title)
  // })

  // it('read with projection should be ok', async () => {
  //   let params = {
  //     collection: 'test_count',
  //     action: actions.READ,
  //     query: {},
  //     projection: { title: 1 }
  //   }
  //   const data = await entry.execute(params)
  //   assert.ok(data.list instanceof Array)
  //   assert.equal(data.list.length, TEST_DATA.length)
  //   assert.ok(data.list[0].title)
  //   assert.ok(data.list[0]._id)
  //   assert.ok(!data.list[0].content)
  // })

  after(async () => {
    const coll = entry.db.collection('test_count')
    await coll.deleteMany({})
    if (entry) entry._accessor._conn.close()
  })
})