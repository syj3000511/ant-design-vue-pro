import fc from 'fast-check'
import { replaceNode, findNodeById } from '@/components/BomEditor/treeUtils'

/**
 * tests/unit/undoIdempotency.spec.js
 *
 * 设计文档 Property 4「撤销操作幂等性」的属性测试。
 *
 * 撤销成功路径(R9.4)中,BOM 编辑器以服务端返回的「恢复后的节点」
 * 调用纯函数 `replaceNode(nodes, restoredNode)` 更新编辑区树。
 * 该属性要求:对任意有效撤销(恢复节点的 id 在编辑区树中存在),
 * 「应用恢复节点一次」与「应用恢复节点两次」必须得到完全相同的编辑区树,
 * 即 `replaceNode` 关于同一个恢复节点是幂等的:
 *
 *   replaceNode(tree, restored)
 *     deep-equals
 *   replaceNode(replaceNode(tree, restored), restored)
 *
 * 测试库:fast-check(JS 生态标准 PBT 库)。
 */

/* ------------------------------------------------------------------ *
 * 测试辅助:生成器与树遍历(与 treeUtils.spec.js 同源,保持一致)
 * ------------------------------------------------------------------ */

/**
 * 为森林(根节点数组)按深度优先顺序分配全局唯一 id,不修改入参。
 */
function assignUniqueIds (forest) {
  let counter = 0
  const walk = (nodes) => nodes.map(node => {
    const next = { ...node, id: `node-${counter++}` }
    if (Array.isArray(node.children)) {
      next.children = walk(node.children)
    }
    return next
  })
  return walk(forest)
}

/**
 * 构建 id -> parentId 的映射(根节点的 parentId 为 null)。
 */
function buildParentMap (forest) {
  const map = new Map()
  const walk = (nodes, parentId) => {
    nodes.forEach(node => {
      map.set(node.id, parentId)
      if (Array.isArray(node.children) && node.children.length) {
        walk(node.children, node.id)
      }
    })
  }
  walk(forest, null)
  return map
}

/**
 * 收集森林中全部节点 id。
 */
function collectAllIds (forest) {
  return Array.from(buildParentMap(forest).keys())
}

/**
 * 随机森林生成器:每个节点带 partNumber / name / quantity / rowState 等业务字段,
 * children 为递归子树。maxDepth 限制递归深度;id 在 map 阶段统一分配以保证唯一。
 */
const forestArb = (() => {
  const { tree } = fc.letrec((tie) => ({
    tree: fc.record({
      partNumber: fc.string(),
      name: fc.string(),
      quantity: fc.integer({ min: 0, max: 9999 }),
      effectivity: fc.string(),
      rowState: fc.constantFrom('Added', 'Modified', 'Deleted', 'Unchanged'),
      children: fc.oneof(
        { maxDepth: 4, depthIdentifier: 'bom-tree' },
        fc.constant([]),
        fc.array(tie('tree'), { minLength: 1, maxLength: 3 })
      )
    })
  }))
  return fc.array(tree, { minLength: 1, maxLength: 3 }).map(assignUniqueIds)
})()

/**
 * 生成一棵小型「全新子树」,用作恢复节点携带的新 children。
 * id 以 `restored-` 前缀标识,使其与原树 id 区分。
 */
const freshChildrenArb = fc.array(
  fc.record({
    partNumber: fc.string(),
    name: fc.string(),
    quantity: fc.integer({ min: 0, max: 9999 }),
    children: fc.constant([])
  }),
  { maxLength: 3 }
).map(arr => arr.map((n, i) => ({ ...n, id: `restored-child-${i}` })))

/**
 * 针对某个已存在的 targetId,构造「恢复后的节点」生成器。
 *
 * - id 固定为 targetId(保证恢复节点定位到树中已存在的节点 —— 即「有效撤销」)
 * - 其余字段(partNumber / name / quantity / effectivity / rowState)为可选,
 *   覆盖「仅修改部分字段」的恢复场景
 * - children 为可选:
 *     * 省略 children 键   -> replaceNode 保留原节点 children
 *     * 提供全新 children   -> replaceNode 用新 children 覆盖
 *   两种分支都应满足幂等性
 */
const restoredNodeArbFor = (targetId) => fc.record(
  {
    id: fc.constant(targetId),
    partNumber: fc.string(),
    name: fc.string(),
    quantity: fc.integer({ min: 0, max: 9999 }),
    effectivity: fc.string(),
    rowState: fc.constantFrom('Added', 'Modified', 'Deleted', 'Unchanged'),
    children: freshChildrenArb
  },
  { requiredKeys: ['id'] }
)

/**
 * 组合出 { forest, targetId, restored } 撤销场景:
 * 在随机森林中挑选一个已存在节点 id 作为恢复目标,并据此生成恢复节点。
 */
