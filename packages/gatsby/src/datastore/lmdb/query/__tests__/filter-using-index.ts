import {
  createDbQueriesFromObject,
  getFilterStatement,
} from "../../../common/query"
import {
  getIndexRanges,
  BinaryInfinityPositive,
  BinaryInfinityNegative,
} from "../filter-using-index"
import { undefinedSymbol } from "../create-index"

const undefinedNextEdge = [undefinedSymbol, BinaryInfinityPositive]

describe(`getIndexRangeQueries`, () => {
  describe(`Ranges on a single field`, () => {
    // Each row is:
    // [filter, expected ranges, expected used predicates]
    // if expected used predicates not set - expecting the first from filter
    test.each([
      [{ $eq: 1 }, [{ start: [1], end: [[1, BinaryInfinityPositive]] }]],
      [{ $eq: -1 }, [{ start: [-1], end: [[-1, BinaryInfinityPositive]] }]],
      [
        { $in: [1, 2] },
        [
          { start: [1], end: [[1, BinaryInfinityPositive]] },
          { start: [2], end: [[2, BinaryInfinityPositive]] },
        ],
      ],
      [
        // Order of values for $in predicate is irrelevant
        // (it must be sorted the same way as the corresponding index field)
        { $in: [2, 1] },
        [
          { start: [1], end: [[1, BinaryInfinityPositive]] },
          { start: [2], end: [[2, BinaryInfinityPositive]] },
        ],
      ],
      [{ $lt: 2 }, [{ start: [undefinedNextEdge], end: [2] }]],
      [
        { $lte: 3 },
        [
          {
            start: [undefinedNextEdge],
            end: [[3, BinaryInfinityPositive]],
          },
        ],
      ],
      [
        { $gt: 4 },
        [
          {
            start: [[4, BinaryInfinityPositive]],
            end: [BinaryInfinityPositive],
          },
        ],
      ],
      [{ $gte: 5 }, [{ start: [5], end: [BinaryInfinityPositive] }]],
      [
        { $gt: 6, $lte: 10 },
        [
          {
            start: [[6, BinaryInfinityPositive]],
            end: [[10, BinaryInfinityPositive]],
          },
        ],
        [`$gt`, `$lte`],
      ],
      [
        { $gt: 6, $lt: 10 },
        [{ start: [[6, BinaryInfinityPositive]], end: [10] }],
        [`$gt`, `$lt`],
      ],
      [
        { $gte: 6, $lte: 10 },
        [{ start: [6], end: [[10, BinaryInfinityPositive]] }],
        [`$gte`, `$lte`],
      ],
      [{ $gte: 6, $lt: 10 }, [{ start: [6], end: [10] }], [`$gte`, `$lt`]],
      [
        { $eq: 1, $lte: 10, $gte: 6 },
        [{ start: [1], end: [[1, BinaryInfinityPositive]] }],
        [`$eq`],
      ],
      // Nulls hackery
      // $eq: null in gatsby must also include undefined!
      [
        { $eq: null },
        [
          {
            start: [null],
            end: [[null, BinaryInfinityPositive]],
          },
          {
            start: [undefinedSymbol],
            end: [[undefinedSymbol, BinaryInfinityPositive]],
          },
        ],
      ],
      [
        { $in: [null, null] },
        [
          {
            start: [null],
            end: [[null, BinaryInfinityPositive]],
          },
          {
            start: [undefinedSymbol],
            end: [[undefinedSymbol, BinaryInfinityPositive]],
          },
        ],
      ],
      [
        // Essentially no-op
        { $gt: null },
        [
          {
            start: [[null, BinaryInfinityPositive]],
            end: [[null, BinaryInfinityPositive]],
          },
        ],
      ],
      [
        { $lt: null },
        [
          {
            start: [BinaryInfinityNegative],
            end: [null],
          },
        ],
      ],
      [
        { $eq: 1, $lte: 10, $gte: 6 },
        [
          {
            start: [1],
            end: [[1, BinaryInfinityPositive]],
          },
        ],
        [`$eq`],
      ],
      [
        { $in: [1, 2], $lte: 10, $gte: 6 },
        [
          {
            start: [1],
            end: [[1, BinaryInfinityPositive]],
          },
          {
            start: [2],
            end: [[2, BinaryInfinityPositive]],
          },
        ],
        [`$in`],
      ],
      [
        // Returns empty result in lmdb
        { $lt: 5, $gt: 5 },
        [
          {
            start: [[5, BinaryInfinityPositive]],
            end: [5],
          },
        ],
        [`$gt`, `$lt`],
      ],
    ])(`%o`, (filter, expectedRange, expectedUsed = []) => {
      const indexFields = new Map([[`field`, 1]])
      const dbQueries = createDbQueriesFromObject({ field: filter })
      const result = getIndexRanges(dbQueries, indexFields)
      expect(result.ranges).toEqual(expectedRange)

      if (expectedUsed.length) {
        const expectedDbQueries = dbQueries.find(q =>
          expectedUsed.includes(getFilterStatement(q).comparator)
        )
        expect(result.usedQueries.size).toEqual(expectedUsed.length)
        expect(result.usedQueries).toContain(expectedDbQueries)
      } else {
        expect(result.usedQueries.size).toEqual(1)
        expect(result.usedQueries).toContain(dbQueries[0])
      }
    })
  })

  describe(`Ranges on two fields`, () => {
    // Each row is:
    // [filters, expected ranges, expected used predicates]
    // if expected used predicates not set - expecting the first from each field filter
    test.each([
      [
        { foo: { $eq: 1 }, bar: { $eq: `bar` } },
        [
          {
            start: [1, `bar`],
            end: [
              [1, BinaryInfinityPositive],
              [`bar`, BinaryInfinityPositive],
            ],
          },
        ],
      ],
      // TODO: actual range intersection
      //  (ATM we will return a subset and then additionally apply remaining filters outside of the index scan)
      [
        { foo: { $eq: 1, $gt: 2 }, bar: { $in: [`bar`, `baz`], $lt: `foo` } },
        [
          {
            start: [1, `bar`],
            end: [
              [1, BinaryInfinityPositive],
              [`bar`, BinaryInfinityPositive],
            ],
          },
          {
            start: [1, `baz`],
            end: [
              [1, BinaryInfinityPositive],
              [`baz`, BinaryInfinityPositive],
            ],
          },
        ],
        { foo: [`$eq`], bar: [`$in`] },
      ],
    ])(
      `%o`,
      (filters, expectedRange, expectedUsed: any = { foo: [], bar: [] }) => {
        const indexFields = new Map([
          [`foo`, 1],
          [`bar`, 1],
        ])
        const dbQueries = createDbQueriesFromObject(filters)
        const result = getIndexRanges(dbQueries, indexFields)
        expect(result.ranges).toEqual(expectedRange)

        if (expectedUsed.foo.length) {
          const expectedDbQuery1 = dbQueries.find(q =>
            expectedUsed.foo.includes(getFilterStatement(q).comparator)
          )
          const expectedDbQuery2 = dbQueries.find(q =>
            expectedUsed.bar.includes(getFilterStatement(q).comparator)
          )
          expect(result.usedQueries.size).toEqual(
            expectedUsed.foo.length + expectedUsed.bar.length
          )
          expect(result.usedQueries).toContain(expectedDbQuery1)
          expect(result.usedQueries).toContain(expectedDbQuery2)
        } else {
          expect(result.usedQueries.size).toEqual(2)
          expect(result.usedQueries).toContain(dbQueries[0])
          expect(result.usedQueries).toContain(dbQueries[1])
        }
      }
    )
  })
})