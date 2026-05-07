<template>
  <page-header-wrapper class="xbom-body-font">
    <a-card :bordered="false" class="xbom-glass-card">
      <div class="table-page-search-wrapper">
        <a-form layout="inline">
          <a-row :gutter="24">
            <a-col :md="8" :sm="24">
              <a-form-item label="名称">
                <a-input v-model="queryParam.name" placeholder="请输入权限名称" />
              </a-form-item>
            </a-col>
            <a-col :md="8" :sm="24">
              <span class="table-page-search-submitButtons">
                <a-button type="primary" @click="loadData(1)">查询</a-button>
                <a-button style="margin-left: 8px" @click="() => { this.queryParam = {}; loadData(1) }">重置</a-button>
              </span>
            </a-col>
          </a-row>
        </a-form>
      </div>

      <div class="table-operator">
        <a-button type="primary" icon="plus" @click="handleAdd">新建权限</a-button>
      </div>

      <a-table
        ref="table"
        size="middle"
        rowKey="id"
        :columns="columns"
        :dataSource="dataSource"
        :pagination="ipagination"
        :loading="loading"
        @change="handleTableChange"
      >
        <span slot="permission_key" slot-scope="text">
          <code class="xbom-tech-font permission-code">{{ text }}</code>
        </span>
        <span slot="type" slot-scope="text">
          <a-tag :color="text === 1 ? 'cyan' : 'blue'" class="type-tag">
            <a-icon :type="text === 1 ? 'menu' : 'thunderbolt'" style="margin-right: 4px" />
            {{ text === 1 ? '菜单' : '操作' }}
          </a-tag>
        </span>
        <span slot="action" slot-scope="text, record">
          <template>
            <a-button type="link" size="small" icon="edit" @click="handleEdit(record)">编辑</a-button>
            <a-divider type="vertical" />
            <a-popconfirm title="确定要删除吗？" @confirm="handleDelete(record)">
              <a-button type="link" size="small" icon="delete" class="btn-danger">删除</a-button>
            </a-popconfirm>
          </template>
        </span>
      </a-table>
    </a-card>

    <permission-modal ref="modal" @ok="handleOk" />
  </page-header-wrapper>
</template>

<script>
import { getSystemPermissionList, saveSystemPermission, deleteSystemPermission } from '@/api/system'
import PermissionModal from './modules/PermissionModal'

export default {
  name: 'PermissionList',
  components: {
    PermissionModal
  },
  data () {
    return {
      queryParam: {},
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
      columns: [
        {
          title: '权限名称',
          dataIndex: 'name',
          customRender: (text) => <span style="font-weight: 600; color: #1e293b;">{text}</span>
        },
        {
          title: '权限标识',
          dataIndex: 'permission',
          scopedSlots: { customRender: 'permission_key' }
        },
        {
          title: '类型',
          dataIndex: 'type',
          scopedSlots: { customRender: 'type' }
        },
        {
          title: '描述',
          dataIndex: 'description',
          ellipsis: true
        },
        {
          title: '操作',
          dataIndex: 'action',
          width: '180px',
          scopedSlots: { customRender: 'action' }
        }
      ]
    }
  },
  created () {
    this.loadData()
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
      getSystemPermissionList(params).then(res => {
        if (res && res.success && res.result) {
          this.dataSource = res.result.data || []
          this.ipagination.total = res.result.totalCount || 0
        } else {
          this.dataSource = []
          this.ipagination.total = 0
        }
      }).catch(err => {
        console.error(err)
        this.$message.error('加载失败')
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
      saveSystemPermission(values).then(res => {
        if (res.success) {
          this.$message.success(values.id > 0 ? '编辑成功' : '创建成功')
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
      deleteSystemPermission({ id: record.id }).then(res => {
        if (res.result) {
          this.$message.success('删除成功')
          this.loadData()
        }
      })
    }
  }
}
</script>

<style lang="less" scoped>
.permission-code {
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
  color: #475569;
  font-size: 13px;
  border: 1px solid #e2e8f0;
}

.type-tag {
  padding: 2px 10px;
  border-radius: 6px;
  font-weight: 600;
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