const undoScenarioArb = forestArb.chain((forest) => {
  const ids = collectAllIds(forest)
  return fc.constantFrom(...ids).chain((targetId) =>
    fc.record({
      forest: fc.constant(forest),
      targetId: fc.constant(targetId),
      restored: restoredNodeArbFor(targetId)
    })
  )
})

/* ------------------------------------------------------------------ *
 * Property 4: 撤销操作幂等性
 * **Validates: Requirements 9.4**
 *
 * 对任意编辑区树与任意有效恢复节点(其 id 在树中存在),
 * 应用 replaceNode 一次与两次必须得到相同的编辑区树。
 * 同时 replaceNode 为纯函数,不得修改其输入(树与恢复节点)。
 * ------------------------------------------------------------------ */
describe('treeUtils - Property 4: 撤销操作幂等性', () => {
  it('对任意有效恢复节点,应用 replaceNode 一次与两次得到相同的编辑区树 (Validates: Requirements 9.4)', () => {
    fc.assert(
      fc.property(undoScenarioArb, ({ forest, targetId, restored }) => {
        const forestBefore = JSON.stringify(forest)
        const restoredBefore = JSON.stringify(restored)

        const once = replaceNode(forest, restored)
        const twice = replaceNode(once, restored)

        // 核心幂等性:一次与两次结果深度相等
        expect(twice).toEqual(once)

        // 恢复节点确实被应用(目标节点存在,且 id 不变)
        const applied = findNodeById(once, targetId)
        expect(applied).not.toBeNull()
        expect(applied.id).toBe(targetId)

        // 纯函数:不修改输入的树与恢复节点
        expect(JSON.stringify(forest)).toBe(forestBefore)
        expect(JSON.stringify(restored)).toBe(restoredBefore)
      }),
      { numRuns: 300 }
    )
  })

  it('恢复节点 id 不在树中(无效目标)时 replaceNode 同样幂等且为无操作', () => {
    fc.assert(
      fc.property(
        forestArb,
        fc.integer({ min: 0, max: 99999 }),
        (forest, n) => {
          const restored = { id: `missing-${n}`, name: 'x', partNumber: 'p' }
          const once = replaceNode(forest, restored)
          const twice = replaceNode(once, restored)

          // 幂等
          expect(twice).toEqual(once)
          // 目标不存在 -> 内容与原树一致(仅深拷贝)
          expect(once).toEqual(forest)
        }
      ),
      { numRuns: 200 }
    )
  })
})

/* ------------------------------------------------------------------ *
 * 示例 / EXAMPLE 单元测试:固定场景下的幂等性与不可变性
 * ------------------------------------------------------------------ */
describe('treeUtils - replaceNode 幂等性示例', () => {
  const buildSampleTree = () => [
    {
      id: 'root',
      partNumber: 'A320-00001',
      name: '飞机主结构',
      quantity: 1,
      rowState: 'Unchanged',
      children: [
        {
          id: 'left',
          partNumber: 'A320-10001',
          name: '驾驶舱',
          quantity: 1,
          rowState: 'Modified',
          children: [
            { id: 'left-child', partNumber: 'A320-11001', name: '仪表盘', quantity: 2, rowState: 'Added', children: [] }
          ]
        }
      ]
    }
  ]

  it('恢复节点省略 children 键时保留原 children,且幂等', () => {
    const tree = buildSampleTree()
    const restored = { id: 'left', partNumber: 'A320-10001', name: '驾驶舱(已撤销)', quantity: 1, rowState: 'Unchanged' }

    const once = replaceNode(tree, restored)
    const twice = replaceNode(once, restored)

    // 原 children 被保留
    expect(findNodeById(once, 'left-child')).not.toBeNull()
    // 字段被更新
    expect(findNodeById(once, 'left').name).toBe('驾驶舱(已撤销)')
    // 幂等
    expect(twice).toEqual(once)
  })

  it('恢复节点携带全新 children 时覆盖原 children,且幂等', () => {
    const tree = buildSampleTree()
    const restored = {
      id: 'left',
      partNumber: 'A320-10001',
      name: '驾驶舱',
      quantity: 1,
      rowState: 'Unchanged',
      children: [
        { id: 'new-child', partNumber: 'A320-19999', name: '新子件', quantity: 5, rowState: 'Added', children: [] }
      ]
    }

    const once = replaceNode(tree, restored)
    const twice = replaceNode(once, restored)

    // 新 children 覆盖,旧子节点不再存在
    expect(findNodeById(once, 'new-child')).not.toBeNull()
    expect(findNodeById(once, 'left-child')).toBeNull()
    // 幂等
    expect(twice).toEqual(once)
  })

  it('replaceNode 不修改输入树(不可变)', () => {
    const tree = buildSampleTree()
    const snapshot = JSON.stringify(tree)
    replaceNode(tree, { id: 'left', name: '改动' })
    expect(JSON.stringify(tree)).toBe(snapshot)
  })
})
