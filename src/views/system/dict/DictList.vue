<template>
  <page-header-wrapper class="xbom-body-font">
    <a-row :gutter="16">
      <!-- Master: Dictionary List -->
      <a-col :xl="8" :lg="10" :md="24">
        <a-card :bordered="false" class="xbom-glass-card dict-side-card">
          <div class="side-header">
            <span class="header-title">字典分类总览</span>
            <a-button type="primary" ghost size="small" icon="plus" @click="handleAdd">新增类目</a-button>
          </div>

          <div class="side-search">
            <a-input-search
              v-model="queryParam.name"
              placeholder="搜索字典名称/类型"
              @search="loadData"
              enter-button
            />
          </div>

          <a-table
            ref="table"
            size="middle"
            rowKey="id"
            :columns="columns"
            :dataSource="dataSource"
            :pagination="false"
            :loading="loading"
            class="dict-master-table"
            :customRow="masterRowClick"
          >
            <span slot="name" slot-scope="text, record">
              <div class="dict-item-cell" :class="{ 'active': selectedDict.id === record.id }">
                <div class="dict-name">{{ text }}</div>
                <div class="dict-code xbom-tech-font">{{ record.type }}</div>
              </div>
            </span>
            <span slot="action" slot-scope="text, record">
              <a-button type="link" size="small" icon="edit" @click.stop="handleEdit(record)" />
              <a-popconfirm title="确定删除类目？" @confirm.stop="handleDelete(record)">
                <a-button type="link" size="small" icon="delete" class="btn-danger-industrial" />
              </a-popconfirm>
            </span>
          </a-table>
        </a-card>
      </a-col>

      <!-- Detail: Dictionary Items -->
      <a-col :xl="16" :lg="14" :md="24">
        <a-card :bordered="false" class="xbom-glass-card dict-detail-card" v-if="selectedDict.id">
          <div class="detail-header">
            <div class="header-info">
              <span class="header-tag">当前项目:</span>
              <span class="header-val">{{ selectedDict.name }}</span>
              <code class="header-code xbom-tech-font">[{ selectedDict.type }]</code>
            </div>
            <a-button type="primary" icon="plus-circle" @click="handleItemAdd">添加数据项</a-button>
          </div>

          <a-divider style="margin: 12px 0;" />

          <a-table
            :columns="itemColumns"
            :data-source="itemData"
            :pagination="false"
            size="middle"
            rowKey="id"
          >
            <span slot="status" slot-scope="text">
              <a-badge :status="text === 1 ? 'success' : 'default'" :text="text === 1 ? '启用' : '禁用'" />
            </span>
            <span slot="action" slot-scope="text, record">
              <a-button type="link" size="small" @click="handleItemEdit(record)">配置</a-button>
              <a-divider type="vertical" />
              <a-popconfirm title="移除该项？" @confirm="handleItemDelete(record)">
                <a-button type="link" size="small" class="btn-danger-industrial">删除</a-button>
              </a-popconfirm>
            </span>
          </a-table>
        </a-card>

        <a-card :bordered="false" class="xbom-glass-card empty-card" v-else>
          <a-empty description="请在左侧选择字典类目以查看详细数据项" />
        </a-card>
      </a-col>
    </a-row>

    <dict-modal ref="modal" @ok="handleOk" />
    <item-modal ref="itemModal" @ok="handleItemOk" />
  </page-header-wrapper>
</template>

<script>
import { getSystemDictList, deleteSystemDict, getSystemDictItemList, saveSystemDictItem, deleteSystemDictItem } from '@/api/system'
import DictModal from './modules/DictModal'

// Item Modal Inline Definition
const ItemModal = {
  name: 'ItemModal',
  data () { return { visible: false, model: {}, title: '数据项配置' } },
  methods: {
    add (dictId) { this.edit({ id: 0, dictId, label: '', value: '', sort: 1, status: 1 }) },
    edit (record) { this.model = Object.assign({}, record); this.visible = true },
    handleSubmit () { this.$emit('ok', this.model); this.visible = false },
    handleCancel () { this.visible = false }
  },
  render () {
    return (
      <a-modal title={this.title} v-model={this.visible} onOk={this.handleSubmit} wrapClassName="xbom-glass-modal">
        <a-form-model layout="vertical">
          <a-form-model-item label="显示名称"><a-input v-model={this.model.label} /></a-form-model-item>
          <a-form-model-item label="对应数值"><a-input v-model={this.model.value} /></a-form-model-item>
          <a-form-model-item label="排序权重"><a-input-number v-model={this.model.sort} style="width: 100%" /></a-form-model-item>
        </a-form-model>
      </a-modal>
    )
  }
}

