<template>
  <page-header-wrapper class="xbom-body-font xbom-fixed-layout">
    <a-card :bordered="false" class="xbom-glass-card xbom-compact-card">
      <!-- Consolidated Header: Search + Operators -->
      <div class="fixed-top-section">
        <div class="table-page-search-wrapper">
          <a-form layout="inline">
            <a-row :gutter="12" type="flex" align="middle">
              <a-col :xl="5" :lg="6" :md="8" :sm="24">
                <a-form-item label="工号/姓名">
                  <a-input v-model="queryParam.username" placeholder="输入关键字" allowClear />
                </a-form-item>
              </a-col>
              <a-col :xl="5" :lg="6" :md="8" :sm="24">
                <a-form-item label="状态">
                  <a-select v-model="queryParam.status" placeholder="全部" :default-value="0">
                    <a-select-option :value="0">全部</a-select-option>
                    <a-select-option :value="1">在职 (Active)</a-select-option>
                    <a-select-option :value="2">离职 (Resigned)</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :xl="14" :lg="12" :md="8" :sm="24" class="operator-col">
                <span class="table-page-search-submitButtons">
                  <a-button type="primary" icon="search" @click="loadData(1)">查询</a-button>
                  <a-button style="margin-left: 8px" icon="redo" @click="() => { this.queryParam = {}; loadData(1) }">重置</a-button>
                  <a-divider type="vertical" style="margin: 0 16px" />
                  <a-button type="primary" icon="plus" @click="handleAdd" class="btn-industrial-primary">新增人员</a-button>
                  <a-button icon="export" style="margin-left: 8px">导出</a-button>
                </span>
              </a-col>
            </a-row>
          </a-form>
        </div>
      </div>

    <!-- Scrollable Table Body -->
      <div class="table-scroll-wrapper">
        <a-table
          ref="table"
          size="small"
          rowKey="id"
          :columns="columns"
          :dataSource="dataSource"
          :pagination="ipagination"
          :loading="loading"
          :rowSelection="rowSelection"
          @change="handleTableChange"
          class="xbom-industrial-table"
          :scroll="{ y: 'calc(100vh - 260px)', x: 1100 }"
        >
          <span slot="status" slot-scope="text">
            <a-tag :color="text === 1 ? 'blue' : 'gray'" class="industrial-status-tag">
              {{ text === 1 ? '在职' : '离职' }}
            </a-tag>
          </span>

          <span slot="action" slot-scope="text, record">
            <div class="action-group">
              <a @click="handleEdit(record)" class="industrial-link">编辑</a>
              <a-divider type="vertical" />
              <a class="industrial-link">设置角色</a>
            </div>
          </span>
        </a-table>
      </div>
    </a-card>

    <user-modal ref="modal" @ok="handleOk" />
  </page-header-wrapper>
</template>

<script>
import { getSystemUserList, saveSystemUser, deleteSystemUser } from '@/api/system'
import UserModal from './modules/UserModal'

