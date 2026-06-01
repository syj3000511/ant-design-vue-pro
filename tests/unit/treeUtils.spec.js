import fc from 'fast-check'
import { extractSubtreeById, filterTreeByKeyword, resolveLinkedTree } from '@/components/BomEditor/treeUtils'

/**
 * tests/unit/treeUtils.spec.js
 *
 * 本文件承载 BOM 树工具纯函数的属性测试基础设施。
 * 当前实现:
 *   - 设计文档 Property 3「子树过滤层级保持」(extractSubtreeById)
 *   - 设计文档 Property 1「导航联动 viewType 匹配」(resolveLinkedTree)
 *   - filterTreeByKeyword 单元测试
 *
 * 测试库:fast-check(JS 生态标准 PBT 库)。
 */

/* ------------------------------------------------------------------ *
 * 测试辅助:生成器与不变量计算
 * ------------------------------------------------------------------ */

/**
 * 为森林(根节点数组)按深度优先顺序分配全局唯一 id,不修改入参。
 * @param {Array} forest 不含 id 的节点数组
 * @returns {Array} 含唯一 id 的新森林
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
 * @param {Array} forest
 * @returns {Map<string, string|null>}
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
 * @param {Array} forest
 * @returns {string[]}
 */
function collectAllIds (forest) {
  return Array.from(buildParentMap(forest).keys())
}

/**
 * 随机森林生成器:每个节点带 partNumber / name 业务字段,children 为递归子树。
 * 通过 maxDepth 限制递归深度,避免生成过大结构;id 在 map 阶段统一分配以保证唯一。
 */