export default {
  name: 'DictList',
  components: {
    DictModal,
    ItemModal
  },
  data () {
    return {
      queryParam: {},
      selectedDict: {},
      dataSource: [],
      loading: false,
      itemData: [],
      columns: [
        {
          title: '字典项',
          dataIndex: 'name',
          scopedSlots: { customRender: 'name' }
        },
        {
          title: '操作',
          dataIndex: 'action',
          width: '80px',
          align: 'right',
          scopedSlots: { customRender: 'action' }
        }
      ],
      itemColumns: [
        { title: '显示文本', dataIndex: 'label' },
        { title: '对应数值', dataIndex: 'value', customRender: (t) => <code class="xbom-tech-font">{t}</code> },
        { title: '排序', dataIndex: 'sort', width: '80px', align: 'center' },
        { title: '状态', dataIndex: 'status', width: '100px', scopedSlots: { customRender: 'status' } },
        { title: '操作', dataIndex: 'action', width: '140px', align: 'center', scopedSlots: { customRender: 'action' } }
      ]
    }
  },
  created () {
    this.loadData()
  },
  methods: {
    loadData () {
      this.loading = true
      getSystemDictList(this.queryParam).then(res => {
        if (res && res.success && res.result) {
          this.dataSource = res.result.data || []
        } else {
          this.dataSource = []
        }
      }).catch(err => {
        console.error(err)
        this.$message.error('加载失败')
      }).finally(() => {
        this.loading = false
      })
    },
    masterRowClick (record) {
      return {
        on: {
          click: () => {
            this.selectedDict = record
            this.loadItemData(record.id)
          }
        }
      }
    },
    loadItemData (dictId) {
      getSystemDictItemList({ dictId }).then(res => {
        this.itemData = res.result.data
      })
    },
    handleAdd () {
      this.$refs.modal.add()
    },
    handleEdit (record) {
      this.$refs.modal.edit(record)
    },
    handleOk () {
      this.loadData()
    },
    handleDelete (record) {
      deleteSystemDict({ id: record.id }).then(() => {
        this.loadData()
      })
    },
    handleItemAdd () {
      this.$refs.itemModal.add(this.selectedDict.id)
    },
    handleItemEdit (record) {
      this.$refs.itemModal.edit(record)
    },
    handleItemOk (values) {
      saveSystemDictItem(values).then(() => {
        this.loadItemData(this.selectedDict.id)
      })
    },
    handleItemDelete (record) {
      deleteSystemDictItem({ id: record.id }).then(() => {
        this.loadItemData(this.selectedDict.id)
      })
    }
  }
}
</script>

<style lang="less" scoped>
.dict-side-card {
  height: calc(100vh - 180px);
  overflow-y: auto;
}

.side-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  .header-title {
    font-size: 15px;
    font-weight: 600;
    color: #003a8c;
  }
}

.side-search {
  margin-bottom: 16px;
}

.dict-item-cell {
  padding: 4px 0;
  cursor: pointer;

  .dict-name {
    font-weight: 500;
    color: #262626;
  }

  .dict-code {
    font-size: 11px;
    color: #8c8c8c;
    margin-top: 2px;
  }

  &.active {
    .dict-name { color: #1890ff; }
  }
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .header-info {
    display: flex;
    align-items: center;
    gap: 8px;

    .header-tag { color: #8c8c8c; font-size: 13px; }
    .header-val { font-size: 16px; font-weight: 600; color: #003a8c; }
    .header-code { font-size: 12px; color: #595959; background: #f5f5f5; padding: 2px 6px; }
  }
}

.empty-card {
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-danger-industrial {
  color: #f5222d;
  &:hover { color: #cf1322; }
}

.dict-master-table {
  :deep(.ant-table-row) {
    cursor: pointer;
    &.ant-table-row-selected {
      background-color: #f0f5ff;
    }
  }
}
</style>

<style lang="less" scoped>
.dict-name {
  font-weight: 600;
  color: #0f172a;
}

.btn-danger {
  color: #ef4444;
  &:hover {
    color: #dc2626;
  }
}

.table-operator {
  margin-bottom: 16px;
}
</style>
