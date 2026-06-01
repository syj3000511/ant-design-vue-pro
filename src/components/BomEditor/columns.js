/**
 * 双树列定义。左右两侧共用相同的列宽配置以保证视觉对齐（设计文档 3.2）。
 */
export const commonColumns = [
  { title: '件号', dataIndex: 'partNumber', key: 'partNumber', width: 200 },
  { title: '名称', dataIndex: 'name', key: 'name', width: 220 },
  { title: '父件号', dataIndex: 'parentPartNumber', key: 'parentPartNumber', width: 160 },
  { title: '单装数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '架次有效性', dataIndex: 'effectivity', key: 'effectivity', width: 150 }
]

/**
 * 右侧编辑区在公共列基础上追加「操作」列（scopedSlots 渲染下拉菜单）。
 */
export const targetColumns = [
  ...commonColumns,
  {
    title: '操作',
    key: 'operation',
    width: 110,
    fixed: 'right',
    scopedSlots: { customRender: 'operation' }
  }
]

/**
 * 单元格单行省略样式：不换行、超出列宽以省略号截断、无单元格内横向滚动。
 * 单行 + 不换行 => 行高不随内容长度或是否截断而变化，保证行内各列与「操作」列等高（R6.1~R6.4）。
 */
const ELLIPSIS_CELL_STYLE = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}

/**
 * 为「数据列」（不含 key='operation' 的操作列）追加单行省略能力。
 *
 * 设计取舍：
 * - 不修改原列对象（commonColumns / targetColumns 被左右两树共用），用浅拷贝生成新列，避免污染。
 * - 不使用 a-table 内置 `ellipsis: true`：1.7.8 中它会对所有字符串单元格无条件设置原生 title，
 *   违反 R6.6（未截断不得提示）。改用 customCell 内联样式 + mouseenter 时按需设置 title。
 * @param {Array} columns 源列定义
 * @param {(event: Event, fullText: string) => void} onCellMouseenter 鼠标进入单元格回调（按需显示 title）
 * @returns {Array} 追加省略能力后的新列定义
 */
export function buildEllipsisColumns (columns, onCellMouseenter) {
  return columns.map((col) => {
    if (col.key === 'operation') return col
    const dataIndex = col.dataIndex
    return {
      ...col,
      customCell: (record) => ({
        style: ELLIPSIS_CELL_STYLE,
        on: {
          mouseenter: (event) => onCellMouseenter(event, record ? record[dataIndex] : '')
        }
      })
    }
  })
}

/**
 * R6.5 / R6.6：仅当单元格文本被省略号截断时，才以原生 title 展示完整文本。
 * @param {Event} event
 * @param {*} fullText
 */
export function showTitleWhenTruncated (event, fullText) {
  const el = event && event.currentTarget
  if (!el) return
  if (el.scrollWidth > el.clientWidth) {
    el.setAttribute('title', fullText == null ? '' : String(fullText))
  } else {
    el.removeAttribute('title')
  }
}

// 两树横向滚动基准宽度（列宽之和），用于固定列宽、保证两表公共列左右对齐。
export const SOURCE_TABLE_WIDTH = commonColumns.reduce((sum, c) => sum + (c.width || 0), 0)
export const TARGET_TABLE_WIDTH = targetColumns.reduce((sum, c) => sum + (c.width || 0), 0)