const forestArb = (() => {
  const { tree } = fc.letrec((tie) => ({
    tree: fc.record({
      partNumber: fc.string(),
      name: fc.string(),
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
 * 在随机森林之上,再随机挑选一个已存在节点 id。
 */
const forestWithTargetArb = forestArb.chain((forest) => {
  const ids = collectAllIds(forest)
  return fc.record({
    forest: fc.constant(forest),
    targetId: fc.constantFrom(...ids)
  })
})

/* ------------------------------------------------------------------ *
 * Property 3: 子树过滤层级保持
 * **Validates: Requirements 3.9**
 *
 * 对任意树与任意已存在节点,extractSubtreeById 提取的子树中,
 * 除子树根以外的每个节点,其父节点(在子树内)与过滤前(原树内)保持一致。
 * ------------------------------------------------------------------ */
describe('treeUtils - Property 3: 子树过滤层级保持', () => {
  it('extractSubtreeById 提取的子树保持原有父子层级关系不变 (Validates: Requirements 3.9)', () => {
    fc.assert(
      fc.property(forestWithTargetArb, ({ forest, targetId }) => {
        const subtree = extractSubtreeById(forest, targetId)

        // 目标 id 来自已存在节点,提取结果不应为 null,且根 id 即为 targetId
        expect(subtree).not.toBeNull()
        expect(subtree.id).toBe(targetId)

        const originalParents = buildParentMap(forest)
        const subtreeParents = buildParentMap([subtree])

        // 子树内每个节点(根除外)的父节点必须与原树中一致
        subtreeParents.forEach((parentId, nodeId) => {
          if (nodeId === targetId) {
            // 子树根:在子树内无父节点
            expect(parentId).toBeNull()
            return
          }
          expect(parentId).toBe(originalParents.get(nodeId))
        })
      }),
      { numRuns: 500 }
    )
  })

  it('对每个可能的根节点,子树根的所有后代集合与原树中该节点的后代集合一致', () => {
    fc.assert(
      fc.property(forestWithTargetArb, ({ forest, targetId }) => {
        const subtree = extractSubtreeById(forest, targetId)
        const subtreeIds = new Set(collectAllIds([subtree]))

        // 原树中以 targetId 为根的后代集合(含自身)
        const originalParents = buildParentMap(forest)
        const expectedIds = new Set([targetId])
        let changed = true
        while (changed) {
          changed = false
          originalParents.forEach((parentId, nodeId) => {
            if (parentId !== null && expectedIds.has(parentId) && !expectedIds.has(nodeId)) {
              expectedIds.add(nodeId)
              changed = true
            }
          })
        }

        expect(subtreeIds).toEqual(expectedIds)
      }),
      { numRuns: 500 }
    )
  })
})

/* ------------------------------------------------------------------ *
 * filterTreeByKeyword 单元测试(示例 / EXAMPLE)
 *
 * 覆盖:
 *  - 子串匹配且大小写不敏感(Requirements 2.1, 2.5)
 *  - 保留匹配节点的各级祖先并维持父子层级(Requirements 2.1)
 *  - 空 / 纯空白关键字恢复完整树(Requirements 2.6)
 *  - 无任何匹配时返回空数组(Requirements 2.1)
 * ------------------------------------------------------------------ */
describe('treeUtils - filterTreeByKeyword', () => {
  /**
   * 构造一棵稳定的样例树用于断言:
   *
   * root (A320-00001 / 飞机主结构)
   *  ├─ left (A320-10001 / 驾驶舱)
   *  │   └─ leftChild (A320-11001 / 仪表盘 Display Unit)
   *  └─ right (A320-20001 / 机翼)
   *      └─ rightChild (A320-21001 / 副翼)
   */
  const buildSampleTree = () => [
    {
      id: 'root',
      partNumber: 'A320-00001',
      name: '飞机主结构',
      children: [
        {
          id: 'left',
          partNumber: 'A320-10001',
          name: '驾驶舱',
          children: [
            {
              id: 'left-child',
              partNumber: 'A320-11001',
              name: '仪表盘 Display Unit',
              children: []
            }
          ]
        },
        {
          id: 'right',
          partNumber: 'A320-20001',
          name: '机翼',
          children: [
            {
              id: 'right-child',
              partNumber: 'A320-21001',
              name: '副翼',
              children: []
            }
          ]
        }
      ]
    }
  ]

  // 收集森林中的全部节点 id(辅助断言)
  const idsOf = (forest) => collectAllIds(forest).sort()

  it('对件号做子串匹配,保留匹配节点及其各级祖先 (Validates: Requirements 2.1)', () => {
    const tree = buildSampleTree()
    const result = filterTreeByKeyword(tree, '11001')

    // 命中 left-child(件号含 11001),应保留其祖先 root → left,剪掉 right 分支
    expect(idsOf(result)).toEqual(['left', 'left-child', 'root'])

    // 父子层级保持不变
    const parents = buildParentMap(result)
    expect(parents.get('root')).toBeNull()
    expect(parents.get('left')).toBe('root')
    expect(parents.get('left-child')).toBe('left')
  })

  it('对名称做子串匹配 (Validates: Requirements 2.1)', () => {
    const tree = buildSampleTree()
    const result = filterTreeByKeyword(tree, '副翼')

    expect(idsOf(result)).toEqual(['right', 'right-child', 'root'])
    const parents = buildParentMap(result)
    expect(parents.get('right-child')).toBe('right')
    expect(parents.get('right')).toBe('root')
  })

  it('匹配为大小写不敏感 (Validates: Requirements 2.5)', () => {
    const tree = buildSampleTree()
    const lower = filterTreeByKeyword(tree, 'display unit')
    const upper = filterTreeByKeyword(tree, 'DISPLAY UNIT')
    const mixed = filterTreeByKeyword(tree, 'DiSpLaY')

    const expectedIds = ['left', 'left-child', 'root']
    expect(idsOf(lower)).toEqual(expectedIds)
    expect(idsOf(upper)).toEqual(expectedIds)
    expect(idsOf(mixed)).toEqual(expectedIds)
  })

  it('匹配前对节点件号 / 名称去除首尾空白 (Validates: Requirements 2.5)', () => {
    const tree = [
      {
        id: 'root',
        partNumber: '  PN-001  ',
        name: '  带空白的名称  ',
        children: []
      }
    ]
    // 关键字与去空白后的件号子串一致
    expect(idsOf(filterTreeByKeyword(tree, 'PN-001'))).toEqual(['root'])
    // 关键字与去空白后的名称子串一致
    expect(idsOf(filterTreeByKeyword(tree, '带空白'))).toEqual(['root'])
  })

  it('一个分支命中多个节点时保留整条祖先链', () => {
    const tree = buildSampleTree()
    // A320 为所有节点件号公共前缀,应保留整棵树
    const result = filterTreeByKeyword(tree, 'A320')
    expect(idsOf(result)).toEqual(
      ['left', 'left-child', 'right', 'right-child', 'root']
    )
  })

  it('空字符串关键字恢复完整树 (Validates: Requirements 2.6)', () => {
    const tree = buildSampleTree()
    const result = filterTreeByKeyword(tree, '')
    expect(idsOf(result)).toEqual(idsOf(tree))
  })

  it('纯空白关键字恢复完整树 (Validates: Requirements 2.6)', () => {
    const tree = buildSampleTree()
    const result = filterTreeByKeyword(tree, '   \t \n ')
    expect(idsOf(result)).toEqual(idsOf(tree))
  })

  it('恢复完整树时返回深拷贝,不修改入参 (Validates: Requirements 2.6)', () => {
    const tree = buildSampleTree()
    const result = filterTreeByKeyword(tree, '')

    // 内容相等但引用不同(深拷贝)
    expect(result).toEqual(tree)
    expect(result).not.toBe(tree)
    expect(result[0]).not.toBe(tree[0])

    // 修改结果不应影响入参
    result[0].name = '已修改'
    expect(tree[0].name).toBe('飞机主结构')
  })

  it('无任何匹配时返回空数组 (Validates: Requirements 2.1)', () => {
    const tree = buildSampleTree()
    const result = filterTreeByKeyword(tree, '不存在的关键字-zzz')
    expect(result).toEqual([])
  })

  it('过滤不修改原始入参树', () => {
    const tree = buildSampleTree()
    const before = JSON.stringify(tree)
    filterTreeByKeyword(tree, '11001')
    expect(JSON.stringify(tree)).toBe(before)
  })

  it('入参非数组时返回空数组', () => {
    expect(filterTreeByKeyword(null, 'x')).toEqual([])
    expect(filterTreeByKeyword(undefined, 'x')).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * Property 1: 导航联动 viewType 匹配
 * **Validates: Requirements 3.2, 3.3, 3.4**
 *
 * 对任意森林、任意 treeViewType 与任意 navNode(携带 id 与 viewType),
 * resolveLinkedTree 仅在「viewType 一致 且 节点在树中存在」时返回子树数组
 * (单元素数组,其根 id 即 navNode.id),否则一律返回 null(保持不变):
 *   - viewType 不一致               → null
 *   - viewType 一致但节点不存在      → null
 *   - viewType 一致且节点存在        → [subtree]
 * 且该函数为纯函数,不得修改入参。
 * ------------------------------------------------------------------ */
describe('treeUtils - Property 1: 导航联动 viewType 匹配', () => {
  // 一组候选 viewType:treeViewType 与 navNode.viewType 同源抽取,
  // 使「一致 / 不一致」两种情形都能被充分覆盖(约 1/4 概率一致)。
  const viewTypeArb = fc.constantFrom('EBOM', 'SBOM', 'PBOM', 'CBOM')

  // 在随机森林之上,组合出 { forest, treeViewType, navNode } 场景。
  // navNode.id 既可能命中已存在节点,也可能是保证不存在的 `missing-*` id,
  // 从而覆盖「节点存在 / 不存在」两种分支。
  const linkedScenarioArb = forestArb.chain((forest) => {
    const ids = collectAllIds(forest)
    return fc.record({
      forest: fc.constant(forest),
      treeViewType: viewTypeArb,
      navNode: fc.record({
        id: fc.oneof(
          fc.constantFrom(...ids),
          fc.integer({ min: 0, max: 99999 }).map(n => `missing-${n}`)
        ),
        viewType: viewTypeArb
      })
    })
  })

  it('仅在 viewType 一致且节点存在时返回子树,否则返回 null (Validates: Requirements 3.2, 3.3, 3.4)', () => {
    fc.assert(
      fc.property(linkedScenarioArb, ({ forest, treeViewType, navNode }) => {
        const before = JSON.stringify(forest)
        const result = resolveLinkedTree(forest, treeViewType, navNode)

        const exists = collectAllIds(forest).includes(navNode.id)
        const viewTypeMatch = treeViewType === navNode.viewType

        if (viewTypeMatch && exists) {
          // 命中:返回以被点击节点为根的子树(包裹为单元素数组)
          expect(Array.isArray(result)).toBe(true)
          expect(result).toHaveLength(1)
          expect(result[0].id).toBe(navNode.id)
          // 子树内容与 extractSubtreeById 提取的子树一致
          expect(result[0]).toEqual(extractSubtreeById(forest, navNode.id))
        } else {
          // 未命中(类型不一致或节点不存在):保持不变,返回 null
          expect(result).toBeNull()
        }

        // 纯函数:不修改入参
        expect(JSON.stringify(forest)).toBe(before)
      }),
      { numRuns: 500 }
    )
  })

  it('navNode 为 null / undefined 时返回 null (Validates: Requirements 3.4)', () => {
    fc.assert(
      fc.property(forestArb, viewTypeArb, (forest, treeViewType) => {
        expect(resolveLinkedTree(forest, treeViewType, null)).toBeNull()
        expect(resolveLinkedTree(forest, treeViewType, undefined)).toBeNull()
      }),
      { numRuns: 100 }
    )
  })
})
