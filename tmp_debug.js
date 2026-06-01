const cloneDeep = require('lodash.clonedeep')

function filterTreeByKeyword(nodes, keyword) {
  if (!Array.isArray(nodes)) return []
  const trimmed = typeof keyword === 'string' ? keyword.trim() : ''
  if (!trimmed) return cloneDeep(nodes)
  const needle = trimmed.toLowerCase()
  const isMatch = (node) => {
    const partNumber = node.partNumber != null ? String(node.partNumber).trim().toLowerCase() : ''
    const name = node.name != null ? String(node.name).trim().toLowerCase() : ''
    return partNumber.includes(needle) || name.includes(needle)
  }
  const walk = (arr) => {
    const result = []
    arr.forEach(node => {
      const filteredChildren = node.children && node.children.length ? walk(node.children) : []
      if (isMatch(node) || filteredChildren.length) {
        const cloned = cloneDeep(node)
        if (node.children !== undefined) {
          cloned.children = filteredChildren
        }
        result.push(cloned)
      }
    })
    return result
  }
  return walk(nodes)
}

const mockData = [{id:'root',partNumber:'A320',name:'test',viewType:'SBOM',children:[{id:'c1',partNumber:'A320-001',name:'child',viewType:'SBOM',children:[]}]}]

// Test 1: empty keyword
const filtered1 = filterTreeByKeyword(mockData, '')
console.log('Test1 - empty keyword, length:', filtered1.length, 'isEmpty:', !filtered1.length)

// Test 2: null/undefined publishedTreeData
const filtered2 = filterTreeByKeyword(null, '')
console.log('Test2 - null nodes, length:', filtered2.length, 'isEmpty:', !filtered2.length)

// Test 3: empty array publishedTreeData
const filtered3 = filterTreeByKeyword([], '')
console.log('Test3 - empty array, length:', filtered3.length, 'isEmpty:', !filtered3.length)

// Test 4: mergedTreeData when publishedTreeData is []
const publishedTreeData = []
const mergedTreeData = Array.isArray(publishedTreeData) ? publishedTreeData : []
const filtered4 = filterTreeByKeyword(mergedTreeData, '')
console.log('Test4 - publishedTreeData=[], mergedTreeData=[], isEmpty:', !filtered4.length)
