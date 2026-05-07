<template>
  <page-header-wrapper class="xbom-body-font">
    <a-card :bordered="false" class="xbom-glass-card">
      <div class="table-page-search-wrapper">
        <a-form layout="inline">
          <a-row :gutter="16">
            <a-col :md="8" :sm="24">
              <a-form-item label="代码/名称">
                <a-input placeholder="输入角色识别码或名称" v-model="queryParam.id" allowClear />
              </a-form-item>
            </a-col>
            <a-col :md="8" :sm="24">
              <a-form-item label="受控状态">
                <a-select placeholder="选择状态" v-model="queryParam.status" :default-value="0">
                  <a-select-option :value="0">全部</a-select-option>
                  <a-select-option :value="1">正常 (Enabled)</a-select-option>
                  <a-select-option :value="2">锁定 (Locked)</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :md="8" :sm="24">
              <span class="table-page-search-submitButtons">
                <a-button type="primary" icon="search" @click="loadData(1)">检索</a-button>
                <a-button style="margin-left: 8px" icon="redo" @click="() => { queryParam = {}; loadData(1) }">重置</a-button>
              </span>
            </a-col>
          </a-row>
        </a-form>
      </div>

      <div class="table-operator">
        <a-button type="primary" icon="safety" @click="handleAdd">定义新角色</a-button>
        <a-button icon="audit">权限审计</a-button>
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
        class="xbom-tech-table"
      >
        <!-- Expanded Permission View -->
        <div
          slot="expandedRowRender"
          slot-scope="record"
          class="permission-detail-box">
          <div class="box-title"><a-icon type="deployment-unit" /> 关联权限矩阵</div>
          <a-row :gutter="[24, 16]">
            <a-col :span="12" v-for="(role, index) in record.permissions" :key="index">
              <div class="permission-item">
                <span class="perm-label">{{ role.permissionName }}:</span>
                <div class="perm-tags" v-if="role.actionEntitySet.length > 0">
                   <a-tag v-for="(action, k) in role.actionEntitySet" :key="k" class="industrial-tag">
                    {{ action.describe }}
                  </a-tag>
                </div>
                <span class="perm-none" v-else>无操作权限</span>
              </div>
            </a-col>
          </a-row>
        </div>

        <span slot="status" slot-scope="text">
          <a-badge :status="text === 1 ? 'success' : 'error'" :text="text === 1 ? '正常运行' : '锁定执行'" />
        </span>

        <span slot="action" slot-scope="text, record">
          <div class="action-buttons">
            <a-button type="link" size="small" icon="edit" @click="handleEdit(record)">编辑</a-button>
            <a-divider type="vertical" />
            <a-dropdown>
              <a-button type="link" size="small">
                更多 <a-icon type="down" />
              </a-button>
              <a-menu slot="overlay" class="xbom-industrial-menu">
                <a-menu-item key="status">
                  <a-icon :type="record.status === 1 ? 'lock' : 'unlock'" /> {{ record.status === 1 ? '停用角色' : '启用角色' }}
                </a-menu-item>
                <a-menu-item key="delete" class="menu-danger">
                  <a-icon type="delete" /> 物理移除
                </a-menu-item>
              </a-menu>
            </a-dropdown>
          </div>
        </span>
      </a-table>

      <role-modal ref="modal" @ok="handleOk"></role-modal>
    </a-card>
  </page-header-wrapper>
</template>

<script>
import RoleModal from './modules/RoleModal'

export default {
  name: 'RoleList',
  components: {
    RoleModal
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
          title: '角色标识编码',
          dataIndex: 'id',
          width: '180px',
          customRender: (text) => <code class="xbom-tech-font" style="color: #003a8c;">{text}</code>
        },
        {
          title: '职能角色名称',
          dataIndex: 'name',
          customRender: (text) => <span style="font-weight: 600;">{text}</span>
        },
        {
          title: '系统状态',
          dataIndex: 'status',
          width: '120px',
          scopedSlots: { customRender: 'status' }
        },
        {
          title: '定义日期',
          dataIndex: 'createTime',
          sorter: true,
          width: '180px'
        },
        {
          title: '控制中心',
          width: '180px',
          dataIndex: 'action',
          align: 'center',
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
      this.$http.get('/role', { params }).then(res => {
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
    handleOk () {
      this.$message.success('角色权限配置已更新完成')
      this.loadData()
    }
  }
}
</script>

<style lang="less" scoped>
.permission-detail-box {
  background: #fafafa;
  padding: 20px;
  border: 1px solid #f0f0f0;
  border-radius: 2px;

  .box-title {
    font-size: 13px;
    font-weight: 600;
    color: #595959;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;

    .anticon {
      color: #1890ff;
    }
  }
}

.permission-item {
  display: flex;
  align-items: flex-start;
  font-size: 13px;

  .perm-label {
    width: 100px;
    color: #8c8c8c;
    flex-shrink: 0;
    padding-top: 4px;
  }

  .perm-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .perm-none {
    color: #bfbfbf;
    font-style: italic;
  }
}

.industrial-tag {
  background: #fff;
  border-color: #d9d9d9;
  color: #595959;
  border-radius: 2px;
  margin: 0;
  font-size: 11px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
}

.table-operator {
  margin-bottom: 16px;
  display: flex;
  gap: 8px;
}

.menu-danger {
  color: #f5222d;
  &:hover {
    background-color: #fff1f0;
  }
}
</style>