export default {
  name: 'UserList',
  components: {
    UserModal
  },
  data () {
    return {
      // Columns definition
      columns: [
        {
          title: '工号',
          dataIndex: 'id',
          width: 90,
          align: 'center',
          fixed: 'left',
          customRender: (text) => {
            const val = text !== null && text !== undefined ? text.toString().padStart(4, '0') : ''
            return <span class="xbom-tech-font">{val}</span>
          }
        },
        {
          title: '姓名',
          dataIndex: 'username',
          width: 130,
          ellipsis: true
        },
        {
          title: '邮件',
          dataIndex: 'email',
          width: 220,
          ellipsis: true,
          customRender: (text) => text || 'N/A'
        },
        {
          title: '角色',
          dataIndex: 'roleName',
          width: 140,
          ellipsis: true,
          customRender: (text) => text || '-'
        },
        {
          title: '状态',
          dataIndex: 'status',
          width: 100,
          align: 'center',
          scopedSlots: { customRender: 'status' }
        },
        {
          title: '更新日期',
          dataIndex: 'updatedAt',
          width: 180,
          sorter: true,
          align: 'center'
        },
        {
          title: '操作',
          dataIndex: 'action',
          width: 140,
          align: 'center',
          fixed: 'right',
          scopedSlots: { customRender: 'action' }
        }
      ],
      // Query parameters
      queryParam: {},
      // Table data
      dataSource: [],
      loading: false,
      ipagination: {
        current: 1,
        pageSize: 10,
        showTotal: (total, range) => (range && range.length === 2) ? `${range[0]}-${range[1]} 共 ${total} 条` : `共 ${total} 条`,
        showQuickJumper: true,
        showSizeChanger: true,
        total: 0
      },
      selectedRowKeys: [],
      selectedRows: []
    }
  },
  created () {
    this.loadData()
  },
  computed: {
    rowSelection () {
      return {
        selectedRowKeys: this.selectedRowKeys,
        onChange: this.onSelectChange,
        columnWidth: 50
      }
    }
  },
  methods: {
    loadData (arg) {
      if (arg === 1) {
        this.ipagination.current = 1
      }
      const params = Object.assign({}, this.queryParam)
      params.pageNo = this.ipagination.current
      params.pageSize = this.ipagination.pageSize
      this.loading = true
      getSystemUserList(params).then(res => {
        if (res && res.success && res.result) {
          this.dataSource = res.result.data || []
          this.ipagination.total = res.result.totalCount || 0
        } else {
          this.dataSource = []
          this.ipagination.total = 0
          if (res && res.message) {
            this.$message.warning(res.message)
          }
        }
      }).catch(err => {
        this.$message.error('数据加载失败')
        console.error(err)
      }).finally(() => {
        this.loading = false
      })
    },
    handleTableChange (pagination, filters, sorter) {
      this.ipagination = pagination
      this.loadData()
    },
    handleAdd () {
      this.$refs.modal.add()
    },
    handleEdit (record) {
      this.$refs.modal.edit(record)
    },
    handleOk (values) {
      saveSystemUser(values).then(res => {
        if (res.success) {
          this.$message.success('保存成功')
          this.$refs.modal.closeLoading()
          this.loadData()
        } else {
          this.$message.error(res.message)
          this.$refs.modal.closeLoading()
        }
      }).catch(() => {
        this.$refs.modal.closeLoading()
      })
    },
    handleDelete (record) {
      deleteSystemUser({ id: record.id }).then(res => {
        if (res.result) {
          this.$message.success('已移除')
          this.loadData()
        }
      })
    },
    onSelectChange (selectedRowKeys, selectedRows) {
      this.selectedRowKeys = selectedRowKeys
      this.selectedRows = selectedRows
    }
  }
}
</script>

<style lang="less" scoped>
.xbom-fixed-layout {
  height: calc(100vh - 120px);
  overflow: hidden;

  :deep(.ant-card-body) {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 8px 16px !important; // Further reduced padding for compactness
  }
}

.fixed-top-section {
  flex-shrink: 0;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 8px;
}

.operator-col {
  text-align: right;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.table-scroll-wrapper {
  flex: 1;
  overflow: hidden;
  border: 1px solid #f0f0f0;
  background: #fff;
}

.xbom-industrial-table {
  :deep(.ant-table-small) {
    border: none;
  }

  :deep(.ant-table-thead > tr > th) {
    padding: 8px 12px !important;
    background: #fafafa !important;
    font-size: 13px;
    border-right: 1px solid #f0f0f0;
    color: #262626;
    font-weight: 600;
  }

  :deep(.ant-table-tbody > tr > td) {
    padding: 4px 12px !important; // Narrower rows as requested
    font-size: 13px;
    border-right: 1px solid #f0f0f0;
    height: 40px; // Consistent row height
  }

  :deep(.ant-table-pagination) {
    margin: 8px 0 !important;
    padding: 0 16px;
  }
}

.industrial-status-tag {
  margin: 0;
  border-radius: 2px;
  font-size: 11px;
  padding: 0 6px;
  line-height: 18px;
  border: 1px solid #d9d9d9;
}

.action-group {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  .industrial-link {
    font-size: 13px;
    color: #1890ff;
    &:hover {
      color: #003a8c;
    }
  }
}

.table-page-search-wrapper {
  .ant-form-item {
    margin-bottom: 0px; // Compactly placed in the row
    display: flex;
    :deep(.ant-form-item-label) {
      line-height: 32px;
      padding-right: 8px;
      color: #595959;
    }
    :deep(.ant-form-item-control-wrapper) {
      flex: 1;
    }
  }
}

.btn-industrial-primary {
  border-radius: 2px;
  background-color: #003a8c;
  border-color: #003a8c;
  &:hover {
    background-color: #002766;
    border-color: #002766;
  }
}
</style>
