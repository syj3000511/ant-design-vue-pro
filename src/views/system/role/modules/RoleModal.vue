<template>
  <a-drawer
    :title="title"
    :width="800"
    :visible="visible"
    :confirmLoading="confirmLoading"
    @close="handleCancel"
    wrapClassName="xbom-industrial-drawer"
  >
    <a-form-model
      ref="form"
      :model="mdl"
      :rules="rules"
      layout="vertical"
      class="xbom-body-font"
    >
      <div class="form-section-title">角色基本定义</div>
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-model-item label="角色识别码 (Unique Code)" prop="id">
            <a-input v-model="mdl.id" placeholder="例如: ROLE_QA" :disabled="!!mdl.id" class="xbom-tech-font" />
          </a-form-model-item>
        </a-col>
        <a-col :span="12">
          <a-form-model-item label="角色显示名称 (Display Name)" prop="name">
            <a-input v-model="mdl.name" placeholder="例如: 质量管理专员" />
          </a-form-model-item>
        </a-col>
      </a-row>

      <a-form-model-item label="职能描述 (Description)" prop="describe">
        <a-textarea v-model="mdl.describe" placeholder="说明该角色在生产流程中的职责范围..." :rows="2" />
      </a-form-model-item>

      <div class="form-section-title">权限受控矩阵 (Authorization Matrix)</div>
      <div class="permission-matrix">
        <div v-for="permission in permissions" :key="permission.id" class="matrix-row">
          <div class="row-header">
            <a-checkbox
              :indeterminate="permission.indeterminate"
              :checked="permission.checkedAll"
              @change="e => onChangeCheckAll(e, permission)"
            >
              {{ permission.name }}
            </a-checkbox>
          </div>
          <div class="row-actions">
            <a-checkbox-group
              v-model="permission.selected"
              :options="permission.actionsOptions"
              @change="() => onChangeCheck(permission)"
            />
          </div>
        </div>
      </div>
    </a-form-model>

    <div class="drawer-footer">
      <a-button :style="{ marginRight: '8px' }" @click="handleCancel">取消</a-button>
      <a-button type="primary" :loading="confirmLoading" @click="handleOk">提交配置</a-button>
    </div>
  </a-drawer>
</template>

<script>
import { getPermissions } from '@/api/manage'

export default {
  name: 'RoleModal',
  data () {
    return {
      title: '角色权限配置',
      visible: false,
      confirmLoading: false,
      mdl: {
        id: '',
        name: '',
        describe: '',
        status: 1
      },
      rules: {
        id: [{ required: true, message: '识别码不能为空', trigger: 'blur' }],
        name: [{ required: true, message: '名称不能为空', trigger: 'blur' }]
      },
      permissions: []
    }
  },
  created () {
    this.loadPermissions()
  },
  methods: {
    add () {
      this.edit({ id: '', status: 1, name: '', describe: '', permissions: [] })
    },
    edit (record) {
      this.mdl = Object.assign({}, record)
      this.visible = true
      this.title = record.id ? '编辑角色权限' : '定义新职能角色'

      // 处理权限勾选状态
      if (this.permissions.length > 0) {
        this.fillPermissions(record.permissions || [])
      }
    },
    fillPermissions (savedPermissions) {
      const permissionsAction = {}
      savedPermissions.forEach(p => {
        permissionsAction[p.permissionId] = p.actionEntitySet.map(a => a.action)
      })

      this.permissions.forEach(p => {
        p.selected = permissionsAction[p.id] || []
        this.onChangeCheck(p)
      })
    },
    handleCancel () {
      this.visible = false
    },
    handleOk () {
      this.$refs.form.validate(valid => {
        if (valid) {
          this.confirmLoading = true
          // 封装选中的权限数据返回给父组件
          const selectedPermissions = this.permissions
            .filter(p => p.selected.length > 0)
            .map(p => ({
              permissionId: p.id,
              actionEntitySet: p.selected.map(action => ({ action }))
            }))

          const submitData = { ...this.mdl, permissions: selectedPermissions }
          console.log('Submit Role Data:', submitData)

          // 模拟提交
          setTimeout(() => {
            this.confirmLoading = false
            this.visible = false
            this.$emit('ok', submitData)
          }, 800)
        }
      })
    },
    onChangeCheck (permission) {
      permission.indeterminate = !!permission.selected.length && (permission.selected.length < permission.actionsOptions.length)
      permission.checkedAll = permission.selected.length === permission.actionsOptions.length
    },
    onChangeCheckAll (e, permission) {
      Object.assign(permission, {
        selected: e.target.checked ? permission.actionsOptions.map(obj => obj.value) : [],
        indeterminate: false,
        checkedAll: e.target.checked
      })
    },
    loadPermissions () {
      getPermissions().then(res => {
        this.permissions = res.result.map(p => {
          const options = JSON.parse(p.actionData) || []
          return {
            ...p,
            checkedAll: false,
            selected: [],
            indeterminate: false,
            actionsOptions: options.map(opt => ({ label: opt.describe, value: opt.action }))
          }
        })
        if (this.mdl.id) {
          this.fillPermissions(this.mdl.permissions || [])
        }
      })
    }
  }
}
</script>

<style lang="less" scoped>
.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #003a8c;
  margin: 24px 0 16px;
  padding-left: 8px;
  border-left: 4px solid #003a8c;
  background: linear-gradient(90deg, #f0f5ff 0%, transparent 100%);
}

.permission-matrix {
  border: 1px solid #f0f0f0;
  border-radius: 2px;

  .matrix-row {
    display: flex;
    border-bottom: 1px solid #f0f0f0;
    &:last-child { border-bottom: none; }

    .row-header {
      width: 180px;
      padding: 12px 16px;
      background: #fafafa;
      border-right: 1px solid #f0f0f0;
      flex-shrink: 0;
      font-weight: 600;
    }

    .row-actions {
      flex: 1;
      padding: 12px 16px;

      :deep(.ant-checkbox-group) {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
      }
    }
  }
}

.drawer-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 100%;
  border-top: 1px solid #f0f0f0;
  padding: 10px 16px;
  background: #fff;
  text-align: right;
  z-index: 1;
}
</style>
